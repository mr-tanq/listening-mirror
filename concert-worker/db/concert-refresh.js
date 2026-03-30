import { fetchVenueEventsById } from "../core/concert-fetch-engine.js";

const DEFAULT_SOURCES = [
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

const DELETE_CHUNK_SIZE = 25;

export async function refreshSource(db, source, options = {}) {
  const startedAt = Date.now();
  const cleanSource = cleanParam(source);

  if (!db) {
    throw new Error("Missing DB binding");
  }

  if (!cleanSource) {
    throw new Error("Missing source");
  }

  await ensureConcertsSchema(db);

  const fetched = await fetchVenueEventsById(cleanSource);
  const normalizedEvents = normalizeIncomingEvents(fetched, cleanSource);
  const incomingIds = new Set(
    normalizedEvents
      .map((event) => cleanText(event.source_id))
      .filter(Boolean)
  );

  const existingSourceIds = await loadSourceIds(db, cleanSource);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const event of normalizedEvents) {
    const existingRow = await findConcertBySourceId(db, event.source_id);

    if (existingRow) {
      const changed = await updateConcertIfChanged(db, existingRow, event);
      if (changed) {
        updated += 1;
      } else {
        skipped += 1;
      }
    } else {
      await insertConcert(db, event);
      inserted += 1;
    }
  }

  const staleIds = existingSourceIds.filter((sourceId) => !incomingIds.has(sourceId));
  const deletedStale = await deleteConcertsBySourceIds(db, staleIds, DELETE_CHUNK_SIZE);
  const deletedPast = await deletePastConcertsForSource(db, cleanSource);

  return {
    source: cleanSource,
    fetched: Array.isArray(fetched) ? fetched.length : 0,
    normalized: normalizedEvents.length,
    inserted,
    updated,
    skipped,
    deletedStale,
    deletedPast,
    durationMs: Date.now() - startedAt
  };
}

export async function refreshAllSources(db, sources = DEFAULT_SOURCES) {
  const startedAt = Date.now();

  if (!db) {
    throw new Error("Missing DB binding");
  }

  const requestedSources = uniqueValidSources(sources);
  await ensureConcertsSchema(db);

  const results = [];
  const failed = [];

  for (const source of requestedSources) {
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
    ok: failed.length === 0,
    mode: "refresh-all-sources",
    requestedSources,
    totalSourcesRequested: requestedSources.length,
    totalSourcesSucceeded: results.length,
    totalSourcesFailed: failed.length,
    durationMs: Date.now() - startedAt,
    results,
    failed
  };
}
async function ensureConcertsSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS concerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artists_main TEXT,
      artists_all TEXT,
      raw_title TEXT,
      date_local TEXT NOT NULL,
      time_local TEXT,
      venue_name TEXT,
      city TEXT,
      country TEXT,
      url TEXT,
      image_url TEXT,
      genre_hint TEXT,
      fetched_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concerts_source ON concerts(source);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concerts_source_id ON concerts(source_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concerts_date_local ON concerts(date_local);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concerts_source_date ON concerts(source, date_local);
  `);
}

function normalizeIncomingEvents(events, fallbackSource) {
  const list = Array.isArray(events) ? events : [];
  const seen = new Set();
  const nowTs = Date.now();
  const out = [];

  for (const rawEvent of list) {
    const event = normalizeEventRow(rawEvent, fallbackSource, nowTs);
    if (!event) continue;

    const key = cleanText(event.source_id);
    if (!key) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(event);
  }

  return out.sort(compareNormalizedConcerts);
}

function normalizeEventRow(rawEvent, fallbackSource, nowTs) {
  const source = cleanParam(rawEvent?.source || fallbackSource);
  const title = cleanText(rawEvent?.title);
  const dateLocal = cleanText(rawEvent?.date_local);

  if (!source || !title || !dateLocal) {
    return null;
  }

  const artistsAll = normalizeArtistsAll(rawEvent?.artists_all, rawEvent?.artists_main, title);
  const venueName = cleanText(rawEvent?.venue_name);
  const city = cleanText(rawEvent?.city);
  const timeLocal = normalizeTime(rawEvent?.time_local);

  const sourceId =
    cleanText(rawEvent?.source_id) ||
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
    artists_main: cleanText(rawEvent?.artists_main) || title,
    artists_all: JSON.stringify(artistsAll),
    raw_title: cleanText(rawEvent?.raw_title) || title,
    date_local: dateLocal,
    time_local: timeLocal || null,
    venue_name: venueName || null,
    city: city || null,
    country: cleanText(rawEvent?.country) || "NL",
    url: cleanText(rawEvent?.url) || null,
    image_url: cleanText(rawEvent?.image_url) || null,
    genre_hint: cleanText(rawEvent?.genre_hint) || null,
    fetched_at: toInt(rawEvent?.fetched_at, nowTs),
    created_at: nowTs,
    updated_at: nowTs
  };
}

function normalizeArtistsAll(value, artistsMain, title) {
  if (Array.isArray(value)) {
    const arr = value.map(cleanText).filter(Boolean);
    if (arr.length) return arr;
  }

  const parsed = tryParseJsonArray(value);
  if (parsed.length) return parsed;

  const fallback = [
    cleanText(artistsMain),
    cleanText(title)
  ].filter(Boolean);

  return fallback.length ? fallback : [];
}
async function loadSourceIds(db, source) {
  const rows = await db
    .prepare(`
      SELECT source_id
      FROM concerts
      WHERE source = ?
    `)
    .bind(source)
    .all();

  return (rows?.results || [])
    .map((row) => cleanText(row?.source_id))
    .filter(Boolean);
}

async function findConcertBySourceId(db, sourceId) {
  const row = await db
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
        fetched_at
      FROM concerts
      WHERE source_id = ?
      LIMIT 1
    `)
    .bind(sourceId)
    .first();

  return row || null;
}

async function insertConcert(db, event) {
  await db
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      event.source,
      event.source_id,
      event.title,
      event.artists_main,
      event.artists_all,
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
    )
    .run();
}

async function updateConcertIfChanged(db, existingRow, nextEvent) {
  const changed = hasMeaningfulChanges(existingRow, nextEvent);

  if (!changed) {
    await db
      .prepare(`
        UPDATE concerts
        SET
          fetched_at = ?,
          updated_at = ?
        WHERE source_id = ?
      `)
      .bind(nextEvent.fetched_at, nextEvent.updated_at, nextEvent.source_id)
      .run();

    return false;
  }

  await db
    .prepare(`
      UPDATE concerts
      SET
        source = ?,
        title = ?,
        artists_main = ?,
        artists_all = ?,
        raw_title = ?,
        date_local = ?,
        time_local = ?,
        venue_name = ?,
        city = ?,
        country = ?,
        url = ?,
        image_url = ?,
        genre_hint = ?,
        fetched_at = ?,
        updated_at = ?
      WHERE source_id = ?
    `)
    .bind(
      nextEvent.source,
      nextEvent.title,
      nextEvent.artists_main,
      nextEvent.artists_all,
      nextEvent.raw_title,
      nextEvent.date_local,
      nextEvent.time_local,
      nextEvent.venue_name,
      nextEvent.city,
      nextEvent.country,
      nextEvent.url,
      nextEvent.image_url,
      nextEvent.genre_hint,
      nextEvent.fetched_at,
      nextEvent.updated_at,
      nextEvent.source_id
    )
    .run();

  return true;
}

function hasMeaningfulChanges(prev, next) {
  const fields = [
    "source",
    "title",
    "artists_main",
    "artists_all",
    "raw_title",
    "date_local",
    "time_local",
    "venue_name",
    "city",
    "country",
    "url",
    "image_url",
    "genre_hint"
  ];

  for (const field of fields) {
    const a = cleanComparable(prev?.[field]);
    const b = cleanComparable(next?.[field]);
    if (a !== b) return true;
  }

  return false;
}

async function deleteConcertsBySourceIds(db, sourceIds, chunkSize = 25) {
  const ids = Array.isArray(sourceIds)
    ? sourceIds.map(cleanText).filter(Boolean)
    : [];

  if (!ids.length) return 0;

  let deleted = 0;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    if (!chunk.length) continue;

    const placeholders = chunk.map(() => "?").join(", ");

    await db
      .prepare(`
        DELETE FROM concerts
        WHERE source_id IN (${placeholders})
      `)
      .bind(...chunk)
      .run();

    deleted += chunk.length;
  }

  return deleted;
}

async function deletePastConcertsForSource(db, source) {
  const today = amsterdamToday();

  const result = await db
    .prepare(`
      DELETE FROM concerts
      WHERE source = ?
        AND date_local IS NOT NULL
        AND date_local != ''
        AND date_local < ?
    `)
    .bind(source, today)
    .run();

  return Number(result?.meta?.changes || 0);
}
function uniqueValidSources(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const out = [];
  const seen = new Set();

  for (const item of list) {
    const source = cleanParam(item);
    if (!source) continue;
    if (seen.has(source)) continue;
    seen.add(source);
    out.push(source);
  }

  return out;
}

function compareNormalizedConcerts(a, b) {
  const dateA = `${a?.date_local || ""} ${a?.time_local || "99:99"}`;
  const dateB = `${b?.date_local || ""} ${b?.time_local || "99:99"}`;

  const dateCmp = dateA.localeCompare(dateB);
  if (dateCmp !== 0) return dateCmp;

  const cityCmp = cleanText(a?.city).localeCompare(cleanText(b?.city));
  if (cityCmp !== 0) return cityCmp;

  const venueCmp = cleanText(a?.venue_name).localeCompare(cleanText(b?.venue_name));
  if (venueCmp !== 0) return venueCmp;

  return cleanText(a?.title).localeCompare(cleanText(b?.title));
}

function buildFallbackSourceId({ source, title, dateLocal, timeLocal, venueName, city }) {
  return [
    source,
    slugify(title),
    slugify(venueName || city || "venue"),
    dateLocal,
    timeLocal || "no-time"
  ].join("-");
}

function normalizeTime(value) {
  const text = cleanText(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return text;

  const h = String(match[1]).padStart(2, "0");
  const m = String(match[2]).padStart(2, "0");
  return `${h}:${m}`;
}

function tryParseJsonArray(value) {
  if (!value || typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanText).filter(Boolean);
  } catch {
    return [];
  }
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
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

function cleanComparable(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
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
