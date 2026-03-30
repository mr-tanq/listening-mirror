import { refreshSource, refreshAllSources } from "../db/concert-refresh.js";
import { fetchVenueEventsById } from "../core/concert-fetch-engine.js";
import {
  buildConcertRecommendationsLight,
  buildBucketedConcertRecommendations
} from "../core/concert-recommender.js";

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

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const pathname = normalizePath(url.pathname);

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      if (pathname === "/") {
        return json({
          ok: true,
          service: "econcerts",
          endpoints: [
            "/health",
            "/admin/refresh-source?source=paradiso",
            "/admin/refresh-all-sources",
            "/admin/refresh-all-sources?sources=paradiso,tivoli,melkweg",
            "/concerts/venues",
            "/concerts/venues?source=paradiso",
            "/concerts/venues?source=all",
            "/concerts/venues?sources=paradiso,melkweg,tivoli",
            "/concerts/db-latest",
            "/concerts/recommended",
            "/concerts/recommended?bucketed=1",
            "/concerts/recommended?directOnly=1"
          ],
          supportedVenueSources: ALL_VENUE_SOURCES
        });
      }

      if (pathname === "/health") {
        return json({
          ok: true,
          service: "econcerts",
          supportedVenueSources: ALL_VENUE_SOURCES
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
          mode: "refresh-source",
          ...result
        });
      }

      if (pathname === "/admin/refresh-all-sources") {
        if (!env?.DB) {
          return json({ ok: false, error: "Missing DB binding" }, 500);
        }

        const sourcesParam = cleanParam(url.searchParams.get("sources"));
        const requestedSources = resolveRequestedVenueSources({
          source: "",
          sources: sourcesParam || "all"
        });

        if (!requestedSources.length) {
          return json({
            ok: false,
            error: "No valid venue sources requested",
            supportedVenueSources: ALL_VENUE_SOURCES
          }, 400);
        }

        const result = await refreshAllSources(env.DB, requestedSources);

        return json({
          ok: true,
          mode: "refresh-all-sources",
          ...result
        });
      }

      if (pathname === "/concerts/venues") {
        const singleSource = cleanParam(url.searchParams.get("source"));
        const sourcesParam = cleanParam(url.searchParams.get("sources"));
        const grouped = parseBoolean(url.searchParams.get("grouped"), true);

        const requestedSources = resolveRequestedVenueSources({
          source: singleSource,
          sources: sourcesParam
        });

        if (!requestedSources.length) {
          return json({
            ok: false,
            error: "No valid venue sources requested",
            supportedVenueSources: ALL_VENUE_SOURCES
          }, 400);
        }

        const result = await fetchMultipleVenueSources(requestedSources);

        return json({
          ok: true,
          mode: requestedSources.length === 1 ? "single-source" : "multi-source",
          requestedSources,
          totalSourcesRequested: requestedSources.length,
          totalSourcesSucceeded: result.succeededSources.length,
          totalSourcesFailed: result.failedSources.length,
          totalRaw: result.totalRaw,
          totalAfterDedupe: result.events.length,
          countsBySource: result.countsBySource,
          failedSources: result.failedSources,
          sources: grouped ? result.groupedSources : undefined,
          events: result.events
        });
      }

      if (pathname === "/concerts/db-latest") {
        if (!env?.DB) {
          return json({ ok: false, error: "Missing DB binding" }, 500);
        }

        const limit = clampInt(url.searchParams.get("limit"), 1, 2000, 300);

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
            LIMIT ?
          `)
          .bind(limit)
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
        const directOnly = parseBoolean(url.searchParams.get("directOnly"), false);

        const minFinalScore = clampNumber(
          url.searchParams.get("minFinalScore"),
          0,
          100,
          20
        );

        const maxSeeds = directOnly
          ? 0
          : clampInt(url.searchParams.get("maxSeeds"), 0, 20, 8);

        const similarPerSeed = directOnly
          ? 0
          : clampInt(url.searchParams.get("similarPerSeed"), 0, 50, 12);

        const minRelatedScore = clampNumber(
          url.searchParams.get("minRelatedScore"),
          0,
          100,
          10
        );

        const futureEvents = await loadFutureConcerts(env.DB, { limit });

        const sharedOptions = {
          matcher: {
            minFinalScore,
            includeHidden
          },
          related: {
            maxSeeds,
            similarPerSeed,
            minRelatedScore
          }
        };

        if (bucketed) {
          const result = await buildBucketedConcertRecommendations(
            env,
            futureEvents,
            sharedOptions
          );

          return json({
            ok: true,
            mode: directOnly
              ? "recommended-bucketed-direct-only"
              : "recommended-bucketed",
            config: {
              limit,
              includeHidden,
              directOnly,
              maxSeeds,
              similarPerSeed,
              minRelatedScore,
              minFinalScore
            },
            ...result
          });
        }

        const result = await buildConcertRecommendationsLight(
          env,
          futureEvents,
          sharedOptions
        );

        return json({
          ok: true,
          mode: directOnly ? "recommended-direct-only" : "recommended",
          config: {
            limit,
            includeHidden,
            directOnly,
            maxSeeds,
            similarPerSeed,
            minRelatedScore,
            minFinalScore
          },
          ...result
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
async function fetchMultipleVenueSources(sources) {
  const groupedSources = [];
  const failedSources = [];
  const countsBySource = Object.create(null);
  const rawEvents = [];

  for (const source of sources) {
    try {
      const events = await fetchVenueEventsById(source);
      const safeEvents = Array.isArray(events) ? events : [];
      const hydrated = safeEvents.map(hydrateConcertRow);

      countsBySource[source] = hydrated.length;

      groupedSources.push({
        source,
        count: hydrated.length,
        events: hydrated
      });

      rawEvents.push(...hydrated);
    } catch (err) {
      countsBySource[source] = 0;
      failedSources.push({
        source,
        error: err?.message || "Unknown parser error"
      });
    }
  }

  const dedupedEvents = dedupeVenueEvents(rawEvents).sort(compareVenueEvents);

  return {
    requestedSources: sources,
    succeededSources: groupedSources.map((x) => x.source),
    failedSources,
    groupedSources,
    countsBySource,
    totalRaw: rawEvents.length,
    events: dedupedEvents
  };
}

function resolveRequestedVenueSources({ source, sources }) {
  if (source && source !== "all") {
    return ALL_VENUE_SOURCES.includes(source) ? [source] : [];
  }

  if (source === "all") {
    return [...ALL_VENUE_SOURCES];
  }

  if (sources) {
    if (sources === "all") {
      return [...ALL_VENUE_SOURCES];
    }

    const parsed = sources
      .split(",")
      .map((x) => cleanParam(x))
      .filter(Boolean);

    const uniqueValid = [];
    const seen = new Set();

    for (const item of parsed) {
      if (!ALL_VENUE_SOURCES.includes(item)) continue;
      if (seen.has(item)) continue;
      seen.add(item);
      uniqueValid.push(item);
    }

    return uniqueValid;
  }

  return [...ALL_VENUE_SOURCES];
}

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

function dedupeVenueEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const bestByKey = new Map();

  for (const event of list) {
    const key = buildVenueDedupeKey(event);
    const prev = bestByKey.get(key);

    if (!prev) {
      bestByKey.set(key, event);
      continue;
    }

    if (preferVenueEvent(event, prev)) {
      bestByKey.set(key, event);
    }
  }

  return Array.from(bestByKey.values());
}

function buildVenueDedupeKey(event) {
  const sourceId = cleanText(event?.source_id);
  if (sourceId) return `sid::${sourceId}`;

  return [
    normalizeLooseKey(event?.title),
    cleanText(event?.date_local),
    cleanText(event?.time_local),
    normalizeLooseKey(event?.venue_name),
    normalizeLooseKey(event?.city)
  ].join("::");
}

function preferVenueEvent(nextEvent, prevEvent) {
  const nextHasImage = Boolean(cleanText(nextEvent?.image_url));
  const prevHasImage = Boolean(cleanText(prevEvent?.image_url));
  if (nextHasImage !== prevHasImage) return nextHasImage;

  const nextHasUrl = Boolean(cleanText(nextEvent?.url));
  const prevHasUrl = Boolean(cleanText(prevEvent?.url));
  if (nextHasUrl !== prevHasUrl) return nextHasUrl;

  const nextFetched = Number(nextEvent?.fetched_at || 0);
  const prevFetched = Number(prevEvent?.fetched_at || 0);
  if (nextFetched !== prevFetched) return nextFetched > prevFetched;

  return false;
}

function compareVenueEvents(a, b) {
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

function normalizeLooseKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
    }
