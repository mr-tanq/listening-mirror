// worker.js
// Listening Mirror — Concert Worker
// FULL FILE REPLACE — PART 1/4

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

  if (pathname === "/admin/refresh-source") {
    assertDb(env);

    const source = (url.searchParams.get("source") || "").trim().toLowerCase();
    if (!source) {
      return json(
        {
          ok: false,
          error: "Missing source param"
        },
        400
      );
    }

    const events = await fetchVenueEventsById(source);
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
      mode: "refresh-source",
      source,
      fetched: events.length,
      written,
      failed
    });
  }

  if (pathname === "/admin/dedupe-db") {
    assertDb(env);

    const preview = (url.searchParams.get("preview") || "").trim() === "1";

    const duplicateRows = await env.DB.prepare(`
      SELECT
        c1.id,
        c1.source,
        c1.url,
        c1.date_local
      FROM concerts c1
      WHERE EXISTS (
        SELECT 1
        FROM concerts c2
        WHERE
          COALESCE(c2.source, '') = COALESCE(c1.source, '')
          AND COALESCE(c2.url, '') = COALESCE(c1.url, '')
          AND COALESCE(c2.date_local, '') = COALESCE(c1.date_local, '')
          AND (
            COALESCE(c2.updated_at, 0) > COALESCE(c1.updated_at, 0)
            OR (
              COALESCE(c2.updated_at, 0) = COALESCE(c1.updated_at, 0)
              AND COALESCE(c2.fetched_at, 0) > COALESCE(c1.fetched_at, 0)
            )
            OR (
              COALESCE(c2.updated_at, 0) = COALESCE(c1.updated_at, 0)
              AND COALESCE(c2.fetched_at, 0) = COALESCE(c1.fetched_at, 0)
              AND COALESCE(c2.id, '') > COALESCE(c1.id, '')
            )
          )
      )
    `).all();

    const idsToDelete = (duplicateRows?.results || []).map((r) => r.id).filter(Boolean);

    if (preview) {
      return json({
        ok: true,
        mode: "dedupe-preview",
        duplicates_found: idsToDelete.length,
        sample_ids: idsToDelete.slice(0, 100)
      });
    }

    let deleted = 0;
    for (const id of idsToDelete) {
      await env.DB.prepare("DELETE FROM concerts WHERE id = ?").bind(id).run();
      deleted += 1;
    }

    return json({
      ok: true,
      mode: "dedupe-db",
      duplicates_deleted: deleted
    });
  }

  if (pathname === "/concerts/db-latest") {
    assertDb(env);

    const limit = clampInt(url.searchParams.get("limit"), 20, 1, 500);

    const rows = await env.DB
      .prepare(dedupedSelectSql(`
        ORDER BY
          date_local ASC,
          title ASC
        LIMIT ?
      `))
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
      return json(
        {
          ok: false,
          error: "Missing q param"
        },
        400
      );
    }

    const limit = clampInt(url.searchParams.get("limit"), 50, 1, 500);
    const like = `%${q.toLowerCase()}%`;

    const rows = await env.DB
      .prepare(dedupedSelectSql(`
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
      `))
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
      return json(
        {
          ok: false,
          error: "Missing q param"
        },
        400
      );
    }

    const like = `%${q.toLowerCase()}%`;

    const rows = await env.DB
      .prepare(dedupedSelectSql(`
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
      `))
      .bind(like, like, like, like)
      .all();
    // worker.js
// FULL FILE REPLACE — PART 2/4

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
      .prepare(dedupedSelectSql(`
        ORDER BY
          date_local ASC,
          title ASC
        LIMIT ?
      `))
      .bind(limit)
      .all();

    const concerts = (rows?.results || []).map(hydrateConcertRow);

    const lastfmProfile = await fetchLastfmProfile(env);
    const affinityMap = buildTasteProfile(lastfmProfile);

    const scored = scoreConcerts(concerts, affinityMap);
    const recommended = filterRecommendedConcerts(scored, {
      minScore,
      includeWeakSignals: false
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
      return json(
        {
          ok: false,
          error: "Missing q param"
        },
        400
      );
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
      includeWeakSignals: false
    });

    return json({
      ok: true,
      mode: "recommended",
      total_events: allEvents.length,
      recommended_count: recommended.length,
      recommended
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
        "/admin/refresh-source?source=paradiso",
        "/admin/refresh-source?source=tivoli",
        "/admin/dedupe-db?preview=1",
        "/admin/dedupe-db",
        "/concerts/db-latest",
        "/concerts/db-latest?limit=50",
        "/concerts/db-search?q=amenra",
        "/concerts/db-search?q=mono",
        "/concerts/db-search?q=villagers",
        "/concerts/db-search?q=solstafir",
        "/concerts/db-debug-score?q=solstafir",
        "/concerts/db-recommended",
        "/concerts/db-recommended?limit=1000",
        "/concerts/db-recommended?limit=1000&minScore=0.08",
        "/concerts/venues",
        "/concerts/venues?source=tivoli",
        "/concerts/venues?source=013",
        "/concerts/venues?source=paradiso",
        "/concerts/venues?source=melkweg",
        "/concerts/venues?source=paard",
        "/concerts/venues?source=doornroosje",
        "/concerts/venues?source=patronaat",
        "/concerts/venues?source=effenaar",
        "/concerts/venues?source=vera",
        "/concerts/venues?source=hedon",
        "/concerts/venues?source=muziekgieterij",
        "/concerts/venues?source=boerderij",
        "/concerts/venues?source=fluor",
        "/concerts/search?q=amenra",
        "/lastfm/debug",
        "/concerts/recommended"
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

function dedupedSelectSql(extra = "") {
  return `
    SELECT
      c.id,
      c.source,
      c.source_id,
      c.title,
      c.artists_main,
      c.artists_all,
      c.raw_title,
      c.date_local,
      c.time_local,
      c.venue_name,
      c.city,
      c.country,
      c.url,
      c.image_url,
      c.genre_hint,
      c.fetched_at,
      c.created_at,
      c.updated_at
    FROM concerts c
    WHERE
      c.date_local IS NOT NULL
      AND c.date_local != ''
      AND date(c.date_local) >= date('now')
      AND NOT EXISTS (
        SELECT 1
        FROM concerts newer
        WHERE
          COALESCE(newer.source, '') = COALESCE(c.source, '')
          AND COALESCE(newer.url, '') = COALESCE(c.url, '')
          AND COALESCE(newer.date_local, '') = COALESCE(c.date_local, '')
          AND (
            COALESCE(newer.updated_at, 0) > COALESCE(c.updated_at, 0)
            OR (
              COALESCE(newer.updated_at, 0) = COALESCE(c.updated_at, 0)
              AND COALESCE(newer.fetched_at, 0) > COALESCE(c.fetched_at, 0)
            )
            OR (
              COALESCE(newer.updated_at, 0) = COALESCE(c.updated_at, 0)
              AND COALESCE(newer.fetched_at, 0) = COALESCE(c.fetched_at, 0)
              AND COALESCE(newer.id, '') > COALESCE(c.id, '')
            )
          )
      )
    ${extra}
  `;
  }
// worker.js
// FULL FILE REPLACE — PART 3/4

async function upsertConcert(DB, event, now) {
  const normalized = normalizeConcertIdentity(event);
  const id = normalized.id;

  if (!id) {
    throw new Error("Missing source_id");
  }

  // 1) σβήσε ό,τι παλιό duplicate υπάρχει με ίδιο source+url+date_local
  await deleteCanonicalDuplicates(DB, normalized);

  // 2) γράψε το event
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
    safe(normalized.source),
    safe(normalized.source_id),
    safe(normalized.title),
    safe(normalized.artists_main),
    JSON.stringify(Array.isArray(normalized.artists_all) ? normalized.artists_all : []),
    safe(normalized.raw_title),
    safe(normalized.date_local),
    safe(normalized.time_local),
    safe(normalized.venue_name),
    safe(normalized.city),
    safe(normalized.country),
    safe(normalized.url),
    safe(normalized.image_url),
    safe(normalized.genre_hint),
    Number(normalized.fetched_at || now),
    now,
    now
  ).run();
}

async function deleteCanonicalDuplicates(DB, event) {
  const source = String(event?.source || "").trim();
  const url = String(event?.url || "").trim();
  const dateLocal = String(event?.date_local || "").trim();

  if (!source || !url || !dateLocal) {
    return;
  }

  const existing = await DB.prepare(`
    SELECT id
    FROM concerts
    WHERE
      COALESCE(source, '') = ?
      AND COALESCE(url, '') = ?
      AND COALESCE(date_local, '') = ?
  `)
    .bind(source, url, dateLocal)
    .all();

  const ids = (existing?.results || [])
    .map((r) => r.id)
    .filter(Boolean);

  for (const existingId of ids) {
    if (existingId !== event.id) {
      await DB.prepare("DELETE FROM concerts WHERE id = ?").bind(existingId).run();
    }
  }
}

function normalizeConcertIdentity(event) {
  const source = String(event?.source || "").trim().toLowerCase();
  const url = String(event?.url || "").trim();
  const dateLocal = normalizeDateLocal(event?.date_local);
  const title = cleanText(event?.title);
  const sourceId = cleanText(event?.source_id);
  const rawTitle = cleanText(event?.raw_title);
  const artistsMain = cleanText(event?.artists_main);
  const venueName = cleanText(event?.venue_name);
  const city = cleanText(event?.city);
  const country = cleanText(event?.country);
  const timeLocal = normalizeTimeLocal(event?.time_local);
  const imageUrl = cleanText(event?.image_url);
  const genreHint = cleanText(event?.genre_hint);
  const artistsAll = normalizeArtistsAll(event?.artists_all);

  const stableId = buildStableConcertId({
    source,
    url,
    dateLocal,
    title,
    sourceId
  });

  return {
    ...event,
    id: stableId,
    source,
    source_id: stableId,
    title,
    artists_main: artistsMain || title,
    artists_all: artistsAll,
    raw_title: rawTitle || title,
    date_local: dateLocal,
    time_local: timeLocal,
    venue_name: venueName,
    city,
    country,
    url,
    image_url: imageUrl,
    genre_hint: genreHint
  };
}

function buildStableConcertId({ source, url, dateLocal, title, sourceId }) {
  const src = slugify(source || "event");
  const date = slugify(dateLocal || "unknown-date");
  const titleSlug = slugify(title || "unknown-title");

  // πάρε το τελευταίο numeric segment από το URL αν υπάρχει
  const urlTail = extractUrlTail(url) || slugify(sourceId || "");
  const tail = slugify(urlTail || "event");

  return `${src}-${titleSlug}-${date}-${tail}`;
}

function extractUrlTail(url) {
  const str = String(url || "").trim();
  if (!str) return "";

  const noQuery = str.split("?")[0].split("#")[0];
  const parts = noQuery.split("/").filter(Boolean);
  if (!parts.length) return "";

  const last = parts[parts.length - 1];
  if (last) return last;

  return parts[parts.length - 2] || "";
}
// worker.js
// FULL FILE REPLACE — PART 4/4

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

function normalizeArtistsAll(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => cleanText(x))
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => cleanText(x))
          .filter(Boolean);
      }
    } catch {
      return [cleanText(value)].filter(Boolean);
    }
  }

  return [];
}

function normalizeDateLocal(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  return v;
}

function normalizeTimeLocal(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return v;

  const hh = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  return `${hh}:${mm}`;
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
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
