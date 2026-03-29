import { refreshSource } from "../db/concert-refresh.js";
import { fetchVenueEventsById } from "../core/concert-fetch-engine.js";
import {
  buildConcertRecommendationsLight,
  buildBucketedConcertRecommendations
} from "../core/concert-recommender.js";

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const pathname = normalizePath(url.pathname);

      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders()
        });
      }

      if (pathname === "/") {
        return json({
          ok: true,
          service: "econcerts",
          endpoints: [
            "/health",
            "/admin/refresh-source?source=paradiso",
            "/concerts/venues?source=paradiso",
            "/concerts/db-latest",
            "/concerts/recommended",
            "/concerts/recommended?bucketed=1",
            "/debug/paradiso/raw?page=1",
            "/debug/paradiso/section?page=1"
          ]
        });
      }

      if (pathname === "/health") {
        return json({
          ok: true,
          service: "econcerts"
        });
      }

      if (pathname === "/admin/refresh-source") {
        const source = cleanParam(url.searchParams.get("source"));

        if (!source) {
          return json({ ok: false, error: "Missing source" }, 400);
        }

        if (!env?.DB) {
          return json({ ok: false, error: "Missing DB binding" }, 500);
        }

        const result = await refreshSource(env.DB, source);

        return json({
          ok: true,
          ...result
        });
      }

      if (pathname === "/concerts/venues") {
        const source = cleanParam(url.searchParams.get("source"));

        if (!source) {
          return json({ ok: false, error: "Missing source" }, 400);
        }

        const events = await fetchVenueEventsById(source);

        return json({
          ok: true,
          mode: "single-source",
          source,
          count: Array.isArray(events) ? events.length : 0,
          events: Array.isArray(events) ? events : []
        });
      }
if (pathname === "/concerts/db-latest") {
        if (!env?.DB) {
          return json({ ok: false, error: "Missing DB binding" }, 500);
        }

        const rows = await env.DB
          .prepare(`
            SELECT
              id,
              source,
              source_id,
              title,
              artists_main,
              artists_all,
              raw_title,
              date_local,
              time_local,
              venue_name,
              city,
              country,
              url,
              image_url,
              genre_hint,
              fetched_at,
              created_at,
              updated_at
            FROM concerts
            WHERE date_local IS NOT NULL
              AND date_local != ''
            ORDER BY date_local ASC, time_local ASC, title ASC
            LIMIT 100
          `)
          .all();

        return json({
          ok: true,
          mode: "db-latest",
          count: rows?.results?.length || 0,
          events: (rows?.results || []).map(hydrateConcertRow)
        });
      }

      if (pathname === "/concerts/recommended") {
        if (!env?.DB) {
          return json({ ok: false, error: "Missing DB binding" }, 500);
        }

        const limit = clampInt(url.searchParams.get("limit"), 1, 2000, 500);
        const includeHidden = parseBoolean(url.searchParams.get("includeHidden"), false);
        const bucketed = parseBoolean(url.searchParams.get("bucketed"), false);
        const minFinalScore = clampNumber(url.searchParams.get("minFinalScore"), 0, 100, 20);

        const futureEvents = await loadFutureConcerts(env.DB, { limit });

        if (bucketed) {
          const result = await buildBucketedConcertRecommendations(env, futureEvents, {
            matcher: {
              minFinalScore,
              includeHidden
            },
            related: {
              maxSeeds: 50,
              similarPerSeed: 30,
              minRelatedScore: 10
            }
          });

          return json({
            ok: true,
            mode: "recommended-bucketed",
            ...result
          });
        }

        const result = await buildConcertRecommendationsLight(env, futureEvents, {
          matcher: {
            minFinalScore,
            includeHidden
          },
          related: {
            maxSeeds: 50,
            similarPerSeed: 30,
            minRelatedScore: 10
          }
        });

        return json({
          ok: true,
          mode: "recommended",
          ...result
        });
      }

      if (pathname === "/debug/paradiso/raw") {
        const page = Number(url.searchParams.get("page") || "1");
        const target =
          `https://www.podiuminfo.nl/podium/2/concerten/${page}/Paradiso/Amsterdam/`;

        const res = await fetch(target, {
          headers: {
            "user-agent": "Mozilla/5.0",
            "accept": "text/html,application/xhtml+xml"
          }
        });

        const text = await res.text();

        return new Response(text, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            ...corsHeaders()
          }
        });
      }
if (pathname === "/debug/paradiso/section") {
        const page = Number(url.searchParams.get("page") || "1");
        const target =
          `https://www.podiuminfo.nl/podium/2/concerten/${page}/Paradiso/Amsterdam/`;

        const res = await fetch(target, {
          headers: {
            "user-agent": "Mozilla/5.0",
            "accept": "text/html,application/xhtml+xml"
          }
        });

        const text = await res.text();
        const startIdx = text.indexOf("DATUM");

        let out = text;
        if (startIdx !== -1) {
          out = text.slice(startIdx);
          const cutCandidates = [
            out.indexOf("## "),
            out.indexOf("Meer concerten"),
            out.indexOf("Gerelateerde concerten")
          ].filter((x) => x !== -1);

          if (cutCandidates.length) {
            out = out.slice(0, Math.min(...cutCandidates));
          }
        }

        return new Response(out, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            ...corsHeaders()
          }
        });
      }

      return json({
        ok: false,
        error: "Not found",
        pathname
      }, 404);
    } catch (err) {
      return json({
        ok: false,
        error: err?.message || "Unknown error"
      }, 500);
    }
  }
};

async function loadFutureConcerts(db, { limit = 500 } = {}) {
  const today = amsterdamToday();

  const rows = await db
    .prepare(`
      SELECT
        id,
        source,
        source_id,
        title,
        artists_main,
        artists_all,
        raw_title,
        date_local,
        time_local,
        venue_name,
        city,
        country,
        url,
        image_url,
        genre_hint,
        fetched_at,
        created_at,
        updated_at
      FROM concerts
      WHERE date_local IS NOT NULL
        AND date_local != ''
        AND date_local >= ?
      ORDER BY date_local ASC, time_local ASC, title ASC
      LIMIT ?
    `)
    .bind(today, limit)
    .all();

  return (rows?.results || []).map(hydrateConcertRow);
}

function hydrateConcertRow(row) {
  return {
    ...row,
    artists_all: parseArtistsAll(row?.artists_all)
  };
}

function parseArtistsAll(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function cleanParam(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePath(pathname) {
  if (!pathname) return "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type"
  };
}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(v)) return true;
  if (["0", "false", "no", "n"].includes(v)) return false;
  return fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function amsterdamToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value || "";
  const m = parts.find((p) => p.type === "month")?.value || "";
  const d = parts.find((p) => p.type === "day")?.value || "";

  return `${y}-${m}-${d}`;
}