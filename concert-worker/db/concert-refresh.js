import { fetchVenueEventsById } from "../core/concert-fetch-engine.js";

const SUPPORTED_REFRESH_SOURCES = [
  "tivoli",
  "013",
  "paradiso",
  "melkweg",
  "paard",
  "doornroosje",
  "patronaat",
  "effenaar",
  "vera",
  "hedon",
  "muziekgieterij",
  "boerderij"
];

export async function refreshSource(db, source) {
  const normalizedSource = cleanParam(source);

  if (!normalizedSource) {
    throw new Error("Missing source");
  }

  if (!SUPPORTED_REFRESH_SOURCES.includes(normalizedSource)) {
    throw new Error(`Unsupported source: ${normalizedSource}`);
  }

  const startedAt = Date.now();
  const fetchedEvents = await fetchVenueEventsById(normalizedSource);
  const safeEvents = Array.isArray(fetchedEvents) ? fetchedEvents : [];

  const normalizedEvents = dedupeIncomingEvents(
    safeEvents
      .map((event) => normalizeConcertForDb(event, normalizedSource))
      .filter(Boolean)
  );

  const stats = {
    source: normalizedSource,
    fetched: safeEvents.length,
    normalized: normalizedEvents.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    deletedPast: 0,
    durationMs: 0
  };

  await ensureConcertsTable(db);

  await db.batch(
    normalizedEvents.map((event) => {
      return db
        .prepare(`
          INSERT INTO concerts (
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            source = excluded.source,
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
        `)
        .bind(
          event.source,
          event.source_id,
          event.title,
          event.artists_main,
          JSON.stringify(event.artists_all || []),
          event.raw_title,
          event.date_local,
          event.time_local,
          event.venue_name,
          event.city,
          event.country,
          event.url,
          event.image_url,
          event.genre_hint,
          event.fetched_at,
          event.created_at,
          event.updated_at
        );
    })
  );

  const existingRows = await db
    .prepare(`
      SELECT source_id
      FROM concerts
      WHERE source = ?
        AND date_local >= ?
    `)
    .bind(normalizedSource, amsterdamToday())
    .all();

  const existingIds = new Set(
    (existingRows?.results || [])
      .map((row) => cleanText(row?.source_id))
      .filter(Boolean)
  );

  const incomingIds = new Set(
    normalizedEvents
      .map((event) => cleanText(event?.source_id))
      .filter(Boolean)
  );

  for (const id of incomingIds) {
    if (existingIds.has(id)) {
      stats.updated += 1;
    } else {
      stats.inserted += 1;
    }
  }

  const staleIds = [...existingIds].filter((id) => !incomingIds.has(id));

  if (staleIds.length > 0) {
    await deleteConcertsBySourceIds(db, staleIds);
    stats.deletedPast = staleIds.length;
  }

  stats.durationMs = Date.now() - startedAt;

  return stats;
}

export async function refreshAllSources(db, sources = SUPPORTED_REFRESH_SOURCES) {
  const normalizedSources = Array.isArray(sources)
    ? sources.map((source) => cleanParam(source)).filter(Boolean)
    : [];

  const validSources = [];
  const seen = new Set();

  for (const source of normalizedSources) {
    if (!SUPPORTED_REFRESH_SOURCES.includes(source)) continue;
    if (seen.has(source)) continue;
    seen.add(source);
    validSources.push(source);
  }

  if (!validSources.length) {
    throw new Error("No valid sources provided");
  }

  const startedAt = Date.now();
  const results = [];
  const failed = [];

  for (const source of validSources) {
    try {
      const result = await refreshSource(db, source);
      results.push(result);
    } catch (err) {
      failed.push({
        source,
        error: err?.message || "Unknown refresh error"
      });
    }
  }

  return {
    requestedSources: validSources,
    totalSourcesRequested: validSources.length,
    totalSourcesSucceeded: results.length,
    totalSourcesFailed: failed.length,
    durationMs: Date.now() - startedAt,
    results,
    failed
  };
}
async function ensureConcertsTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS concerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL UNIQUE,
      title TEXT,
      artists_main TEXT,
      artists_all TEXT,
      raw_title TEXT,
      date_local TEXT,
      time_local TEXT,
      venue_name TEXT,
      city TEXT,
      country TEXT,
      url TEXT,
      image_url TEXT,
      genre_hint TEXT,
      fetched_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_concerts_source
      ON concerts(source);

    CREATE INDEX IF NOT EXISTS idx_concerts_date_local
      ON concerts(date_local);

    CREATE INDEX IF NOT EXISTS idx_concerts_source_date
      ON concerts(source, date_local);
  `);
}

async function deleteConcertsBySourceIds(db, sourceIds) {
  const ids = Array.isArray(sourceIds) ? sourceIds.filter(Boolean) : [];
  if (!ids.length) return;

  const chunkSize = 200;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");

    await db
      .prepare(`
        DELETE FROM concerts
        WHERE source_id IN (${placeholders})
      `)
      .bind(...chunk)
      .run();
  }
}

function normalizeConcertForDb(event, fallbackSource) {
  const source = cleanParam(event?.source || fallbackSource);
  const title = cleanText(event?.title);
  const dateLocal = cleanText(event?.date_local);

  if (!source || !title || !dateLocal) {
    return null;
  }

  const now = Date.now();
  const artistsAll = normalizeArtistsAll(event?.artists_all, event?.artists_main, title);

  const venueName = cleanText(event?.venue_name);
  const city = cleanText(event?.city);
  const timeLocal = normalizeTime(event?.time_local);
  const sourceId =
    cleanText(event?.source_id) ||
    buildFallbackSourceId({
      source,
      title,
      dateLocal,
      timeLocal,
      venueName,
      city
    });

  return {
    source,
    source_id: sourceId,
    title,
    artists_main: cleanText(event?.artists_main || title),
    artists_all: artistsAll,
    raw_title: cleanText(event?.raw_title || title),
    date_local: dateLocal,
    time_local: timeLocal || null,
    venue_name: venueName || null,
    city: city || null,
    country: cleanText(event?.country || "NL") || "NL",
    url: cleanText(event?.url) || null,
    image_url: cleanText(event?.image_url) || null,
    genre_hint: cleanText(event?.genre_hint) || null,
    fetched_at: toFiniteNumber(event?.fetched_at, now),
    created_at: toFiniteNumber(event?.created_at, now),
    updated_at: now
  };
}

function dedupeIncomingEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const bestByKey = new Map();

  for (const event of list) {
    const key = cleanText(event?.source_id);
    if (!key) continue;

    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, event);
      continue;
    }

    if (preferIncomingEvent(event, prev)) {
      bestByKey.set(key, event);
    }
  }

  return Array.from(bestByKey.values()).sort(compareConcertRows);
}

function preferIncomingEvent(nextEvent, prevEvent) {
  const nextHasImage = Boolean(cleanText(nextEvent?.image_url));
  const prevHasImage = Boolean(cleanText(prevEvent?.image_url));
  if (nextHasImage !== prevHasImage) return nextHasImage;

  const nextHasUrl = Boolean(cleanText(nextEvent?.url));
  const prevHasUrl = Boolean(cleanText(prevEvent?.url));
  if (nextHasUrl !== prevHasUrl) return nextHasUrl;

  const nextArtists = Array.isArray(nextEvent?.artists_all) ? nextEvent.artists_all.length : 0;
  const prevArtists = Array.isArray(prevEvent?.artists_all) ? prevEvent.artists_all.length : 0;
  if (nextArtists !== prevArtists) return nextArtists > prevArtists;

  return Number(nextEvent?.fetched_at || 0) > Number(prevEvent?.fetched_at || 0);
}

function compareConcertRows(a, b) {
  const dateA = `${a?.date_local || ""} ${a?.time_local || "99:99"}`;
  const dateB = `${b?.date_local || ""} ${b?.time_local || "99:99"}`;
  const dateCmp = dateA.localeCompare(dateB);
  if (dateCmp !== 0) return dateCmp;

  const cityCmp = String(a?.city || "").localeCompare(String(b?.city || ""));
  if (cityCmp !== 0) return cityCmp;

  const venueCmp = String(a?.venue_name || "").localeCompare(String(b?.venue_name || ""));
  if (venueCmp !== 0) return venueCmp;

  return String(a?.title || "").localeCompare(String(b?.title || ""));
}

function normalizeArtistsAll(value, artistsMain, title) {
  if (Array.isArray(value)) {
    const cleaned = value.map(cleanText).filter(Boolean);
    if (cleaned.length) return uniqueStrings(cleaned);
  }

  const fallback = [artistsMain, title].map(cleanText).filter(Boolean);
  return uniqueStrings(fallback);
}

function buildFallbackSourceId({ source, title, dateLocal, timeLocal, venueName, city }) {
  return [
    source,
    slugify(title),
    slugify(venueName || city || "unknown"),
    dateLocal,
    slugify(timeLocal || "no-time")
  ].join("-");
}

function normalizeTime(value) {
  const v = cleanText(value);
  if (!v) return "";
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return v;

  const hh = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  return `${hh}:${mm}`;
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

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanParam(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const v = cleanText(value);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }

  return out;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}
