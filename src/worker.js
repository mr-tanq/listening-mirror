export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname || "/";

    // Accept both /api/* and /*
    if (path.startsWith("/api/")) path = path.slice(4);
    if (path === "/api") path = "/";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(env, null, 204);
    }

    try {
      if (path === "/" || path === "") {
        return corsResponse(env, { ok: true, service: "Listening Mirror Worker" });
      }

      // Image proxy (optional αλλά χρήσιμο)
      if (path === "/img") {
        const u = url.searchParams.get("u");
        if (!u) return corsResponse(env, { error: "Missing u" }, 400);
        return proxyImage(env, u);
      }

      if (path === "/now") {
        const data = await cachedJson(ctx, request, env, "now", () => getNowPlaying(env));
        return corsResponse(env, data);
      }

      if (path === "/recent") {
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 40);
        const data = await cachedJson(ctx, request, env, `recent:${limit}`, () => getRecent(env, limit));
        return corsResponse(env, data);
      }

      if (path === "/top") {
        const type = url.searchParams.get("type") || "artists"; // tracks | artists
        const period = url.searchParams.get("period") || "7day";
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);

        const key = `top:${type}:${period}:${limit}`;
        const data = await cachedJson(ctx, request, env, key, async () => {
          if (type === "tracks") return getTopTracksWithAlbumArt(env, period, limit);
          return getTopArtists(env, period, limit);
        });

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
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname || "/";

    // Accept both /api/* and /*
    if (path.startsWith("/api/")) path = path.slice(4);
    if (path === "/api") path = "/";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(env, null, 204);
    }

    try {
      if (path === "/" || path === "") {
        return corsResponse(env, { ok: true, service: "Listening Mirror Worker" });
      }

      // Image proxy (optional αλλά χρήσιμο)
      if (path === "/img") {
        const u = url.searchParams.get("u");
        if (!u) return corsResponse(env, { error: "Missing u" }, 400);
        return proxyImage(env, u);
      }

      if (path === "/now") {
        const data = await cachedJson(ctx, request, env, "now", () => getNowPlaying(env));
        return corsResponse(env, data);
      }

      if (path === "/recent") {
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 40);
        const data = await cachedJson(ctx, request, env, `recent:${limit}`, () => getRecent(env, limit));
        return corsResponse(env, data);
      }

      if (path === "/top") {
        const type = url.searchParams.get("type") || "artists"; // tracks | artists
        const period = url.searchParams.get("period") || "7day";
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);

        const key = `top:${type}:${period}:${limit}`;
        const data = await cachedJson(ctx, request, env, key, async () => {
          if (type === "tracks") return getTopTracksWithAlbumArt(env, period, limit);
          return getTopArtists(env, period, limit);
        });

        return corsResponse(env, data);
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

  // default user for user.* methods
  if (method.startsWith("user.")) u.searchParams.set("user", user);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }

  const r = await fetch(u.toString(), { headers: { "user-agent": "listening-mirror/1.0" } });
  if (!r.ok) throw new Error(`Last.fm HTTP ${r.status}`);
  const data = await r.json();
  if (data?.error) throw new Error(`Last.fm error: ${data.message || data.error}`);
  return data;
}

function pickImage(images) {
  if (!Array.isArray(images)) return "";
  for (let i = images.length - 1; i >= 0; i--) {
    const url = images[i]?.["#text"];
    if (url) return url;
  }
  return "";
}

// Το placeholder του Last.fm (αστεράκι) — αν το δεις, το θεωρούμε “no art”
function isLastfmPlaceholder(url) {
  return typeof url === "string" && url.includes("2a96cbd8b46e442fc41c2b86b821562f");
}

// μικρό helper για “λίγη παραλληλία” χωρίς να βαράμε Last.fm άπειρα
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

  const nowPlaying = Boolean(t?.["@attr"]?.nowplaying === "true");
  const rawImg = pickImage(t?.image);
  const image = rawImg ? imgProxy(env, rawImg) : "";

  return {
    artist: t?.artist?.["#text"] || "",
    name: t?.name || "",
    album: t?.album?.["#text"] || "",
    image,
    nowPlaying
  };
}

async function getRecent(env, limit) {
  const data = await lastfm(env, "user.getrecenttracks", { limit });
  const raw = data?.recenttracks?.track || [];

  const tracks = raw.map(t => {
    const rawImg = pickImage(t?.image);
    return {
      name: t?.name || "",
      artist: t?.artist?.["#text"] || "",
      album: t?.album?.["#text"] || "",
      uts: t?.date?.uts ? Number(t.date.uts) * 1000 : null,
      nowPlaying: Boolean(t?.["@attr"]?.nowplaying === "true"),
      image: rawImg ? imgProxy(env, rawImg) : ""
    };
  });

  return { tracks };
}
async function getTopArtists(env, period, limit) {
  const data = await lastfm(env, "user.gettopartists", { period, limit });
  const artists = (data?.topartists?.artist || []).map(a => {
    const rawImg = pickImage(a?.image);
    return {
      name: a?.name || "",
      playcount: Number(a?.playcount || 0),
      image: rawImg ? imgProxy(env, rawImg) : ""
    };
  });
  return { artists };
}

async function getTopTracksWithAlbumArt(env, period, limit) {
  const data = await lastfm(env, "user.gettoptracks", { period, limit });
  const raw = (data?.toptracks?.track || []).slice(0, limit);

  const tracks = await mapLimit(raw, 4, async (t) => {
    const name = t?.name || "";
    const artist = t?.artist?.name || t?.artist || "";
    const playcount = Number(t?.playcount || 0);

    // 1) αρχικό image (συνήθως placeholder)
    let rawImg = pickImage(t?.image);
    let finalImg = rawImg;

    // 2) αν είναι placeholder -> track.getInfo για album art
    if (!finalImg || isLastfmPlaceholder(finalImg)) {
      try {
        const info = await lastfm(env, "track.getInfo", { track: name, artist, autocorrect: 1 });
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
      image: finalImg ? imgProxy(env, finalImg) : ""
    };
  });

  return { tracks };
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
