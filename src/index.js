export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    try {
      if (url.pathname === "/" || url.pathname === "") {
        return cors(text("Listening Mirror API — OK"));
      }

      if (url.pathname === "/api/now") {
        const data = await getRecentTrack(env);
        return cors(json(data));
      }

      if (url.pathname === "/api/top") {
        const type = (url.searchParams.get("type") || "tracks").toLowerCase();
        const period = url.searchParams.get("period") || "7day";
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);

        if (type !== "tracks") {
          return cors(json({ error: "Only type=tracks supported" }, 400));
        }

        const data = await getTopTracks(env, period, limit);
        return cors(json(data));
      }

      if (url.pathname === "/api/reflection") {
        // placeholder safe response (you already have OPENAI_API_KEY; we can wire later)
        const period = url.searchParams.get("period") || "7day";
        const limit = clampInt(url.searchParams.get("limit"), 1, 20, 10);
        const top = await getTopTracks(env, period, limit);

        const names = top.tracks.map(t => `${t.name} — ${t.artist} (${t.playcount})`).join(" | ");
        const textOut = `This week you leaned into: ${names}.`;
        return cors(json({ text: textOut }));
      }

      return cors(json({ error: "Not found" }, 404));
    } catch (e) {
      return cors(json({ error: "Server error" }, 500));
    }
  }
};

function clampInt(v, min, max, def) {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
function cors(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function text(t, status = 200) {
  return new Response(t, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

async function getRecentTrack(env) {
  const user = env.LASTFM_USER;
  const apiKey = env.LASTFM_API_KEY;

  const endpoint = new URL("https://ws.audioscrobbler.com/2.0/");
  endpoint.searchParams.set("method", "user.getrecenttracks");
  endpoint.searchParams.set("user", user);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "1");

  const r = await fetch(endpoint.toString());
  if (!r.ok) throw new Error("Last.fm error");
  const j = await r.json();

  const track = j?.recenttracks?.track?.[0];
  if (!track) return { track: null };

  const img = pickImage(track.image);
  const nowplaying = track?.["@attr"]?.nowplaying === "true";

  return {
    track: {
      name: track.name || "",
      artist: track.artist?.["#text"] || "",
      image: img,
      nowplaying
    }
  };
}
async function getTopTracks(env, period, limit) {
  const user = env.LASTFM_USER;
  const apiKey = env.LASTFM_API_KEY;

  const endpoint = new URL("https://ws.audioscrobbler.com/2.0/");
  endpoint.searchParams.set("method", "user.gettoptracks");
  endpoint.searchParams.set("user", user);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("period", period);
  endpoint.searchParams.set("limit", String(limit));

  const r = await fetch(endpoint.toString());
  if (!r.ok) throw new Error("Last.fm error");
  const j = await r.json();

  const tracks = (j?.toptracks?.track || []).map(t => ({
    name: t.name || "",
    artist: t.artist?.name || "",
    playcount: Number.parseInt(t.playcount || "0", 10) || 0,
    image: pickImage(t.image)
  }));

  return { tracks };
}

function pickImage(imageArr) {
  if (!Array.isArray(imageArr)) return "";
  // prefer largest
  const sorted = [...imageArr].reverse();
  for (const it of sorted) {
    if (it && it["#text"]) return it["#text"];
  }
  return "";
}
// NOTE:
// env vars που έχεις ήδη βάλει στο Cloudflare:
// - LASTFM_API_KEY (secret)
// - LASTFM_USER (π.χ. errz)
// - CACHE_TTL (προαιρετικό)
// - OPENAI_API_KEY (secret) (θα το δέσουμε αργότερα αν θες)
