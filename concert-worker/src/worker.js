export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/admin/db-count") {
        return dbCount(env);
      }

      if (path === "/concerts/search") {
        return searchConcerts(url, env);
      }

      if (path === "/concerts/db-debug-score") {
        return debugScore(url, env);
      }

      return new Response("ok");
    } catch (e) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: e.message,
          stack: e.stack,
        }),
        { status: 500 }
      );
    }
  },
};
async function dbCount(env) {
  const row = await env.DB
    .prepare(`SELECT COUNT(*) as c FROM concerts`)
    .first();

  return json({
    ok: true,
    mode: "db-count",
    count: row?.c ?? 0,
  });
}

async function searchConcerts(url, env) {
  const q = (url.searchParams.get("q") || "").toLowerCase();

  const rows = await env.DB
    .prepare(`
      SELECT *
      FROM concerts
      WHERE
        LOWER(title) LIKE ?
        OR LOWER(artists_all) LIKE ?
      ORDER BY date_local ASC
      LIMIT 30
    `)
    .bind(`%${q}%`, `%${q}%`)
    .all();

  return json({
    ok: true,
    mode: "search",
    query: q,
    found: rows.results.length,
    results: rows.results,
  });
}
async function debugScore(url, env) {
  const q = (url.searchParams.get("q") || "").toLowerCase();

  const now = new Date().toISOString().slice(0, 10);

  const rows = await env.DB
    .prepare(`
      SELECT
        title,
        artists_all,
        venue_name,
        city,
        date_local
      FROM concerts
      WHERE date_local >= ?
      ORDER BY date_local ASC
      LIMIT 200
    `)
    .bind(now)
    .all();

  const scored = rows.results.map(r => {
    const text = (
      (r.title || "") +
      " " +
      (r.artists_all || "") +
      " " +
      (r.venue_name || "") +
      " " +
      (r.city || "")
    ).toLowerCase();

    let score = 0;

    if (text.includes(q)) score += 5;

    if (r.artists_all && r.artists_all.toLowerCase().includes(q))
      score += 10;

    return {
      ...r,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return json({
    ok: true,
    mode: "db-debug-score",
    query: q,
    total_pool: scored.length,
    top10: scored.slice(0, 10),
  });
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}