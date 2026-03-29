const PODIUMINFO_BASE = "https://www.podiuminfo.nl";
const VENUE_ID = 86;
const VENUE_CITY = "Utrecht";
const VENUE_SLUG = "ACU";

export async function fetchAcuEvents(options = {}) {
  const {
    maxPages = 20,
    stopAfterEmptyPages = 3,
    retriesPerPage = 2
  } = options;

  const allEvents = [];
  const seen = new Set();
  let emptyPagesInRow = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildAgendaUrl(page);

    let pageEvents = [];

    for (let attempt = 0; attempt <= retriesPerPage; attempt += 1) {
      try {
        const html = await fetchText(url);
        pageEvents = parsePage(html);

        if (pageEvents.length > 0) {
          break;
        }
      } catch {
        // retry
      }
    }

    if (pageEvents.length === 0) {
      emptyPagesInRow += 1;

      if (emptyPagesInRow >= stopAfterEmptyPages) {
        break;
      }

      continue;
    }

    emptyPagesInRow = 0;

    for (const ev of pageEvents) {
      const key = ev.source_id || makeNormalizedKey(ev);
      if (seen.has(key)) continue;
      seen.add(key);
      allEvents.push(ev);
    }
  }

  allEvents.sort((a, b) => {
    const ad = `${a.date_local || ""} ${a.time_local || "99:99"}`;
    const bd = `${b.date_local || ""} ${b.time_local || "99:99"}`;
    return ad.localeCompare(bd) || String(a.title || "").localeCompare(String(b.title || ""));
  });

  return allEvents;
}

function buildAgendaUrl(page = 1) {
  return `${PODIUMINFO_BASE}/podium/${VENUE_ID}/concerten/${page}/${VENUE_SLUG}/${VENUE_CITY}/`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.text();
}

function parsePage(html) {
  const nowTs = Date.now();

  const scripts = [
    ...String(html || "").matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];

  if (!scripts.length) {
    return [];
  }

  const events = [];
  const seen = new Set();

  for (const match of scripts) {
    const candidates = parseJsonLdPayload(match[1]);

    for (const candidate of candidates) {
      if (!candidate || candidate["@type"] !== "MusicEvent") continue;

      const normalized = normalizeMusicEvent(candidate, nowTs);
      if (!normalized) continue;

      const key = normalized.source_id;
      if (seen.has(key)) continue;
      seen.add(key);

      events.push(normalized);
    }
  }

  return events;
}

function parseJsonLdPayload(raw) {
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && Array.isArray(parsed["@graph"])) {
      return parsed["@graph"];
    }

    return [parsed];
  } catch {
    return [];
  }
}
function normalizeMusicEvent(json, nowTs) {
  const rawName = clean(json?.name);
  const rawUrl = absoluteUrl(json?.url || "");
  const rawImage = normalizeImage(json?.image);

  const start = parseStartDate(json?.startDate);
  if (!start) return null;

  if (start.timestamp < startOfTodayAmsterdam(nowTs)) {
    return null;
  }

  const venueNameRaw = clean(json?.location?.name || "ACU");
  const venueName = normalizeVenueName(venueNameRaw);

  const artistName =
    extractArtistFromName(rawName, venueName) ||
    extractArtistFromUrl(rawUrl) ||
    rawName;

  const title = artistName;
  const artistsMain = artistName;
  const artistsAll = [artistName];
  const rawTitle = rawName;

  return {
    source: "acu",
    source_id: buildSourceId({
      title,
      dateLocal: start.date_local,
      venueName
    }),
    title,
    artists_main: artistsMain,
    artists_all: artistsAll,
    raw_title: rawTitle,
    date_local: start.date_local,
    time_local: start.time_local,
    venue_name: venueName,
    city: extractCity(json) || "Utrecht",
    country: extractCountry(json) || "NL",
    url: rawUrl || null,
    image_url: rawImage || null,
    genre_hint: null,
    fetched_at: nowTs
  };
}

function normalizeImage(image) {
  if (!image) return null;
  if (typeof image === "string") return clean(image) || null;
  if (Array.isArray(image)) return clean(image[0] || "") || null;
  if (typeof image === "object" && image.url) return clean(image.url) || null;
  return null;
}

function extractArtistFromName(name, venueName) {
  const n = clean(name);
  if (!n) return "";

  let out = n
    .replace(/\s+@\s+.+$/i, "")
    .replace(/\s+-\s+at\s+.+$/i, "")
    .replace(/\s+at\s+.+$/i, "")
    .trim();

  if (venueName) {
    const escapedVenue = escapeRegExp(
      venueName.replace(/^ACU\s*-\s*/i, "").trim()
    );

    if (escapedVenue) {
      out = out.replace(new RegExp(`\\s*@\\s*${escapedVenue}$`, "i"), "").trim();
      out = out.replace(new RegExp(`\\s+${escapedVenue}$`, "i"), "").trim();
    }
  }

  return clean(out);
}

function extractArtistFromUrl(url) {
  const u = String(url || "");
  const m = u.match(/\/concert\/\d+\/([^/]+)\//i);
  if (!m?.[1]) return "";

  return titleCaseFromSlug(m[1]);
}

function normalizeVenueName(raw) {
  const t = clean(raw);

  if (!t) return "ACU";
  if (/^acu$/i.test(t)) return "ACU";
  if (/^cafe$/i.test(t)) return "ACU - Café";
  if (/^café$/i.test(t)) return "ACU - Café";

  return t;
}

function extractCity(json) {
  return clean(
    json?.location?.address?.addressLocality ||
    json?.location?.address?.addressRegion ||
    ""
  );
}

function extractCountry(json) {
  const value = clean(json?.location?.address?.addressCountry || "");
  return value || "NL";
}

function parseStartDate(value) {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const date_local = formatAmsterdamDate(d);
  const time_local = formatAmsterdamTime(d);

  return {
    timestamp: d.getTime(),
    date_local,
    time_local
  };
}

function formatAmsterdamDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value || "";
  const m = parts.find((p) => p.type === "month")?.value || "";
  const d = parts.find((p) => p.type === "day")?.value || "";

  return `${y}-${m}-${d}`;
}

function formatAmsterdamTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const h = parts.find((p) => p.type === "hour")?.value || "";
  const m = parts.find((p) => p.type === "minute")?.value || "";

  return h && m ? `${h}:${m}` : null;
}
function startOfTodayAmsterdam(nowTs) {
  const now = new Date(nowTs);
  const todayAmsterdam = formatAmsterdamDate(now);
  const midnightLocal = new Date(`${todayAmsterdam}T00:00:00+01:00`);
  return midnightLocal.getTime() - 2 * 60 * 60 * 1000;
}

function titleCaseFromSlug(slug) {
  return decodeURIComponent(String(slug || ""))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSourceId({ title, dateLocal, venueName }) {
  return `acu-${slugify(title)}-${slugify(venueName)}-${dateLocal}`;
}

function makeNormalizedKey(ev) {
  return [
    ev.date_local || "",
    ev.time_local || "",
    ev.title || "",
    ev.venue_name || ""
  ]
    .map((x) => clean(String(x).toLowerCase()))
    .join("::");
}

function absoluteUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${PODIUMINFO_BASE}${url}`;
  return `${PODIUMINFO_BASE}/${url}`;
}

function clean(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}