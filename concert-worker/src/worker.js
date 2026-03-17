import { refreshSource } from "../db/concert-refresh.js";
import { fetchVenueEventsById } from "../concert-fetch-engine.js";

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({
          ok: true,
          service: "econcerts"
        });
      } 
 
      if (url.pathname === "/admin/refresh-source") {
        const source = (url.searchParams.get("source") || "").trim().toLowerCase();

        if (!source) {
          return Response.json(
            {
              ok: false,
              error: "Missing source"
            },
            { status: 400 }
          );
        }

        const res = await refreshSource(env.DB, source);

        return Response.json({
          ok: true,
          ...res
        });
      }

      if (url.pathname === "/concerts/venues") {
        const source = (url.searchParams.get("source") || "").trim().toLowerCase();

        if (!source) {
          return Response.json(
            {
              ok: false,
              error: "Missing source"
            },
            { status: 400 }
          );
        }

        const events = await fetchVenueEventsById(source);

        return Response.json({
          ok: true,
          mode: "single-source",
          source,
          count: Array.isArray(events) ? events.length : 0,
          events: Array.isArray(events) ? events : []
        });
      }

      if (url.pathname === "/concerts/db-latest") {
        const rows = await env.DB.prepare(`
          SELECT *
          FROM concerts
          ORDER BY date_local ASC, time_local ASC
          LIMIT 100
        `).all();

        return Response.json({
          ok: true,
          mode: "db-latest",
          count: rows?.results?.length || 0,
          events: rows?.results || []
        });
      }

      return Response.json(
        {
          ok: false,
          error: "Not found",
          pathname: url.pathname
        },
        { status: 404 }
      );
    } catch (err) {
      return Response.json(
        {
          ok: false,
          error: err?.message || "Unknown error"
        },
        { status: 500 }
      );
    }
  }
};