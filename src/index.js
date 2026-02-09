export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Homepage στο /
      if (path === "/" || path === "") {
        return homepage();
      }

      // Health check
      if (path === "/health") {
        return json({ ok: true, message: "Worker is running." }, 200);
      }

      // API routes
      if (path === "/api/top") {
        return handleTop(request, env, url);
      }

      if (path === "/api/now") {
        return handleNow(request, env);
      }

      // Αν δεν βρέθηκε route
      return json({ ok: false, error: "Not found", path }, 404);
    } catch (err) {
      return json({ ok: false, error: String(err?.message || err) }, 500);
    }
  },
};
function homepage() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Listening Mirror API</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; line-height: 1.4; }
    code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
    .box { max-width: 820px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Listening Mirror API</h1>
    <p>✅ This Worker is alive.</p>
    <p>Try:</p>
    <ul>
      <li><code>/api/top?type=tracks&period=7day&limit=3</code></li>
      <li><code>/api/now</code></li>
      <li><code>/health</code></li>
    </ul>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "cache-control": "no-store",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}
async function handleTop(request, env, url) {
  // Query params
  const type = (url.searchParams.get("type") || "tracks").toLowerCase(); // tracks | artists | albums
  const period = (url.searchParams.get("period") || "7day").toLowerCase(); // 7day | 1month | 3month | 6month | 12month | overall
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);

  // ENV (από τα Variables σου)
  const user = env.LASTFM_USER;
  const apiKey = env.LASTFM_API_KEY;

  if (!user || !apiKey) {
    return json(
      {
        ok: false,
        error: "Missing env vars. Need LASTFM_USER and LASTFM_API_KEY.",
        have: {
          LASTFM_USER: Boolean(user),
          LASTFM_API_KEY: Boolean(apiKey),
        },
      },
      500
    );
  }

  const base = "https://ws.audioscrobbler.com/2.0/";
  const method =
    type === "artists" ? "user.gettopartists" :
    type === "albums"  ? "user.gettopalbums"  :
                         "user.gettoptracks";

  const apiUrl = new URL(base);
  apiUrl.searchParams.set("method", method);
  apiUrl.searchParams.set("user", user);
  apiUrl.searchParams.set("api_key", apiKey);
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("period", period);
  apiUrl.searchParams.set("limit", String(limit));

  const r = await fetch(apiUrl.toString(), {
    headers: { "user-agent": "listening-mirror-worker/1.0" },
  });

  const data = await r.json();

  if (!r.ok) {
    return json({ ok: false, error: "Last.fm error", status: r.status, data }, 502);
  }

  // normalize output
  if (type === "artists") {
    const items = (data?.topartists?.artist || []).map(normalizeArtist);
    return json({ ok: true, type, period, limit, artists: items }, 200);
  }
  if (type === "albums") {
    const items = (data?.topalbums?.album || []).map(normalizeAlbum);
    return json({ ok: true, type, period, limit, albums: items }, 200);
  }

  const items = (data?.toptracks?.track || []).map(normalizeTrack);
  return json({ ok: true, type, period, limit, tracks: items }, 200);
}
async function handleNow(request, env) {
  // (Προαιρετικό endpoint) τώρα το κάνουμε "dummy" για να μην σπάει το UI σου
  // Αν θέλεις πραγματικό now playing από Last.fm, το φτιάχνουμε μετά.
  return json({ ok: true, now: null }, 200);
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function pickImage(images) {
  // Last.fm επιστρέφει array από {#text, size}
  if (!Array.isArray(images)) return "";
  const best = images.find((x) => x?.size === "extralarge" && x?.["#text"]) ||
               images.find((x) => x?.size === "large" && x?.["#text"]) ||
               images.find((x) => x?.["#text"]);
  return best?.["#text"] || "";
}

function normalizeTrack(t) {
  return {
    name: t?.name || "",
    artist: t?.artist?.name || t?.artist || "",
    playcount: parseInt(t?.playcount || "0", 10) || 0,
    image: pickImage(t?.image),
    url: t?.url || "",
  };
}

function normalizeArtist(a) {
  return {
    name: a?.name || "",
    playcount: parseInt(a?.playcount || "0", 10) || 0,
    image: pickImage(a?.image),
    url: a?.url || "",
  };
}

function normalizeAlbum(al) {
  return {
    name: al?.name || "",
    artist: al?.artist?.name || al?.artist || "",
    playcount: parseInt(al?.playcount || "0", 10) || 0,
    image: pickImage(al?.image),
    url: al?.url || "",
  };
}
