export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === "OPTIONS") {
      return corsResponse(env, null, 204);
    }

    try {
      if (path === "/" || path === "") {
        return corsResponse(env, { ok: true, service: "Listening Mirror Worker" });
      }

      if (path === "/now") {
        const data = await cachedJson(ctx, request, env, "now", () => getNowPlaying(env));
        return corsResponse(env, data);
      }

      if (path === "/recent") {
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 200);
        const data = await cachedJson(ctx, request, env, `recent:${limit}`, () => getRecent(env, limit));
        return corsResponse(env, data);
      }

      if (path === "/top") {
        const period = url.searchParams.get("period") || "7day";
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);
        const data = await cachedJson(ctx, request, env, `top:${period}:${limit}`, () => getTopArtists(env, period, limit));
        return corsResponse(env, data);
      }

      if (path === "/embed") {
        const now = await cachedJson(ctx, request, env, "now", () => getNowPlaying(env));
        const html = renderEmbed(now);
        return new Response(html, {
          headers: corsHeaders(env, { "content-type": "text/html; charset=utf-8" }),
        });
      }

      return corsResponse(env, { error: "Not found" }, 404);
    } catch (e) {
      return corsResponse(env, { error: String(e?.message || e) }, 500);
    }
  }
};

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function corsHeaders(env, extra = {}) {
  const allow = (env.ALLOW_ORIGIN && String(env.ALLOW_ORIGIN).trim()) || "*";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    ...extra,
  };
}

function corsResponse(env, jsonObj, status = 200) {
  if (jsonObj === null) return new Response(null, { status, headers: corsHeaders(env) });
  return new Response(JSON.stringify(jsonObj, null, 0), {
    status,
    headers: corsHeaders(env, { "content-type": "application/json; charset=utf-8" }),
  });
}

async function cachedJson(ctx, request, env, key, producer) {
  const ttl = clampInt(env.CACHE_TTL_SECONDS, 0, 3600, 15);
  if (ttl <= 0) return producer();

  const cacheKey = new Request(new URL(`/__cache/${key}`, request.url).toString(), { method: "GET" });
  const cache = caches.default;

  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const data = await producer();
  const res = new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${ttl}` },
  });

  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return data;
}
async function lastfm(env, method, params = {}) {
  const apiKey = env.LASTFM_API_KEY;
  const user = env.LASTFM_USER;

  if (!apiKey) throw new Error("Missing env var: LASTFM_API_KEY");
  if (!user) throw new Error("Missing env var: LASTFM_USER");

  const u = new URL("https://ws.audioscrobbler.com/2.0/");
  u.searchParams.set("method", method);
  u.searchParams.set("user", user);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));

  const r = await fetch(u.toString(), { headers: { "user-agent": "listening-mirror/1.0" } });
  if (!r.ok) throw new Error(`Last.fm HTTP ${r.status}`);
  const data = await r.json();
  if (data?.error) throw new Error(`Last.fm error: ${data.message || data.error}`);
  return data;
}

async function getNowPlaying(env) {
  const data = await lastfm(env, "user.getrecenttracks", { limit: 1 });
  const t = data?.recenttracks?.track?.[0];
  if (!t) return { nowPlaying: false };

  const nowPlaying = Boolean(t?.["@attr"]?.nowplaying === "true");
  const image = pickImage(t?.image);
  return {
    artist: t?.artist?.["#text"] || "",
    name: t?.name || "",
    album: t?.album?.["#text"] || "",
    image: image || "",
    nowPlaying
  };
}

async function getRecent(env, limit) {
  const data = await lastfm(env, "user.getrecenttracks", { limit });
  const raw = data?.recenttracks?.track || [];
  const recent = raw.map(t => ({
    name: t?.name || "",
    artist: t?.artist?.["#text"] || "",
    album: t?.album?.["#text"] || "",
    uts: t?.date?.uts ? Number(t.date.uts) * 1000 : null,
    nowPlaying: Boolean(t?.["@attr"]?.nowplaying === "true"),
    image: pickImage(t?.image) || ""
  }));
  return { recent };
}
async function getTopArtists(env, period, limit) {
  const data = await lastfm(env, "user.gettopartists", { period, limit });
  const artists = (data?.topartists?.artist || []).map(a => ({
    name: a?.name || "",
    playcount: Number(a?.playcount || 0),
  }));
  return { artists };
}

function pickImage(images) {
  if (!Array.isArray(images)) return "";
  // παίρνουμε το μεγαλύτερο που έχει url
  for (let i = images.length - 1; i >= 0; i--) {
    const url = images[i]?.["#text"];
    if (url) return url;
  }
  return "";
}

function renderEmbed(now) {
  const artist = escapeHtml(now?.artist || "—");
  const name = escapeHtml(now?.name || "—");
  const album = escapeHtml(now?.album || "");
  const img = escapeAttr(now?.image || "");
  const badge = now?.nowPlaying ? "LIVE now playing" : "last played";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Now Playing</title>
<style>
:root{color-scheme:dark}
body{margin:0;padding:0;background:#0b0b0b;color:#eaeaea;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
.card{display:flex;gap:12px;align-items:center;background:#141414;border:1px solid #2a2a2a;border-radius:14px;padding:14px;max-width:520px}
img{width:84px;height:84px;border-radius:12px;border:1px solid #2a2a2a;object-fit:cover;background:#0d0d0d}
.title{font-weight:700;margin:0 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{margin:0;opacity:.75;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pill{display:inline-block;margin-top:10px;padding:6px 10px;border:1px solid #2a2a2a;border-radius:999px;font-size:12px;opacity:.9}
</style></head>
<body>
<div class="card">
  <img src="${img}" alt="">
  <div style="min-width:0">
    <div class="title">${artist} — ${name}</div>
    <div class="sub">${album}</div>
    <div class="pill">${badge}</div>
  </div>
</div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}
