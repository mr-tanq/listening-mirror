export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), env);
    }

    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return cors(json({ ok: true, service: "listening-mirror" }), env);
      }

      if (url.pathname === "/dashboard") {
        const payload = await buildDashboard(env);
        return cors(json(payload), env);
      }

      return cors(json({ error: "Not found" }, 404), env);
    } catch (e) {
      return cors(json({ error: e?.message || "Worker error" }, 500), env);
    }
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function cors(res, env) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", env.ALLOW_ORIGIN || "*");
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers: h });
}
async function buildDashboard(env) {
  const user = must(env.LASTFM_USER, "LASTFM_USER missing");
  const apiKey = must(env.LASTFM_API_KEY, "LASTFM_API_KEY missing");

  const ttl = Number(env.CACHE_TTL_SECONDS || 15);

  // Cache with Cloudflare cache API (simple: cache the whole dashboard)
  const cacheKey = new Request("https://cache.local/dashboard");
  const cached = await caches.default.match(cacheKey);
  if (cached) return await cached.json();

  // 1) fetch recent scrobbles
  const recent = await lastfm(apiKey, user, "user.getrecenttracks", { limit: 200 });

  const raw = recent?.recenttracks?.track || [];
  const normalized = raw.map(t => ({
    name: t?.name || "",
    artist: t?.artist?.["#text"] || "",
    album: t?.album?.["#text"] || "",
    uts: t?.date?.uts ? Number(t.date.uts) * 1000 : null,
    nowPlaying: Boolean(t?.["@attr"] && t["@attr"].nowplaying === "true")
  }));

  const scrobbled = normalized.filter(x => x.uts);

  // 2) today list (local day based on UTC — απλό/σταθερό)
  const todayKey = dateKeyUTC(new Date());
  const today = scrobbled
    .filter(t => dateKeyUTC(new Date(t.uts)) === todayKey)
    .sort((a, b) => a.uts - b.uts);

  // 3) top artists 7 days
  const top = await lastfm(apiKey, user, "user.gettopartists", { period: "7day", limit: 10 });
  const topArtists = (top?.topartists?.artist || []).map(a => ({
    name: a?.name || "",
    playcount: Number(a?.playcount || 0)
  }));

  // 4) status line
  const status = `OK • loaded ${scrobbled.length} recent scrobbles • today: ${today.length}`;

  // 5) reflection (v1 deterministic, χωρίς OpenAI ακόμη)
  const reflection = reflectionV1(today);

  const payload = { user, status, today, topArtists, reflection };

  // store cache
  const resp = json(payload);
  resp.headers.set("Cache-Control", `public, max-age=${ttl}`);
  await caches.default.put(cacheKey, resp.clone());

  return payload;
}

function must(v, msg) {
  if (!v) throw new Error(msg);
  return v;
}
async function lastfm(apiKey, user, method, params = {}) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", method);
  url.searchParams.set("user", user);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status} from Last.fm`);
  const data = await res.json();
  if (data?.error) throw new Error(`Last.fm error: ${data.message || data.error}`);
  return data;
}

function dateKeyUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function countBy(arr, keyFn) {
  const map = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
function reflectionV1(today) {
  if (!today || today.length === 0) {
    return "No scrobbles today yet. Once you listen, I’ll summarize the pattern.";
  }

  const byArtist = countBy(today, t => t.artist);
  const byTrack = countBy(today, t => `${t.artist} — ${t.name}`);

  const topArtist = byArtist[0]?.[0] || "—";
  const variety = byArtist.length;
  const repeats = byTrack.filter(([, c]) => c >= 2).length;

  let text = "";

  if (variety <= 5 && repeats >= 1) {
    text = "Comfort-loop day: low variety + repeats. You leaned on familiar anchors to stabilize mood/energy.";
  } else if (variety <= 10) {
    text = "Balanced day: you stayed within a recognizable palette, with some exploration inside it.";
  } else {
    text = "Exploratory day: high variety suggests searching for new emotional input rather than staying in comfort.";
  }

  text += ` Dominant presence: ${topArtist}.`;
  const stats = `Scrobbles today: ${today.length} • Artists: ${variety} • Repeated tracks: ${repeats}`;

  return `${text}\n${stats}`;
}
