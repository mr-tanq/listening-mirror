import { refreshSource } from "../db/concert-refresh.js";
import { fetchVenueEventsById } from "../core/concert-fetch-engine.js";

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
            "/concerts/db-latest"
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
          return json(
            {
              ok: false,
              error: "Missing source"
            },
            400
          );
        }

        if (!env?.DB) {
          return json(
            {
              ok: false,
              error: "Missing DB binding"
            },
            500
          );
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
          return json(
            {
              ok: false,
              error: "Missing source"
            },
            400
          );
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
          return json(
            {
              ok: false,
              error: "Missing DB binding"
            },
            500
          );
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
            WHERE
              date_local IS NOT NULL
              AND date_local != ''
            ORDER BY
              date_local ASC,
              time_local ASC,
              title ASC
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

      return json(
        {
          ok: false,
          error: "Not found",
          pathname
        },
        404
      );
    } catch (err) {
      return json(
        {
          ok: false,
          error: err?.message || "Unknown error"
        },
        500
      );
    }
  }
};

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