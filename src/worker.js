// src/worker.js

const DEFAULT_CORS_ALLOW_ORIGIN = "*";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname || "/";

    // Accept both /api/* and /*
    if (path.startsWith("/api/")) path = path.slice(4);
    if (path === "/api") path = "/";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (path === "/" || path === "") {
        return json(env, { ok: true, service: "Listening Mirror Worker" }, 200);
      }

      // Image proxy: /img?url=... OR /img?u=...
      if (path === "/img") {
        const raw = url.searchParams.get("url") || url.searchParams.get("u");
        if (!raw) return json(env, { ok: false, error: "Missing url" }, 400);

        return proxyImage(env, raw);
      }

      if (path === "/now") {
        // very short cache
        const data = await cachedJson(ctx, request, env, "now", 10, () => getNowPlaying(env));
        return json(env, data, 200);
      }

      if (path === "/recent") {
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 40);
        const key = `recent:${limit}`;
        const data = await cachedJson(ctx, request, env, key, 30, () => getRecent(env, limit));
        return json(env, data, 200);
      }

      if (path === "/top") {
        const type = (url.searchParams.get("type") || "artists").toLowerCase(); // tracks | artists | albums
        const period = (url.searchParams.get("period") || "7day").toLowerCase();
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);

        // Special: "today" is computed from recent scrobbles
        if (period === "today") {
          const key = `top:${type}:today:${limit}`;
          const data = await cachedJson(ctx, request, env, key, 60, async () => {
            const recent = await getRecent(env, 200);
            if (type === "tracks") return topTodayTracksFromRecent(env, recent.tracks, limit);
            if (type === "artists") return topTodayArtistsFromRecent(env, recent.tracks, limit);
            if (type === "albums") return topTodayAlbumsFromRecent(env, recent.tracks, limit);
            return { error: "Invalid type" };
          });
          return json(env, data, 200);
        }

        const key = `top:${type}:${period}:${limit}`;
        const data = await cachedJson(ctx, request, env, key, 300, async () => {
          if (type === "tracks") return getTopTracksWithAlbumArt(env, period, limit);
          if (type === "albums") return getTopAlbums(env, period, limit);
          return getTopArtists(env, period, limit);
        });

        return json(env, data, 200);
      }

      if (path === "/embed") {
        const now = await cachedJson(ctx, request, env, "now", 10, () => getNowPlaying(env));
        const html = renderEmbed(now);
        return new Response(html, {
          status: 200,
          headers: corsHeaders(env, { "content-type": "text/html; charset=utf-8" }),
        });
      }

      return json(env, { ok: false, error: "Not found" }, 404);
    } catch (e) {
      return json(env, { ok: false, error: String(e?.message || e) }, 500);
    }
  },
};

function corsHeaders(env, extra = {}) {
  return {
    "access-control-allow-origin": env.CORS_ALLOW_ORIGIN || DEFAULT_CORS_ALLOW_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    ...extra,
  };
}

function json(env, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(env, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    }),
  });
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function cachedJson(ctx, request, env, key, ttlSeconds, producer) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(`/__cache/${key}`, request.url).toString(), {
    method: "GET",
  });

  const hit = await cache.match(cacheKey);
  if (hit) {
    const text = await hit.text();
    try {
      return JSON.parse(text);
    } catch {
      // fall through
    }
  }

  const data = await producer();

  const resp = new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...corsHeaders(env),
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttlSeconds}`,
    },
  });

  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return data;
}
async function lastfm(env, method, params = {}) {
  const apiKey = env.LASTFM_API_KEY;
  const user = env.LASTFM_USER;

  if (!apiKey) throw new Error("Missing env var: LASTFM_API_KEY");
  if (!user) throw new Error("Missing env var: LASTFM_USER");

  const u = new URL("https://ws.audioscrobbler.com/2.0/");
  u.searchParams.set("method", method);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("format", "json");

  if (method.startsWith("user.")) u.searchParams.set("user", user);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }

  const r = await fetch(u.toString(), {
    headers: { "user-agent": "listening-mirror/1.0" },
  });

  if (!r.ok) throw new Error(`Last.fm HTTP ${r.status}`);
  const data = await r.json();
  if (data?.error) throw new Error(`Last.fm error: ${data.message || data.error}`);
  return data;
}

function pickImage(images) {
  if (!Array.isArray(images)) return "";
  for (let i = images.length - 1; i >= 0; i--) {
    const u = images[i]?.["#text"];
    if (u) return u;
  }
  return "";
}

// Last.fm placeholder star
function isLastfmPlaceholder(url) {
  return typeof url === "string" && url.includes("2a96cbd8b46e442fc41c2b86b821562f");
}

function imgProxy(env, rawUrl) {
  if (!rawUrl) return "";
  const base = env.BASE_API || ""; // optional
  // We will always use worker itself if BASE_API is not set
  // But since we're inside worker, we don't need absolute URL for the client.
  // Frontend typically uses BASE_API already; returning path keeps it simple.
  const encoded = encodeURIComponent(rawUrl);
  // IMPORTANT: use "url=" (and we accept u= too)
  return `${base}/img?url=${encoded}`;
}

async function proxyImage(env, rawUrl) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return new Response("Bad url", { status: 400, headers: corsHeaders(env) });
  }

  const r = await fetch(target.toString(), {
    headers: {
      "user-agent": "listening-mirror/1.0",
      "accept": "image/*,*/*;q=0.8",
    },
  });

  // If upstream blocks, return 404 so UI can fall back
  if (!r.ok) {
    return new Response(null, { status: 404, headers: corsHeaders(env) });
  }

  const headers = new Headers(r.headers);
  headers.set("cache-control", "public, max-age=86400");
  for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);

  return new Response(r.body, { status: 200, headers });
}

// small concurrency helper
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return out;
}
async function getNowPlaying(env) {
  const data = await lastfm(env, "user.getrecenttracks", { limit: 1 });
  const t = data?.recenttracks?.track?.[0];
  if (!t) return { nowPlaying: false };

  const nowPlaying = t?.["@attr"]?.nowplaying === "true";
  const rawImg = pickImage(t?.image);

  return {
    artist: t?.artist?.["#text"] || "",
    name: t?.name || "",
    album: t?.album?.["#text"] || "",
    image: rawImg ? imgProxy(env, rawImg) : "",
    nowPlaying: Boolean(nowPlaying),
    // keep both (helps UI)
    uts: t?.date?.uts ? Number(t.date.uts) * 1000 : null,
  };
}

function dedupeRecent(tracks) {
  const seen = new Set();
  const out = [];
  for (const t of tracks) {
    // key: name+artist+uts; if uts is null, include album too
    const key = `${t.artist}__${t.name}__${t.uts ?? "np"}__${t.album ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function getRecent(env, limit) {
  const data = await lastfm(env, "user.getrecenttracks", { limit });
  const raw = data?.recenttracks?.track || [];

  const tracks = raw.map((t) => {
    const rawImg = pickImage(t?.image);
    return {
      name: t?.name || "",
      artist: t?.artist?.["#text"] || "",
      album: t?.album?.["#text"] || "",
      uts: t?.date?.uts ? Number(t.date.uts) * 1000 : null,
      nowPlaying: t?.["@attr"]?.nowplaying === "true",
      image: rawImg ? imgProxy(env, rawImg) : "",
    };
  });

  return { tracks: dedupeRecent(tracks) };
}

async function getTopArtists(env, period, limit) {
  const data = await lastfm(env, "user.gettopartists", { period, limit });
  const artists = (data?.topartists?.artist || []).map((a) => {
    const rawImg = pickImage(a?.image);
    return {
      name: a?.name || "",
      playcount: Number(a?.playcount || 0),
      image: rawImg ? imgProxy(env, rawImg) : "",
    };
  });
  return { artists };
}

async function getTopAlbums(env, period, limit) {
  const data = await lastfm(env, "user.gettopalbums", { period, limit });
  const albums = (data?.topalbums?.album || []).map((a) => {
    const rawImg = pickImage(a?.image);
    return {
      name: a?.name || "",
      artist: a?.artist?.name || a?.artist || "",
      playcount: Number(a?.playcount || 0),
      image: rawImg ? imgProxy(env, rawImg) : "",
    };
  });
  return { albums };
}

async function getTopTracksWithAlbumArt(env, period, limit) {
  const data = await lastfm(env, "user.gettoptracks", { period, limit });
  const raw = (data?.toptracks?.track || []).slice(0, limit);

  const tracks = await mapLimit(raw, 4, async (t) => {
    const name = t?.name || "";
    const artist = t?.artist?.name || t?.artist || "";
    const playcount = Number(t?.playcount || 0);

    let rawImg = pickImage(t?.image);
    let finalImg = rawImg;

    // if placeholder -> try track.getInfo (album art)
    if (!finalImg || isLastfmPlaceholder(finalImg)) {
      try {
        const info = await lastfm(env, "track.getInfo", {
          track: name,
          artist,
          autocorrect: 1,
        });
        const albumImg = pickImage(info?.track?.album?.image);
        if (albumImg) finalImg = albumImg;
      } catch {
        // ignore
      }
    }

    return {
      name,
      artist,
      playcount,
      image: finalImg ? imgProxy(env, finalImg) : "",
    };
  });

  return { tracks };
}
function startOfLocalDayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function topNFromMap(map, limit, mapper) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(mapper);
}

async function topTodayTracksFromRecent(env, recentTracks, limit) {
  const dayStart = startOfLocalDayMs();
  const counts = new Map();

  for (const t of recentTracks) {
    if (!t.uts) continue; // skip nowplaying without timestamp
    if (t.uts < dayStart) continue;
    const key = `${t.artist}__${t.name}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const tracks = topNFromMap(counts, limit, ([key, playcount]) => {
    const [artist, name] = key.split("__");
    return { artist, name, playcount, image: "" };
  });

  // Enrich images: try track.getInfo for each
  const enriched = await mapLimit(tracks, 4, async (t) => {
    try {
      const info = await lastfm(env, "track.getInfo", {
        track: t.name,
        artist: t.artist,
        autocorrect: 1,
      });
      const img = pickImage(info?.track?.album?.image) || pickImage(info?.track?.image);
      return { ...t, image: img ? imgProxy(env, img) : "" };
    } catch {
      return t;
    }
  });

  return { tracks: enriched };
}

async function topTodayArtistsFromRecent(env, recentTracks, limit) {
  const dayStart = startOfLocalDayMs();
  const counts = new Map();

  for (const t of recentTracks) {
    if (!t.uts) continue;
    if (t.uts < dayStart) continue;
    const key = t.artist || "";
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const artists = topNFromMap(counts, limit, ([name, playcount]) => ({
    name,
    playcount,
    image: "",
  }));

  // images via artist.getInfo (best-effort)
  const enriched = await mapLimit(artists, 4, async (a) => {
    try {
      const info = await lastfm(env, "artist.getInfo", { artist: a.name, autocorrect: 1 });
      const img = pickImage(info?.artist?.image);
      return { ...a, image: img ? imgProxy(env, img) : "" };
    } catch {
      return a;
    }
  });

  return { artists: enriched };
}

async function topTodayAlbumsFromRecent(env, recentTracks, limit) {
  const dayStart = startOfLocalDayMs();
  const counts = new Map();

  for (const t of recentTracks) {
    if (!t.uts) continue;
    if (t.uts < dayStart) continue;
    const album = t.album || "";
    const artist = t.artist || "";
    if (!album || !artist) continue;
    const key = `${artist}__${album}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const albums = topNFromMap(counts, limit, ([key, playcount]) => {
    const [artist, name] = key.split("__");
    return { artist, name, playcount, image: "" };
  });

  const enriched = await mapLimit(albums, 4, async (a) => {
    try {
      const info = await lastfm(env, "album.getInfo", {
        artist: a.artist,
        album: a.name,
        autocorrect: 1,
      });
      const img = pickImage(info?.album?.image);
      return { ...a, image: img ? imgProxy(env, img) : "" };
    } catch {
      return a;
    }
  });

  return { albums: enriched };
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
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}