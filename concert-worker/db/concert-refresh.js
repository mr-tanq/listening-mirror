import { fetchVenueEventsById } from "../core/concert-fetch-engine.js";

const ALL_VENUE_SOURCES = [
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

const DEFAULT_REFRESH_ALL_CONFIG = {
  batchSize: 1,
  batchDelayMs: 1200,
  zeroRetryDelayMs: 2200,
  zeroRetries: 1
};

export async function refreshSource(db, source, options = {}) {
  const startedAt = Date.now();
  const safeSource = cleanParam(source);

  if (!safeSource) {
    throw new Error("Missing source");
  }

  await ensureConcertsSchema(db);

  const fetched = await fetchVenueEventsById(safeSource);
  const normalized = normalizeIncomingEvents(fetched, safeSource);
  const stats = await upsertConcertsForSource(db, safeSource, normalized);
  const deletedPast = await deletePastConcertsForSource(db, safeSource);

  return {
    source: safeSource,
    fetched: Array.isArray(fetched) ? fetched.length : 0,
    normalized: normalized.length,
    inserted: stats.inserted,
    updated: stats.updated,
    skipped: stats.skipped,
    deletedPast,
    durationMs: Date.now() - startedAt
  };
}

export async function refreshAllSources(db, sources = ALL_VENUE_SOURCES, options = {}) {
  const startedAt = Date.now();
  await ensureConcertsSchema(db);

  const requestedSources = Array.isArray(sources) && sources.length
    ? sources.map(cleanParam).filter(Boolean)
    : [...ALL_VENUE_SOURCES];

  const config = {
    ...DEFAULT_REFRESH_ALL_CONFIG,
    ...sanitizeRefreshAllOptions(options)
  };

  const results = [];
  const failed = [];
  const suspicious = [];

  const batches = chunkArray(requestedSources, config.batchSize);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];

    for (const source of batch) {
      try {
        const result = await refreshSourceWithZeroRetry(db, source, config);
        results.push(result);

        if (result.suspiciousZero) {
          suspicious.push({
            source: result.source,
            fetched: result.fetched,
            attempts: result.attempts,
            zeroRetryUsed: result.zeroRetryUsed
          });
        }
      } catch (err) {
        failed.push({
          source,
          error: err?.message || "Unknown refresh error"
        });
      }
    }

    const isLastBatch = batchIndex === batches.length - 1;
    if (!isLastBatch && config.batchDelayMs > 0) {
      await sleep(config.batchDelayMs);
    }
  }

  return {
    ok: failed.length === 0,
    mode: "refresh-all-sources",
    requestedSources,
    totalSourcesRequested: requestedSources.length,
    totalSourcesSucceeded: results.length,
    totalSourcesFailed: failed.length,
    totalSuspicious: suspicious.length,
    durationMs: Date.now() - startedAt,
    config: {
      batchSize: config.batchSize,
      batchDelayMs: config.batchDelayMs,
      zeroRetryDelayMs: config.zeroRetryDelayMs,
      zeroRetries: config.zeroRetries
    },
    results,
    suspicious,
    failed
  };
}
async function refreshSourceWithZeroRetry(db, source, config) {
  const startedAt = Date.now();
  const safeSource = cleanParam(source);

  let attempts = 0;
  let zeroRetryUsed = false;
  let lastResult = null;

  while (attempts <= config.zeroRetries) {
    attempts += 1;

    const result = await refreshSource(db, safeSource);
    lastResult = result;

    if (result.fetched > 0 || result.normalized > 0) {
      return {
        ...result,
        durationMs: Date.now() - startedAt,
        attempts,
        zeroRetryUsed,
        suspiciousZero: false
      };
    }

    const canRetryZero = attempts <= config.zeroRetries;
    if (!canRetryZero) {
      break;
    }

    zeroRetryUsed = true;

    if (config.zeroRetryDelayMs > 0) {
      await sleep(config.zeroRetryDelayMs);
    }
  }

  return {
    ...lastResult,
    durationMs: Date.now() - startedAt,
    attempts,
    zeroRetryUsed,
    suspiciousZero: true
  };
}

async function ensureConcertsSchema(db) {
  await db.prepare(`
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
    )
  `).run();

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_concerts_source_source_id
    ON concerts(source, source_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_concerts_source
    ON concerts(source)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_concerts_date_local
    ON concerts(date_local)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_concerts_source_date
    ON concerts(source, date_local)
  `).run();
}

function normalizeIncomingEvents(events, forcedSource) {
  const list = Array.isArray(events) ? events : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const event = normalizeSingleEvent(raw, forcedSource);
    if (!event) continue;

    const key = `${event.source}::${event.source_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(event);
  }

  return out.sort(compareEventsByDate);
}

function normalizeSingleEvent(raw, forcedSource) {
  if (!raw || typeof raw !== "object") return null;

  const source = cleanParam(raw.source || forcedSource);
  const title = cleanText(raw.title);
  const dateLocal = cleanText(raw.date_local);

  if (!source || !title || !dateLocal) {
    return null;
  }

  const sourceId =
    cleanText(raw.source_id) ||
    buildFallbackSourceId({
      source,
      title,
      dateLocal,
      venueName: raw.venue_name,
      city: raw.city
    });

  const artistsAll = normalizeArtistsAll(raw.artists_all, raw.artists_main, raw.title);

  return {
    source,
    source_id: sourceId,
    title,
    artists_main: cleanText(raw.artists_main) || title,
    artists_all: JSON.stringify(artistsAll),
    raw_title: cleanText(raw.raw_title) || title,
    date_local: dateLocal,
    time_local: cleanNullableText(raw.time_local),
    venue_name: cleanNullableText(raw.venue_name),
    city: cleanNullableText(raw.city),
    country: cleanNullableText(raw.country) || "NL",
    url: cleanNullableText(raw.url),
    image_url: cleanNullableText(raw.image_url),
    genre_hint: cleanNullableText(raw.genre_hint),
    fetched_at: toSafeInteger(raw.fetched_at) || Date.now()
  };
    }
async function upsertConcertsForSource(db, source, events) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const nowTs = Date.now();

  for (const event of events) {
    try {
      const insertResult = await db.prepare(`
        INSERT OR IGNORE INTO concerts (
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
      `).bind(
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
        nowTs,
        nowTs
      ).run();

      const insertedNow = Number(insertResult?.meta?.changes || 0) > 0;

      if (insertedNow) {
        inserted += 1;
        continue;
      }
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        throw err;
      }
    }

    const existing = await db.prepare(`
      SELECT
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
      WHERE source = ? AND source_id = ?
      LIMIT 1
    `)
      .bind(event.source, event.source_id)
      .first();

    if (!existing) {
      skipped += 1;
      continue;
    }

    const changed = hasConcertChanged(existing, event);

    if (!changed) {
      skipped += 1;
      continue;
    }

    await db.prepare(`
      UPDATE concerts
      SET
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
      WHERE source = ? AND source_id = ?
    `).bind(
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
      nowTs,
      event.source,
      event.source_id
    ).run();

    updated += 1;
  }

  return { inserted, updated, skipped };
}

async function deletePastConcertsForSource(db, source) {
  const today = amsterdamToday();

  const result = await db.prepare(`
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

function hasConcertChanged(existing, incoming) {
  return (
    cleanText(existing?.title) !== cleanText(incoming?.title) ||
    cleanText(existing?.artists_main) !== cleanText(incoming?.artists_main) ||
    cleanText(existing?.artists_all) !== cleanText(incoming?.artists_all) ||
    cleanText(existing?.raw_title) !== cleanText(incoming?.raw_title) ||
    cleanText(existing?.date_local) !== cleanText(incoming?.date_local) ||
    cleanText(existing?.time_local) !== cleanText(incoming?.time_local) ||
    cleanText(existing?.venue_name) !== cleanText(incoming?.venue_name) ||
    cleanText(existing?.city) !== cleanText(incoming?.city) ||
    cleanText(existing?.country) !== cleanText(incoming?.country) ||
    cleanText(existing?.url) !== cleanText(incoming?.url) ||
    cleanText(existing?.image_url) !== cleanText(incoming?.image_url) ||
    cleanText(existing?.genre_hint) !== cleanText(incoming?.genre_hint) ||
    toSafeInteger(existing?.fetched_at) !== toSafeInteger(incoming?.fetched_at)
  );
}

function normalizeArtistsAll(value, artistsMain, title) {
  if (Array.isArray(value)) {
    const cleaned = value.map(cleanText).filter(Boolean);
    if (cleaned.length) return cleaned;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map(cleanText).filter(Boolean);
        if (cleaned.length) return cleaned;
      }
    } catch {
      // ignore
    }
  }

  return [cleanText(artistsMain) || cleanText(title)].filter(Boolean);
}

function buildFallbackSourceId({ source, title, dateLocal, venueName, city }) {
  return [
    source,
    slugify(title),
    slugify(venueName || ""),
    slugify(city || ""),
    dateLocal
  ]
    .filter(Boolean)
    .join("-");
}

function compareEventsByDate(a, b) {
  const ad = `${a?.date_local || ""} ${a?.time_local || "99:99"}`;
  const bd = `${b?.date_local || ""} ${b?.time_local || "99:99"}`;

  const dateCmp = ad.localeCompare(bd);
  if (dateCmp !== 0) return dateCmp;

  const venueCmp = cleanText(a?.venue_name).localeCompare(cleanText(b?.venue_name));
  if (venueCmp !== 0) return venueCmp;

  return cleanText(a?.title).localeCompare(cleanText(b?.title));
}

function isUniqueConstraintError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("UNIQUE constraint failed");
  }
function sanitizeRefreshAllOptions(options) {
  const batchSize = clampInt(options?.batchSize, 1, 12, DEFAULT_REFRESH_ALL_CONFIG.batchSize);
  const batchDelayMs = clampInt(options?.batchDelayMs, 0, 20000, DEFAULT_REFRESH_ALL_CONFIG.batchDelayMs);
  const zeroRetryDelayMs = clampInt(
    options?.zeroRetryDelayMs,
    0,
    20000,
    DEFAULT_REFRESH_ALL_CONFIG.zeroRetryDelayMs
  );
  const zeroRetries = clampInt(options?.zeroRetries, 0, 3, DEFAULT_REFRESH_ALL_CONFIG.zeroRetries);

  return {
    batchSize,
    batchDelayMs,
    zeroRetryDelayMs,
    zeroRetries
  };
}

function chunkArray(list, size) {
  const out = [];
  const safeSize = Math.max(1, Number(size || 1));

  for (let i = 0; i < list.length; i += safeSize) {
    out.push(list.slice(i, i + safeSize));
  }

  return out;
}

function sleep(ms) {
  const safeMs = Math.max(0, Number(ms || 0));
  return new Promise((resolve) => setTimeout(resolve, safeMs));
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
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

function cleanParam(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNullableText(value) {
  const v = cleanText(value);
  return v || null;
}

function toSafeInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
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
