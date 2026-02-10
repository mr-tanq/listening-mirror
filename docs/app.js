export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // CORS preflight
      if (request.method === "OPTIONS") return cors(new Response("", { status: 204 }));

      // ROUTES
      if (path === "/api/ping") return cors(json({ ok: true, ts: Date.now() }));
      if (path === "/img") return cors(await handleImgProxy(request, ctx));
      if (path === "/api/top") return cors(await handleTop(request, env, ctx));
      if (path === "/api/now") return cors(await handleNow(request, env, ctx));
      if (path === "/api/history") return cors(await handleHistory(request, env, ctx));

      // default
      return cors(json({ ok: false, error: "Not found" }, 404));
    } catch (e) {
      return cors(json({ ok: false, error: String(e?.message || e) }, 500));
    }
  }
};

function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

// ---------------------------
// CONFIG / HELPERS
// ---------------------------
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";
const PLACEHOLDER_HASH = "2a96cbd8b46e442fc41c2b86b821562f"; // last.fm no-image

function mustEnv(env, key) {
  const v = env?.[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

function isPlaceholderImageUrl(u) {
  if (!u) return true;
  return String(u).includes(PLACEHOLDER_HASH);
}

function toProxyPath(imageUrl) {
  if (!imageUrl) return "";
  return `/img?u=${encodeURIComponent(imageUrl)}`;
}

async function cachedFetchJson(ctx, cacheKeyUrl, fetcher, ttlSeconds = 3600) {
  const cache = caches.default;
  const cacheReq = new Request(cacheKeyUrl, { method: "GET" });
  const cached = await cache.match(cacheReq);
  if (cached) return await cached.json();

  const data = await fetcher();
  const res = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttlSeconds}`
    }
  });
  ctx.waitUntil(cache.put(cacheReq, res.clone()));
  return data;
}
// ---------------------------
// LAST.FM API
// ---------------------------
async function lastfm(env, ctx, params, ttlSeconds = 300) {
  const apiKey = mustEnv(env, "LASTFM_API_KEY");
  const full = new URL(LASTFM_BASE);
  full.searchParams.set("format", "json");
  full.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) full.searchParams.set(k, String(v));

  const cacheKey = "https://cache.local/lastfm" + full.search;
  return await cachedFetchJson(
    ctx,
    cacheKey,
    async () => {
      const r = await fetch(full.toString(), { cf: { cacheTtl: ttlSeconds, cacheEverything: true } });
      const t = await r.text();
      let j = null;
      try { j = JSON.parse(t); } catch { j = null; }
      if (!r.ok) throw new Error(`Last.fm HTTP ${r.status}`);
      if (j?.error) throw new Error(`Last.fm error: ${j.message || "unknown"}`);
      return j;
    },
    ttlSeconds
  );
}

// ---------------------------
// IMG PROXY
// ---------------------------
async function handleImgProxy(request, ctx) {
  const url = new URL(request.url);
  const u = url.searchParams.get("u");
  if (!u) return new Response("Missing u", { status: 400 });

  const cache = caches.default;
  const cacheReq = new Request("https://cache.local/img?u=" + encodeURIComponent(u));
  const hit = await cache.match(cacheReq);
  if (hit) return hit;

  const upstream = await fetch(u, {
    headers: { "User-Agent": "ListeningMirror/1.0" }
  });

  if (!upstream.ok) return new Response("Image fetch failed", { status: 502 });

  const ct = upstream.headers.get("content-type") || "image/jpeg";
  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400"
    }
  });

  ctx.waitUntil(cache.put(cacheReq, res.clone()));
  return res;
}

// ---------------------------
// ARTIST IMAGE FALLBACK
// 1) try artist.getinfo image
// 2) if still placeholder -> use artist.gettopalbums first album cover
// ---------------------------
async function resolveArtistImage(env, ctx, artistName) {
  if (!artistName) return "";

  // 1) artist.getinfo
  const info = await lastfm(env, ctx, {
    method: "artist.getinfo",
    artist: artistName,
    autocorrect: 1
  }, 86400);

  let img = pickBestLastfmImage(info?.artist?.image);
  if (img && !isPlaceholderImageUrl(img)) return img;

  // 2) artist.gettopalbums
  const tops = await lastfm(env, ctx, {
    method: "artist.gettopalbums",
    artist: artistName,
    autocorrect: 1,
    limit: 5
  }, 86400);

  const albums = tops?.topalbums?.album || [];
  for (const al of albums) {
    const cover = pickBestLastfmImage(al?.image);
    if (cover && !isPlaceholderImageUrl(cover)) return cover;
  }

  return "";
}

// ---------------------------
// TRUE "TODAY" (last 24h) via recenttracks aggregation
// ---------------------------
async function fetchRecentLast24h(env, ctx, limitHardCap = 1000) {
  const user = mustEnv(env, "LASTFM_USER");
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;

  const perPage = 200; // last.fm max
  let page = 1;
  let collected = [];
  let done = false;

  const maxPages = Math.ceil(Math.min(limitHardCap, 1000) / perPage); // up to 5 pages

  while (!done && page <= maxPages) {
    const raw = await lastfm(env, ctx, {
      method: "user.getrecenttracks",
      user,
      limit: perPage,
      page,
      extended: 1
    }, 10);

    const list = raw?.recenttracks?.track || [];
    if (!list.length) break;

    for (const t of list) {
      if (t?.["@attr"]?.nowplaying === "true") continue;

      const uts = Number(t?.date?.uts || 0) * 1000;
      if (!uts) continue;

      if (uts < sinceMs) {
        done = true;
        break;
      }

      collected.push(t);
      if (collected.length >= limitHardCap) {
        done = true;
        break;
      }
    }

    if (done) break;
    page += 1;
  }

  return collected;
}

function normKey(s) {
  return String(s || "").trim().toLowerCase();
}

function addCount(map, key, obj, inc = 1) {
  const cur = map.get(key);
  if (!cur) map.set(key, { ...obj, playcount: inc });
  else cur.playcount += inc;
}
// ---------------------------
// /api/top
// ---------------------------
async function handleTop(request, env, ctx) {
  const url = new URL(request.url);
  const type = (url.searchParams.get("type") || "tracks").toLowerCase();
  const period = (url.searchParams.get("period") || "today").toLowerCase();
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);

  // ✅ TRUE TODAY: last 24 hours aggregation
  if (period === "today") {
    return await handleTopToday(request, env, ctx, type, limit);
  }

  const user = mustEnv(env, "LASTFM_USER");

  const lastfmPeriod =
    period === "week" ? "7day" :
    period === "year" ? "12month" :
    (period === "all" || period === "alltime") ? "overall" :
    "7day";

  if (type === "artists") {
    const raw = await lastfm(env, ctx, {
      method: "user.gettopartists",
      user,
      period: lastfmPeriod,
      limit
    }, 600);

    const list = raw?.topartists?.artist || [];
    const items = [];

    for (const a of list) {
      const name = a?.name || "";
      const playcount = Number(a?.playcount || 0);

      let img = pickBestLastfmImage(a?.image);
      if (!img || isPlaceholderImageUrl(img)) {
        img = await resolveArtistImage(env, ctx, name);
      }
      if (isPlaceholderImageUrl(img)) img = "";

      items.push({
        name,
        playcount,
        image: img ? toProxyPath(img) : ""
      });
    }

    return json({ ok: true, items });
  }

  if (type === "tracks") {
    const raw = await lastfm(env, ctx, {
      method: "user.gettoptracks",
      user,
      period: lastfmPeriod,
      limit
    }, 600);

    const list = raw?.toptracks?.track || [];
    const items = [];

    for (const t of list) {
      const name = t?.name || "";
      const artist = t?.artist?.name || t?.artist || "";
      let img = pickBestLastfmImage(t?.image);

      if (!img || isPlaceholderImageUrl(img)) {
        const info = await lastfm(env, ctx, {
          method: "track.getinfo",
          artist,
          track: name,
          autocorrect: 1
        }, 86400);

        const albumImg = pickBestLastfmImage(info?.track?.album?.image);
        const trackImg = pickBestLastfmImage(info?.track?.image);

        const candidate = albumImg || trackImg;
        img = (!candidate || isPlaceholderImageUrl(candidate)) ? "" : candidate;
      } else {
        if (isPlaceholderImageUrl(img)) img = "";
      }

      items.push({
        name,
        artist,
        playcount: Number(t?.playcount || 0),
        image: img ? toProxyPath(img) : ""
      });
    }

    return json({ ok: true, items });
  }

  if (type === "albums") {
    const raw = await lastfm(env, ctx, {
      method: "user.gettopalbums",
      user,
      period: lastfmPeriod,
      limit
    }, 600);

    const list = raw?.topalbums?.album || [];
    const items = [];

    for (const al of list) {
      const name = al?.name || "";
      const artist = al?.artist?.name || al?.artist || "";
      let img = pickBestLastfmImage(al?.image);

      if (!img || isPlaceholderImageUrl(img)) {
        const info = await lastfm(env, ctx, {
          method: "album.getinfo",
          artist,
          album: name,
          autocorrect: 1
        }, 86400);

        const img2 = pickBestLastfmImage(info?.album?.image);
        img = (!img2 || isPlaceholderImageUrl(img2)) ? "" : img2;
      } else {
        if (isPlaceholderImageUrl(img)) img = "";
      }

      items.push({
        name,
        artist,
        playcount: Number(al?.playcount || 0),
        image: img ? toProxyPath(img) : ""
      });
    }

    return json({ ok: true, items });
  }

  return json({ ok: false, error: "Invalid type" }, 400);
}

async function handleTopToday(request, env, ctx, type, limit) {
  const tracks = await fetchRecentLast24h(env, ctx, 1000);

  if (type === "tracks") {
    const map = new Map();

    for (const t of tracks) {
      const name = t?.name || "";
      const artist = t?.artist?.name || t?.artist?.["#text"] || "";
      if (!name || !artist) continue;

      const key = normKey(artist) + " — " + normKey(name);
      const img = pickBestLastfmImage(t?.image);

      addCount(
        map,
        key,
        { name, artist, image: img && !isPlaceholderImageUrl(img) ? toProxyPath(img) : "" },
        1
      );
    }

    const items = Array.from(map.values())
      .sort((a, b) => (b.playcount || 0) - (a.playcount || 0))
      .slice(0, limit);

    // Enrichment: NEVER fail endpoint if Last.fm says "Track not found"
    for (const it of items) {
      if (it.image) continue;
      try {
        const info = await lastfm(env, ctx, {
          method: "track.getinfo",
          artist: it.artist,
          track: it.name,
          autocorrect: 1
        }, 86400);

        const albumImg = pickBestLastfmImage(info?.track?.album?.image);
        const trackImg = pickBestLastfmImage(info?.track?.image);
        const candidate = albumImg || trackImg;

        if (candidate && !isPlaceholderImageUrl(candidate)) it.image = toProxyPath(candidate);
      } catch {
        // ignore
      }
    }

    return json({ ok: true, items });
  }

  if (type === "albums") {
    const map = new Map();

    for (const t of tracks) {
      const album = t?.album?.["#text"] || "";
      const artist = t?.artist?.name || t?.artist?.["#text"] || "";
      if (!album || !artist) continue;

      const key = normKey(artist) + " — " + normKey(album);
      const img = pickBestLastfmImage(t?.image);

      addCount(
        map,
        key,
        { name: album, artist, image: img && !isPlaceholderImageUrl(img) ? toProxyPath(img) : "" },
        1
      );
    }

    const items = Array.from(map.values())
      .sort((a, b) => (b.playcount || 0) - (a.playcount || 0))
      .slice(0, limit);

    for (const it of items) {
      if (it.image) continue;
      try {
        const info = await lastfm(env, ctx, {
          method: "album.getinfo",
          artist: it.artist,
          album: it.name,
          autocorrect: 1
        }, 86400);

        const img2 = pickBestLastfmImage(info?.album?.image);
        if (img2 && !isPlaceholderImageUrl(img2)) it.image = toProxyPath(img2);
      } catch {
        // ignore
      }
    }

    return json({ ok: true, items });
  }

  if (type === "artists") {
    const map = new Map();

    for (const t of tracks) {
      const artist = t?.artist?.name || t?.artist?.["#text"] || "";
      if (!artist) continue;

      const key = normKey(artist);
      addCount(map, key, { name: artist, image: "" }, 1);
    }

    const items = Array.from(map.values())
      .sort((a, b) => (b.playcount || 0) - (a.playcount || 0))
      .slice(0, limit);

    for (const it of items) {
      try {
        const img = await resolveArtistImage(env, ctx, it.name);
        if (img && !isPlaceholderImageUrl(img)) it.image = toProxyPath(img);
      } catch {
        // ignore
      }
    }

    // Keep output consistent with other endpoints (artists have 'playcount' too)
    return json({ ok: true, items });
  }

  return json({ ok: false, error: "Invalid type" }, 400);
}

// ---------------------------
// /api/now
// ---------------------------
async function handleNow(request, env, ctx) {
  const user = mustEnv(env, "LASTFM_USER");

  const raw = await lastfm(env, ctx, {
    method: "user.getrecenttracks",
    user,
    limit: 1,
    extended: 1
  }, 15);

  const track = raw?.recenttracks?.track?.[0];
  if (!track) return json({ ok: true, item: null });

  const isNow = track?.["@attr"]?.nowplaying === "true";
  if (!isNow) return json({ ok: true, item: null });

  const name = track?.name || "";
  const artist = track?.artist?.name || track?.artist?.["#text"] || "";
  const album = track?.album?.["#text"] || "";
  let img = pickBestLastfmImage(track?.image);
  if (isPlaceholderImageUrl(img)) img = "";

  return json({
    ok: true,
    item: { name, artist, album, image: img ? toProxyPath(img) : "" }
  });
}
// ---------------------------
// /api/history
// ---------------------------
async function handleHistory(request, env, ctx) {
  const url = new URL(request.url);
  const user = mustEnv(env, "LASTFM_USER");
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);

  const raw = await lastfm(env, ctx, {
    method: "user.getrecenttracks",
    user,
    limit,
    extended: 1
  }, 30);

  const list = raw?.recenttracks?.track || [];
  const items = list
    .filter(t => t?.["@attr"]?.nowplaying !== "true")
    .map(t => {
      let img = pickBestLastfmImage(t?.image);
      if (isPlaceholderImageUrl(img)) img = "";
      return {
        name: t?.name || "",
        artist: t?.artist?.name || t?.artist?.["#text"] || "",
        image: img ? toProxyPath(img) : "",
        count: ""
      };
    });

  return json({ ok: true, items });
}

// ---------------------------
// IMAGE PICKER (ONE AND ONLY ONE)
// ---------------------------
function pickBestLastfmImage(imageField) {
  if (!imageField) return "";

  // already a string
  if (typeof imageField === "string") {
    const s = imageField.trim();
    return s.startsWith("http") ? s : "";
  }

  // common object form
  if (!Array.isArray(imageField)) {
    const maybe =
      (typeof imageField["#text"] === "string" && imageField["#text"]) ||
      (typeof imageField.url === "string" && imageField.url) ||
      (typeof imageField.text === "string" && imageField.text) ||
      "";
    return (maybe && String(maybe).startsWith("http")) ? String(maybe) : "";
  }

  const pref = ["mega", "extralarge", "large", "medium", "small"];

  const bySize = new Map();
  for (const it of imageField) {
    if (!it) continue;
    const size = (it.size || "").toLowerCase();
    const url =
      (typeof it["#text"] === "string" && it["#text"]) ||
      (typeof it.url === "string" && it.url) ||
      (typeof it.text === "string" && it.text) ||
      "";
    if (url && String(url).startsWith("http") && size && !bySize.has(size)) {
      bySize.set(size, String(url));
    }
  }

  for (const s of pref) {
    if (bySize.has(s)) return bySize.get(s);
  }

  for (const it of imageField) {
    if (!it) continue;
    const url =
      (typeof it["#text"] === "string" && it["#text"]) ||
      (typeof it.url === "string" && it.url) ||
      (typeof it.text === "string" && it.text) ||
      "";
    if (url && String(url).startsWith("http")) return String(url);
  }

  return "";
}