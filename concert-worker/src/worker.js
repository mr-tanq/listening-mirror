import { refreshSource } from "../db/concert-refresh.js";

export default {
  async fetch(req, env) {

    const url = new URL(req.url);

    if (url.pathname === "/admin/refresh-source") {
      const source = url.searchParams.get("source");

      const res = await refreshSource(env.DB, source);

      return Response.json({
        ok: true,
        ...res
      });
    }

    if (url.pathname === "/concerts/db-latest") {
      const rows = await env.DB.prepare(`
        SELECT *
        FROM concerts
        ORDER BY date_local ASC
        LIMIT 100
      `).all();

      return Response.json({
        ok: true,
        events: rows.results
      });
    }

    return new Response("ok");
  }
};
