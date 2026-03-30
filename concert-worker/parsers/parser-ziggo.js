const ZIGGO_BASE = "https://www.ziggodome.nl";
const ZIGGO_AGENDA_URL = `${ZIGGO_BASE}/agenda`;

export async function fetchZiggoEvents(options = {}) {
  const {
    retries = 2
  } = options;

  const nowTs = Date.now();
  let html = "";
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      html = await fetchText(ZIGGO_AGENDA_URL);
      if (html) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!html) {
    throw lastError || new Error("Failed to fetch Ziggo Dome agenda");
  }

  const events = parseAgendaPage(html, nowTs);
  const seen = new Set();
  const out = [];

  for (const ev of events) {
    const key = ev.source_id || makeNormalizedKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }

  out.sort((a, b) => {
    const ad = `${a.date_local || ""} ${a.time_local || "99:99"}`;
    const bd = `${b.date_local || ""} ${b.time_local || "99:99"}`;
    return ad.localeCompare(bd) || String(a.title || "").localeCompare(String(b.title || ""));
  });

  return out;
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

function parseAgendaPage(html, nowTs) {
  const blocks = extractNextDataEvents(html);
  if (!blocks.length) {
    return parseJsonLdFallback(html, nowTs, "ziggo");
  }

  const results = [];

  for (const item of blocks) {
    const ev = normalizeZiggoItem(item, nowTs);
    if (ev) results.push(ev);
  }

  return results;
}

function extractNextDataEvents(html) {
  const m = String(html || "").match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (!m?.[1]) return [];

  try {
    const parsed = JSON.parse(m[1]);
    const out = [];
    walkJson(parsed, (node) => {
      if (!node || typeof node !== "object") return;

      const maybeUrl = clean(
        node.url ||
        node.href ||
        node.path ||
        node.slug ||
        ""
      );

      const maybeTitle = clean(
        node.title ||
        node.name ||
        node.eventTitle ||
        ""
      );

      const maybeDate =
        node.date ||
        node.startDate ||
        node.start ||
        node.datetime ||
        node.eventDate ||
        null;

      if (!maybeTitle || !maybeDate) return;

      if (
        maybeUrl.includes("/agenda/") ||
        maybeUrl.includes("/event/") ||
        maybeUrl.includes("/concert/")
      ) {
        out.push(node);
      }
    });

    return uniqueObjects(out);
  } catch {
    return [];
  }
}

function normalizeZiggoItem(item, nowTs) {
  const rawTitle = clean(
    item.title ||
    item.name ||
    item.eventTitle ||
    ""
  );
  if (!rawTitle) return null;

  const rawUrl = absoluteUrl(
    item.url ||
    item.href ||
    item.path ||
    ""
  );

  const rawImage = normalizeImage(
    item.image ||
    item.imageUrl ||
    item.thumbnail ||
    item.poster ||
    item.heroImage ||
    null
  );

  const start = parseDateFromUnknownShape(item);
  if (!start) return null;
  if (start.timestamp < startOfTodayAmsterdam(nowTs)) return null;

  const title = extractArtistFromTitle(rawTitle) || rawTitle;
  const supportActs = extractSupportActs(item);
  const artistsAll = uniqueStrings([title, ...supportActs]);

  return {
    source: "ziggo",
    source_id: buildSourceId({
      prefix: "ziggo",
      title,
      dateLocal: start.date_local,
      venueName: "Ziggo Dome"
    }),
    title,
    artists_main: title,
    artists_all: artistsAll,
    raw_title: rawTitle,
    date_local: start.date_local,
    time_local: start.time_local,
    venue_name: "Ziggo Dome",
    city: "Amsterdam",
    country: "NL",
    url: rawUrl || null,
    image_url: rawImage || null,
    genre_hint: null,
    fetched_at: nowTs
  };
}

function extractSupportActs(item) {
  const candidates = [];

  const directArrays = [
    item.supportActs,
    item.supports,
    item.support,
    item.lineup,
    item.artists,
    item.performers
  ];

  for (const arr of directArrays) {
    if (Array.isArray(arr)) {
      for (const x of arr) {
        if (typeof x === "string") candidates.push(clean(x));
        else if (x && typeof x === "object") {
          candidates.push(clean(x.name || x.title || x.artist || ""));
        }
      }
    }
  }

  const textFields = [
    item.subtitle,
    item.subTitle,
    item.description,
    item.summary,
    item.intro
  ];

  for (const field of textFields) {
    const parsed = extractSupportsFromText(field);
    for (const x of parsed) candidates.push(x);
  }

  return uniqueStrings(candidates.filter(Boolean));
}

function extractSupportsFromText(value) {
  const text = clean(stripHtml(value || ""));
  if (!text) return [];

  const patterns = [
    /\b(support|supports|special guest|special guests|with)\b[:\s-]+(.+)$/i
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[2]) continue;

    return splitArtistText(m[2]);
  }

  return [];
}

function parseJsonLdFallback(html, nowTs, sourceName) {
  const scripts = [
    ...String(html || "").matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];

  const events = [];
  const seen = new Set();

  for (const match of scripts) {
    const candidates = parseJsonLdPayload(match[1]);

    for (const candidate of candidates) {
      if (!candidate || candidate["@type"] !== "Event" && candidate["@type"] !== "MusicEvent") continue;

      const normalized = normalizeJsonLdMusicEvent(candidate, nowTs, sourceName);
      if (!normalized) continue;

      const key = normalized.source_id;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(normalized);
    }
  }

  return events;
}

function normalizeJsonLdMusicEvent(json, nowTs, sourceName) {
  const rawName = clean(json?.name);
  const rawUrl = absoluteUrl(json?.url || "");
  const rawImage = normalizeImage(json?.image);
  const start = parseStartDate(json?.startDate);

  if (!rawName || !start) return null;
  if (start.timestamp < startOfTodayAmsterdam(nowTs)) return null;

  const venueName = clean(json?.location?.name || (sourceName === "ziggo" ? "Ziggo Dome" : "AFAS Live")) ||
    (sourceName === "ziggo" ? "Ziggo Dome" : "AFAS Live");

  const title = extractArtistFromTitle(rawName) || rawName;

  return {
    source: sourceName,
    source_id: buildSourceId({
      prefix: sourceName,
      title,
      dateLocal: start.date_local,
      venueName
    }),
    title,
    artists_main: title,
    artists_all: [title],
    raw_title: rawName,
    date_local: start.date_local,
    time_local: start.time_local,
    venue_name: venueName,
    city: clean(json?.location?.address?.addressLocality || "Amsterdam") || "Amsterdam",
    country: clean(json?.location?.address?.addressCountry || "NL") || "NL",
    url: rawUrl || null,
    image_url: rawImage || null,
    genre_hint: null,
    fetched_at: nowTs
  };
}

function parseDateFromUnknownShape(item) {
  const candidates = [
    item.startDate,
    item.date,
    item.start,
    item.datetime,
    item.eventDate,
    item.start_at
  ];

  for (const value of candidates) {
    const parsed = parseStartDate(value);
    if (parsed) return parsed;
  }

  const nested = item.dateTime || item.date_time || null;
  if (nested && typeof nested === "object") {
    const joined = clean(`${nested.date || ""} ${nested.time || ""}`);
    const parsed = parseStartDate(joined);
    if (parsed) return parsed;
  }

  return null;
}

function extractArtistFromTitle(title) {
  let out = clean(title);
  if (!out) return "";

  out = out
    .replace(/\s+\((uitverkocht|sold out)\)$/i, "")
    .replace(/\s+-\s+extra show$/i, "")
    .replace(/\s+-\s+matinee$/i, "")
    .trim();

  return out;
}

function normalizeImage(image) {
  if (!image) return null;
  if (typeof image === "string") return clean(image) || null;
  if (Array.isArray(image)) {
    for (const x of image) {
      const picked = normalizeImage(x);
      if (picked) return picked;
    }
    return null;
  }
  if (typeof image === "object") {
    return clean(image.url || image.src || image.href || "") || null;
  }
  return null;
}

function parseStartDate(value) {
  if (!value) return null;

  const raw = clean(value);
  if (!raw) return null;

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return {
      timestamp: d.getTime(),
      date_local: formatAmsterdamDate(d),
      time_local: formatAmsterdamTime(d)
    };
  }

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] || "20"}:${m[5] || "00"}:00`;
    const d2 = new Date(iso);
    if (!Number.isNaN(d2.getTime())) {
      return {
        timestamp: d2.getTime(),
        date_local: formatAmsterdamDate(d2),
        time_local: m[4] && m[5] ? `${m[4]}:${m[5]}` : null
      };
    }
  }

  return null;
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

function buildSourceId({ prefix, title, dateLocal, venueName }) {
  return `${prefix}-${slugify(title)}-${slugify(venueName)}-${dateLocal}`;
}

function parseJsonLdPayload(raw) {
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed["@graph"])) return parsed["@graph"];
    return [parsed];
  } catch {
    return [];
  }
}

function absoluteUrl(url) {
  const u = clean(url);
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${ZIGGO_BASE}${u}`;
  return `${ZIGGO_BASE}/${u}`;
}

function walkJson(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);

  if (Array.isArray(node)) {
    for (const x of node) walkJson(x, visit);
    return;
  }

  for (const value of Object.values(node)) {
    walkJson(value, visit);
  }
}

function uniqueObjects(arr) {
  const seen = new Set();
  const out = [];

  for (const item of arr || []) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function uniqueStrings(arr) {
  const seen = new Set();
  const out = [];

  for (const value of arr || []) {
    const v = clean(value);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }

  return out;
}

function splitArtistText(value) {
  return String(value || "")
    .split(/,|\/| \u2022 | & | and /i)
    .map((x) => clean(x))
    .filter(Boolean);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
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