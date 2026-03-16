// worker.js
// Listening Mirror — Concert Worker
// FULL FILE REPLACE

import {
  fetchAllVenueEvents,
  fetchVenueEventsById
} from "./concert-fetch-engine.js";

import {
  scoreConcerts,
  filterRecommendedConcerts
} from "./concert-recommender.js";

import {
  buildTasteProfile,
  sortAffinityMap
} from "./taste-profile-engine.js";

import {
  fetchLastfmProfile,
  summarizeLastfmProfile
} from "./lastfm-client.js";

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
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

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (pathname === "/health") {
    return json({
      ok: true,
      service: "econcerts",
      status: "healthy",
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === "/admin/db-count") {
    assertDb(env);

    const row = await env.DB
      .prepare("SELECT COUNT(*) AS count FROM concerts")
      .first();

    return json({
      ok: true,
      mode: "db-count",
      count: Number(row?.count || 0)
    });
  }

  if (pathname === "/admin/refresh-db") {
    assertDb(env);

    const events = await fetchAllVenueEvents();
    const now = Date.now();

    let written = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await upsertConcert(env.DB, event, now);
        written += 1;
      } catch (err) {
        failed += 1;
      }
    }

    return json({
      ok: true,
      mode: "refresh-db",
      fetched: events.length,
      written,
      failed
    });
  }
if (pathname === "/concerts/db-latest") {
    assertDb(env);

    const limit = clampInt(url.searchParams.get("limit"), 20, 1, 500);

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
          AND date(date_local) >= date('now')
        ORDER BY
          date_local ASC,
          title ASC
        LIMIT ?
      `)
      .bind(limit)
      .all();

    return json({
      ok: true,
      mode: "db-latest",
      count: rows?.results?.length || 0,
      results: (rows?.results || []).map(hydrateConcertRow)
    });
  }

  if (pathname === "/concerts/db-search") {
    assertDb(env);

    const q = (url.searchParams.get("q") || "").trim();
    if (!q) {
      return json({ ok: false, error: "Missing q param" }, 400);
    }

    const limit = clampInt(url.searchParams.get("limit"), 50, 1, 500);
    const like = `%${q.toLowerCase()}%`;

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
          AND date(date_local) >= date('now')
          AND (
            LOWER(COALESCE(title, '')) LIKE ?
            OR LOWER(COALESCE(raw_title, '')) LIKE ?
            OR LOWER(COALESCE(artists_main, '')) LIKE ?
            OR LOWER(COALESCE(artists_all, '')) LIKE ?
            OR LOWER(COALESCE(venue_name, '')) LIKE ?
            OR LOWER(COALESCE(city, '')) LIKE ?
          )
        ORDER BY
          date_local ASC,
          title ASC
        LIMIT ?
      `)
      .bind(like, like, like, like, like, like, limit)
      .all();

    return json({
      ok: true,
      mode: "db-search",
      query: q,
      found: rows?.results?.length || 0,
      results: (rows?.results || []).map(hydrateConcertRow)
    });
  }

  if (pathname === "/concerts/db-debug-score") {
    assertDb(env);

    const q = (url.searchParams.get("q") || "").trim();
    if (!q) {
      return json({ ok: false, error: "Missing q param" }, 400);
    }

    const like = `%${q.toLowerCase()}%`;

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
          AND date(date_local) >= date('now')
          AND (
            LOWER(COALESCE(title, '')) LIKE ?
            OR LOWER(COALESCE(raw_title, '')) LIKE ?
            OR LOWER(COALESCE(artists_main, '')) LIKE ?
            OR LOWER(COALESCE(artists_all, '')) LIKE ?
          )
        ORDER BY
          date_local ASC,
          title ASC
        LIMIT 100
      `)
      .bind(like, like, like, like)
      .all();

    const events = (rows?.results || []).map(hydrateConcertRow);

    const lastfmProfile = await fetchLastfmProfile(env);
    const affinityMap = buildTasteProfile(lastfmProfile);

    const scored = scoreConcerts(events, affinityMap);

    return json({
      ok: true,
      mode: "db-debug-score",
      query: q,
      found: scored.length,
      scored
    });
  }
if (pathname === "/concerts/db-recommended") {
    assertDb(env);

    const limit = clampInt(url.searchParams.get("limit"), 1000, 1, 5000);
    const minScore = clampFloat(url.searchParams.get("minScore"), 0.12, 0, 1);

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
          AND date(date_local) >= date('now')
        ORDER BY
          date_local ASC,
          title ASC
        LIMIT ?
      `)
      .bind(limit)
      .all();

    const concerts = (rows?.results || []).map(hydrateConcertRow);

    const lastfmProfile = await fetchLastfmProfile(env);
    const affinityMap = buildTasteProfile(lastfmProfile);

    const scored = scoreConcerts(concerts, affinityMap);
    const recommended = filterRecommendedConcerts(scored, {
      minScore,
      includeWeakSignals: false,
      includeFarFuture: true,
      returnTiers: false
    });

    return json({
      ok: true,
      mode: "db-recommended",
      total_future_events: concerts.length,
      min_score: minScore,
      recommended_count: recommended.length,
      recommended
    });
  }

  if (pathname === "/concerts/db-recommended-tiers") {
    assertDb(env);

    const limit = clampInt(url.searchParams.get("limit"), 1500, 1, 5000);
    const minScore = clampFloat(url.searchParams.get("minScore"), 0.12, 0, 1);
    const limitPerTier = clampInt(url.searchParams.get("limitPerTier"), 40, 1, 300);

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
          AND date(date_local) >= date('now')
        ORDER BY
          date_local ASC,
          title ASC
        LIMIT ?
      `)
      .bind(limit)
      .all();

    const concerts = (rows?.results || []).map(hydrateConcertRow);

    const lastfmProfile = await fetchLastfmProfile(env);
    const affinityMap = buildTasteProfile(lastfmProfile);

    const scored = scoreConcerts(concerts, affinityMap);
    const tiers = filterRecommendedConcerts(scored, {
      minScore,
      includeWeakSignals: false,
      includeFarFuture: true,
      limitPerTier,
      returnTiers: true
    });

    return json({
      ok: true,
      mode: "db-recommended-tiers",
      total_future_events: concerts.length,
      min_score: minScore,
      tiers
    });
  }

  if (pathname === "/concerts/venues") {
    const source = (url.searchParams.get("source") || "").trim().toLowerCase();

    if (source) {
      const events = await fetchVenueEventsById(source);

      return json({
        ok: true,
        mode: "single-source",
        source,
        count: events.length,
        events
      });
    }

    const events = await fetchAllVenueEvents();

    return json({
      ok: true,
      mode: "all-venues",
      count: events.length,
      events
    });
  }

  if (pathname === "/concerts/search") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    if (!q) {
      return json({ ok: false, error: "Missing q param" }, 400);
    }

    const events = await fetchAllVenueEvents();

    const results = events.filter((e) => {
      const blob = [
        e.title || "",
        e.raw_title || "",
        ...(Array.isArray(e.artists_all) ? e.artists_all : [])
      ]
        .join(" ")
        .toLowerCase();

      return blob.includes(q);
    });

    return json({
      ok: true,
      mode: "search",
      query: q,
      total_pool: events.length,
      found: results.length,
      results
    });
  }

  if (pathname === "/lastfm/debug") {
    const profile = await fetchLastfmProfile(env);
    const summary = summarizeLastfmProfile(profile);
    const affinityMap = buildTasteProfile(profile);
    const topAffinity = sortAffinityMap(affinityMap).slice(0, 50);

    return json({
      ok: true,
      mode: "lastfm-debug",
      summary,
      topAffinity
    });
  }

  if (pathname === "/concerts/recommended") {
    const allEvents = await fetchAllVenueEvents();
    const lastfmProfile = await fetchLastfmProfile(env);
    const affinityMap = buildTasteProfile(lastfmProfile);

    const scored = scoreConcerts(allEvents, affinityMap);
    const recommended = filterRecommendedConcerts(scored, {
      minScore: 0.12,
      includeWeakSignals: false,
      includeFarFuture: true,
      returnTiers: false
    });

    return json({
      ok: true,
      mode: "recommended",
      total_events: allEvents.length,
      recommended_count: recommended.length,
      recommended
    });
  }

  if (pathname === "/concerts/recommended-tiers") {
    const allEvents = await fetchAllVenueEvents();
    const lastfmProfile = await fetchLastfmProfile(env);
    const affinityMap = buildTasteProfile(lastfmProfile);

    const scored = scoreConcerts(allEvents, affinityMap);
    const tiers = filterRecommendedConcerts(scored, {
      minScore: 0.12,
      includeWeakSignals: false,
      includeFarFuture: true,
      limitPerTier: 40,
      returnTiers: true
    });

    return json({
      ok: true,
      mode: "recommended-tiers",
      total_events: allEvents.length,
      tiers
    });
  }
if (pathname === "/") {
    return json({
      ok: true,
      service: "econcerts",
      endpoints: [
        "/health",
        "/admin/db-count",
        "/admin/refresh-db",
        "/concerts/db-latest",
        "/concerts/db-latest?limit=50",
        "/concerts/db-search?q=amenra",
        "/concerts/db-search?q=opeth",
        "/concerts/db-debug-score?q=opeth",
        "/concerts/db-recommended",
        "/concerts/db-recommended?limit=1000&minScore=0.08",
        "/concerts/db-recommended-tiers",
        "/concerts/db-recommended-tiers?limit=1500&minScore=0.08&limitPerTier=50",
        "/concerts/venues",
        "/concerts/venues?source=tivoli",
        "/concerts/venues?source=paradiso",
        "/concerts/search?q=amenra",
        "/lastfm/debug",
        "/concerts/recommended",
        "/concerts/recommended-tiers"
      ]
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
}

function assertDb(env) {
  if (!env?.DB) {
    throw new Error("Missing DB binding");
  }
}

async function upsertConcert(DB, event, now) {
  const id = String(event?.source_id || "").trim();
  if (!id) {
    throw new Error("Missing source_id");
  }

  const stmt = DB.prepare(`
    INSERT INTO concerts (
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
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      source_id = excluded.source_id,
      title = excluded.title,
      artists_main = excluded.artists_main,
      artists_all = excluded.artists_all,
      raw_title = excluded.raw_title,
      date_local = excluded.date_local,
      time_local = excluded.time_local,
      venue_name = excluded.venue_name,
      city = excluded.city,
      country = excluded.country,
      url = excluded.url,
      image_url = excluded.image_url,
      genre_hint = excluded.genre_hint,
      fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at
  `);

  await stmt.bind(
    id,
    safe(event.source),
    safe(event.source_id),
    safe(event.title),
    safe(event.artists_main),
    JSON.stringify(Array.isArray(event.artists_all) ? event.artists_all : []),
    safe(event.raw_title),
    safe(event.date_local),
    safe(event.time_local),
    safe(event.venue_name),
    safe(event.city),
    safe(event.country),
    safe(event.url),
    safe(event.image_url),
    safe(event.genre_hint),
    Number(event.fetched_at || now),
    now,
    now
  ).run();
}

function hydrateConcertRow(row) {
  return {
    ...row,
    artists_all: parseArtistsAll(row?.artists_all)
  };
}

function parseArtistsAll(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value, fallback, min, max) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safe(value) {
  if (value === undefined || value === null) return null;
  return String(value);
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

function normalizePath(pathname) {
  if (!pathname) return "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}