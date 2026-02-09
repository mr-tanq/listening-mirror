export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- CORS (IMPORTANT for GitHub Pages) ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "listening-mirror-worker" }, 200);
      }

      if (path === "/api/now") {
        const data = await lastfmNowPlaying(env);
        return json({ track: data }, 200);
      }

      if (path === "/api/top") {
        const type = (url.searchParams.get("type") || "tracks").toLowerCase();
        const period = (url.searchParams.get("period") || "7day").toLowerCase();
        const limit = clampInt(url.searchParams.get("limit"), 1, 20, 5);

        if (type !== "tracks") {
          return json({ error: "Only type=tracks is supported." }, 400);
        }

        const tracks = await lastfmTopTracks(env, period, limit);
        return json({ tracks }, 200);
      }

      if (path === "/api/reflection") {
        // We keep this strictly factual.
        // If OPENAI_API_KEY is missing, we return a clear message (no made-up text).
        const period = (url.searchParams.get("period") || "7day").toLowerCase();
        const limit = clampInt(url.searchParams.get("limit"), 1, 20, 10);

        const tracks = await lastfmTopTracks(env, period, limit);

        if (!env.OPENAI_API_KEY) {
          return json({
            period,
            reflection:
              "Reflection is disabled because OPENAI_API_KEY is not set in Cloudflare Worker secrets.",
            top_tracks: tracks.map(t => ({
              name: t.name,
              artist: t.artist,
              playcount: t.playcount
            }))
          }, 200);
        }

        const reflection = await aiReflection(env, { period, tracks });
        return json({ period, reflection }, 200);
      }

      return json({ error: "Not found." }, 404);
    } catch (err) {
      return json({ error: String(err?.message || err) }, 500);
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
// ----------------------
// Last.fm helpers
// ----------------------

function getLastfmKey(env) {
  // You have both LASTFM_API_KEY (secret) and LASTFM_KEY (plaintext) in screenshots.
  return env.LASTFM_API_KEY || env.LASTFM_KEY || "";
}

function getLastfmUser(env) {
  return env.LASTFM_USER || "";
}

async function lastfmNowPlaying(env) {
  const apiKey = getLastfmKey(env);
  const user = getLastfmUser(env);
  if (!apiKey) throw new Error("Missing LASTFM_API_KEY (or LASTFM_KEY).");
  if (!user) throw new Error("Missing LASTFM_USER.");

  // Use user.getrecenttracks
  const endpoint = new URL("https://ws.audioscrobbler.com/2.0/");
  endpoint.searchParams.set("method", "user.getrecenttracks");
  endpoint.searchParams.set("user", user);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "1");

  const res = await fetch(endpoint.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Last.fm error (recenttracks) HTTP ${res.status}`);
  const data = await res.json();

  const t = data?.recenttracks?.track?.[0];
  if (!t) return { name: "—", artist: "—", image: "" };

  const name = t?.name || "—";
  const artist = t?.artist?.["#text"] || t?.artist?.name || "—";
  const album = t?.album?.["#text"] || "";
  const nowplaying = t?.["@attr"]?.nowplaying === "true";

  const image = pickLastfmImage(t?.image);
  const ts = t?.date?.uts ? Number(t.date.uts) : null;

  return { name, artist, album, nowplaying, image, uts: ts };
}

async function lastfmTopTracks(env, period, limit) {
  const apiKey = getLastfmKey(env);
  const user = getLastfmUser(env);
  if (!apiKey) throw new Error("Missing LASTFM_API_KEY (or LASTFM_KEY).");
  if (!user) throw new Error("Missing LASTFM_USER.");

  const endpoint = new URL("https://ws.audioscrobbler.com/2.0/");
  endpoint.searchParams.set("method", "user.gettoptracks");
  endpoint.searchParams.set("user", user);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("period", period);
  endpoint.searchParams.set("limit", String(limit));

  const res = await fetch(endpoint.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Last.fm error (toptracks) HTTP ${res.status}`);
  const data = await res.json();

  const arr = data?.toptracks?.track || [];
  return arr.map((t) => ({
    name: t?.name || "—",
    artist: t?.artist?.name || "—",
    playcount: t?.playcount ? Number(t.playcount) : null,
    image: pickLastfmImage(t?.image),
    url: t?.url || "",
  }));
}

function pickLastfmImage(images) {
  // Last.fm returns array like [{#text:"...", size:"small"}, ...]
  if (!Array.isArray(images)) return "";
  const preferred = ["extralarge", "large", "medium", "small"];
  for (const size of preferred) {
    const found = images.find((x) => x?.size === size && x?.["#text"]);
    if (found?.["#text"]) return found["#text"];
  }
  const any = images.find((x) => x?.["#text"]);
  return any?.["#text"] || "";
}
// ----------------------
// OpenAI reflection (factual, based on provided tracks only)
// ----------------------

async function aiReflection(env, { period, tracks }) {
  // No inventions: we provide the model ONLY the tracks list and ask to summarize patterns.
  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You write a short factual reflection based strictly on the provided Last.fm top tracks list. " +
          "Do not invent listening times, moods, genres, or life events. " +
          "Only mention what can be inferred directly: repeated artists, most-played tracks, concentration vs variety."
      },
      {
        role: "user",
        content:
          `Period: ${period}\n` +
          "Top tracks (name — artist — playcount):\n" +
          tracks
            .map((t, i) => `${i + 1}. ${t.name} — ${t.artist} — ${t.playcount ?? "?"}`)
            .join("\n")
      }
    ]
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI error HTTP ${res.status}${t ? " — " + t.slice(0, 200) : ""}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || "No reflection returned.";
}
