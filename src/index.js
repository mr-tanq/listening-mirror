export default {
  async fetch(request, env, ctx) {
    // --- CORS (fixes "Failed to load" from GitHub Pages) ---
    const origin = request.headers.get("Origin") || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Basic sanity endpoint
      if (path === "/api/health") {
        return json({ ok: true, ts: Date.now() }, corsHeaders);
      }

      // --- Required env vars ---
      // Set these in Cloudflare Worker "Settings -> Variables and secrets"
      // LASTFM_API_KEY
      // LASTFM_USER
      const LASTFM_API_KEY = env.LASTFM_API_KEY;
      const LASTFM_USER = env.LASTFM_USER;

      if (!LASTFM_API_KEY || !LASTFM_USER) {
        return json(
          { error: "Missing env vars: LASTFM_API_KEY and/or LASTFM_USER" },
          corsHeaders,
          500
        );
      }

      // Helper: call Last.fm
      async function lastfm(params) {
        const base = "https://ws.audioscrobbler.com/2.0/";
        const qs = new URLSearchParams({
          api_key: LASTFM_API_KEY,
          user: LASTFM_USER,
          format: "json",
          ...params,
        });
        const r = await fetch(`${base}?${qs.toString()}`);
        if (!r.ok) throw new Error("Last.fm HTTP " + r.status);
        return await r.json();
      }

      function pickImage(images) {
        // Last.fm returns array: [{#text,size}, ...]
        if (!Array.isArray(images)) return "";
        // prefer "extralarge" then "large" then last non-empty
        const preferred = ["extralarge", "large", "medium", "small"];
        for (const s of preferred) {
          const it = images.find((x) => x && x.size === s && x["#text"]);
          if (it && it["#text"]) return it["#text"];
        }
        const any = images.find((x) => x && x["#text"]);
        return any ? any["#text"] : "";
      }

      // --- /api/now ---
      // returns: { artist, name, album, image, nowPlaying }
      if (path === "/api/now") {
        const data = await lastfm({
          method: "user.getrecenttracks",
          limit: "1",
        });

        const t = data?.recenttracks?.track?.[0];
        if (!t) return json({ nowPlaying: false }, corsHeaders);

        const artist = t?.artist?.["#text"] || t?.artist?.name || "";
        const name = t?.name || "";
        const album = t?.album?.["#text"] || "";
        const image = pickImage(t?.image);
        const nowPlaying = t?.["@attr"]?.nowplaying === "true";

        return json({ artist, name, album, image, nowPlaying }, corsHeaders);
      }

      // --- /api/recent?limit=40 ---
      // returns: { tracks: [{ artist, name, album, image, nowPlaying }] }
      if (path === "/api/recent") {
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 40);
        const data = await lastfm({
          method: "user.getrecenttracks",
          limit: String(limit),
        });

        const tracks = (data?.recenttracks?.track || []).map((t) => ({
          artist: t?.artist?.["#text"] || t?.artist?.name || "",
          name: t?.name || "",
          album: t?.album?.["#text"] || "",
          image: pickImage(t?.image),
          nowPlaying: t?.["@attr"]?.nowplaying === "true",
        }));

        return json({ tracks }, corsHeaders);
      }

      // --- /api/top?type=tracks|artists&period=7day&limit=12 ---
      if (path === "/api/top") {
        const type = (url.searchParams.get("type") || "").toLowerCase();
        const period = url.searchParams.get("period") || "7day";
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 12);

        if (type === "tracks") {
          const data = await lastfm({
            method: "user.gettoptracks",
            period,
            limit: String(limit),
          });

          const tracks = (data?.toptracks?.track || []).map((t) => ({
            artist: t?.artist?.name || "",
            name: t?.name || "",
            playcount: toInt(t?.playcount),
            image: pickImage(t?.image),
          }));

          return json({ tracks }, corsHeaders);
        }

        if (type === "artists") {
          const data = await lastfm({
            method: "user.gettopartists",
            period,
            limit: String(limit),
          });

          const artists = (data?.topartists?.artist || []).map((a) => ({
            name: a?.name || "",
            playcount: toInt(a?.playcount),
            image: pickImage(a?.image),
          }));

          return json({ artists }, corsHeaders);
        }

        return json({ error: "Invalid type. Use tracks or artists." }, corsHeaders, 400);
      }

      // --- /api/reflection (AUTO, no need user input) ---
      // We generate a structured "reflection" from last 7 days top tracks/artists.
      if (path === "/api/reflection") {
        // optional POST body: { focus: "" } (ignored if empty)
        let focus = "";
        if (request.method === "POST") {
          try {
            const body = await request.json();
            focus = (body?.focus || "").trim();
          } catch {}
        }

        const [topTracks, topArtists] = await Promise.all([
          lastfm({ method: "user.gettoptracks", period: "7day", limit: "10" }),
          lastfm({ method: "user.gettopartists", period: "7day", limit: "7" }),
        ]);

        const tracks = (topTracks?.toptracks?.track || []).map((t) => ({
          artist: t?.artist?.name || "",
          name: t?.name || "",
          playcount: toInt(t?.playcount),
        }));

        const artists = (topArtists?.topartists?.artist || []).map((a) => ({
          name: a?.name || "",
          playcount: toInt(a?.playcount),
        }));

        const text = buildReflection({ tracks, artists, focus });
        return json({ text }, corsHeaders);
      }

      return json({ error: "Not found" }, corsHeaders, 404);
    } catch (err) {
      return json({ error: String(err?.message || err) }, {
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      }, 500);
    }
  },
};

function json(obj, headers = {}, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildReflection({ tracks, artists, focus }) {
  const topArtist = artists[0]?.name ? `${artists[0].name} (${artists[0].playcount} plays)` : "—";
  const top3Artists = artists.slice(0, 3).map(a => `${a.name} (${a.playcount})`).join(", ") || "—";
  const top3Tracks = tracks.slice(0, 3).map(t => `${t.name} — ${t.artist} (${t.playcount})`).join("\n") || "—";

  const repeats = tracks.filter(t => t.playcount >= 6);
  const repeatLine = repeats.length
    ? `You looped ${repeats.length} track(s) hard this week (6+ plays).`
    : `Your listening was spread out — no single track dominated massively.`;

  const angle = focus
    ? `Focus: ${focus}\n\n`
    : "";

  return (
`${angle}Weekly reflection (Last.fm — last 7 days)

Top artist:
• ${topArtist}

Top artists (top 3):
• ${top3Artists}

Top tracks (top 3):
${top3Tracks}

Pattern:
• ${repeatLine}

Interpretation:
• Your “center of gravity” this week sits around your top artist + the repeated tracks. When a track hits 6–8 plays in 7 days, it usually means: mood anchoring, obsession with a specific sound, or you’re testing a mix/feeling.

Suggestion (based strictly on the data above):
• If you want variety: rotate between your #1 artist and #3–#5 artists to keep the vibe but widen the palette.
• If you want depth: replay the top track in 3 different contexts (headphones / speakers / late night) and note what changes.`
  );
}
