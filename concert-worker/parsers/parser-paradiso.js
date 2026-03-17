// parsers/parser-paradiso.js
// FULL FILE REPLACE — PART 1/3

const PARADISO_BASE = "https://www.paradiso.nl";
const AMSTERDAM_TZ = "Europe/Amsterdam";

export async function fetchParadisoEvents() {
  const now = Date.now();

  const collectedEventUrls = new Set();

  // 1) Πρώτα προσπαθούμε μέσω sitemap
  const sitemapEventUrls = await discoverParadisoEventUrlsFromSitemaps();
  for (const url of sitemapEventUrls) {
    collectedEventUrls.add(url);
  }

  // 2) Fallback / supplement από homepage + embedded JSON/script links
  const seedUrls = [
    `${PARADISO_BASE}/nl/`,
    `${PARADISO_BASE}/en/`,
    `${PARADISO_BASE}/nl`,
    `${PARADISO_BASE}/en`
  ];

  for (const pageUrl of seedUrls) {
    const html = await fetchText(pageUrl);
    if (!html) continue;

    for (const link of extractParadisoEventLinks(html)) {
      collectedEventUrls.add(link);
    }
  }

  const eventUrls = Array.from(collectedEventUrls);

  const hydrated = await mapLimit(eventUrls, 6, async (url) => {
    try {
      return await parseParadisoEventPage(url, now);
    } catch {
      return null;
    }
  });

  const valid = hydrated.filter(Boolean);

  const seen = new Set();
  const out = [];

  for (const ev of valid) {
    const key = ev.source_id || ev.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }

  out.sort(compareEvents);

  return out;
}

async function discoverParadisoEventUrlsFromSitemaps() {
  const out = new Set();

  const sitemapCandidates = [
    `${PARADISO_BASE}/sitemap_index.xml`,
    `${PARADISO_BASE}/sitemap.xml`,
    `${PARADISO_BASE}/post-sitemap.xml`,
    `${PARADISO_BASE}/page-sitemap.xml`,
    `${PARADISO_BASE}/post-sitemap1.xml`,
    `${PARADISO_BASE}/page-sitemap1.xml`
  ];

  const childSitemaps = new Set();

  for (const url of sitemapCandidates) {
    const xml = await fetchText(url, "application/xml,text/xml;q=0.9,*/*;q=0.8");
    if (!xml) continue;

    // direct urlset
    for (const loc of extractXmlLocs(xml)) {
      if (looksLikeParadisoEventUrl(loc)) out.add(stripUrlHash(loc));
      else if (looksLikeSitemapUrl(loc)) childSitemaps.add(stripUrlHash(loc));
    }
  }

  const childList = Array.from(childSitemaps).slice(0, 20);

  const childResults = await mapLimit(childList, 4, async (sitemapUrl) => {
    const xml = await fetchText(sitemapUrl, "application/xml,text/xml;q=0.9,*/*;q=0.8");
    if (!xml) return [];

    return extractXmlLocs(xml).filter(looksLikeParadisoEventUrl);
  });

  for (const arr of childResults) {
    for (const url of arr || []) {
      out.add(stripUrlHash(url));
    }
  }

  return Array.from(out);
}

async function parseParadisoEventPage(url, nowTs) {
  const html = await fetchText(url);
  if (!html) return null;

  const ldBlocksRaw = extractJsonLdBlocks(html);
  const ldBlocks = ldBlocksRaw.map(safeJsonParse).filter(Boolean);

  const title =
    pickEventNameFromJsonLd(ldBlocks) ||
    extractMetaContent(html, "property", "og:title") ||
    extractMetaContent(html, "name", "twitter:title") ||
    extractFirstH1(html) ||
    extractTitleTag(html);

  if (!title) return null;

  const startValue =
    pickEventStartDateFromJsonLd(ldBlocks) ||
    extractEventDateTimeFromHtml(html) ||
    extractVisibleDateTime(html);

  const parsedStart = parseParadisoDateLike(startValue);

  if (!parsedStart?.date_local) {
    return null;
  }

  // κρατάμε μόνο current/future events
  const eventEpoch = parsedStart.event_epoch_ms;
  if (eventEpoch != null && eventEpoch < nowTs - 12 * 60 * 60 * 1000) {
    return null;
  }

  const rawTitle =
    pickRawTitleFromJsonLd(ldBlocks) ||
    title;

  const artists_all = extractArtists(title, rawTitle);
  const artists_main = artists_all[0] || cleanTitle(title);

  const image_url =
    pickImageFromJsonLd(ldBlocks) ||
    extractMetaContent(html, "property", "og:image") ||
    extractMetaContent(html, "name", "twitter:image") ||
    null;

  const numericId = extractParadisoNumericId(url);

  const source_id = buildSourceId({
    source: "paradiso",
    title: artists_main,
    dateLocal: parsedStart.date_local,
    numericId
  });

  return {
    source: "paradiso",
    source_id,
    title: artists_main,
    artists_main,
    artists_all,
    raw_title: rawTitle,
    date_local: parsedStart.date_local,
    time_local: parsedStart.time_local,
    venue_name: "Paradiso",
    city: "Amsterdam",
    country: "NL",
    url,
    image_url,
    genre_hint: null,
    fetched_at: nowTs
  };
}

function compareEvents(a, b) {
  const da = `${a.date_local || ""} ${a.time_local || "99:99"}`;
  const db = `${b.date_local || ""} ${b.time_local || "99:99"}`;
  return da.localeCompare(db) || String(a.title || "").localeCompare(String(b.title || ""));
}
// parsers/parser-paradiso.js
// FULL FILE REPLACE — PART 2/3

function extractParadisoEventLinks(html) {
  const out = new Set();
  const s = String(html || "");

  // hrefs
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(s))) {
    const abs = absolutizeUrl(m[1], PARADISO_BASE);
    if (looksLikeParadisoEventUrl(abs)) {
      out.add(stripUrlHash(abs));
    }
  }

  // embedded JSON/script escaped urls
  const escapedUrlRe = /https?:\\\/\\\/www\.paradiso\.nl\\\/(?:nl|en)\\\/programma\\\/[^"'\\<>\s]+/gi;
  while ((m = escapedUrlRe.exec(s))) {
    const unescaped = m[0].replace(/\\\//g, "/");
    if (looksLikeParadisoEventUrl(unescaped)) {
      out.add(stripUrlHash(unescaped));
    }
  }

  // plain urls in scripts
  const plainUrlRe = /https?:\/\/www\.paradiso\.nl\/(?:nl|en)\/programma\/[^"'\s<>()]+/gi;
  while ((m = plainUrlRe.exec(s))) {
    if (looksLikeParadisoEventUrl(m[0])) {
      out.add(stripUrlHash(m[0]));
    }
  }

  return Array.from(out);
}

function looksLikeParadisoEventUrl(url) {
  const s = String(url || "").toLowerCase();
  if (!s.startsWith(PARADISO_BASE.toLowerCase())) return false;
  if (!/\/(?:nl|en)\/programma\/.+\/\d+\/?$/.test(s)) return false;
  return true;
}

function looksLikeSitemapUrl(url) {
  const s = String(url || "").toLowerCase();
  return s.startsWith(PARADISO_BASE.toLowerCase()) && s.endsWith(".xml");
}

function extractXmlLocs(xml) {
  const out = [];
  const re = /<loc>([\s\S]*?)<\/loc>/gi;
  let m;

  while ((m = re.exec(String(xml || "")))) {
    const loc = cleanText(m[1]);
    if (loc) out.push(loc);
  }

  return out;
}

function extractJsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;

  while ((m = re.exec(String(html || "")))) {
    const raw = String(m[1] || "").trim();
    if (raw) out.push(raw);
  }

  return out;
}

function pickEventNameFromJsonLd(blocks) {
  for (const obj of blocks) {
    const eventNodes = flattenObjects(obj).filter(isLikelyEventNode);
    for (const node of eventNodes) {
      const name = node?.name || node?.headline;
      if (name) return decodeHtml(String(name)).trim();
    }
  }

  for (const obj of blocks) {
    const candidate = deepFindFirst(obj, ["name", "headline"]);
    if (candidate) return decodeHtml(String(candidate)).trim();
  }

  return null;
}

function pickRawTitleFromJsonLd(blocks) {
  return pickEventNameFromJsonLd(blocks);
}

function pickEventStartDateFromJsonLd(blocks) {
  for (const obj of blocks) {
    const eventNodes = flattenObjects(obj).filter(isLikelyEventNode);
    for (const node of eventNodes) {
      if (node?.startDate) return String(node.startDate).trim();
    }
  }

  for (const obj of blocks) {
    const candidate = deepFindFirst(obj, ["startDate", "startdate"]);
    if (candidate) return String(candidate).trim();
  }

  return null;
}

function pickImageFromJsonLd(blocks) {
  for (const obj of blocks) {
    const eventNodes = flattenObjects(obj).filter(isLikelyEventNode);
    for (const node of eventNodes) {
      const img = node?.image;
      const picked = normalizeImageValue(img);
      if (picked) return picked;
    }
  }

  for (const obj of blocks) {
    const picked = normalizeImageValue(deepFindFirst(obj, ["image"]));
    if (picked) return picked;
  }

  return null;
}

function normalizeImageValue(candidate) {
  if (!candidate) return null;
  if (typeof candidate === "string") return candidate.trim();
  if (Array.isArray(candidate) && candidate[0]) return String(candidate[0]).trim();
  if (typeof candidate === "object" && candidate.url) return String(candidate.url).trim();
  return null;
}

function flattenObjects(node, out = []) {
  if (!node) return out;

  if (Array.isArray(node)) {
    for (const item of node) flattenObjects(item, out);
    return out;
  }

  if (typeof node === "object") {
    out.push(node);
    for (const value of Object.values(node)) {
      flattenObjects(value, out);
    }
  }

  return out;
}

function isLikelyEventNode(node) {
  if (!node || typeof node !== "object") return false;

  const t = node["@type"];
  if (Array.isArray(t) && t.some(x => String(x).toLowerCase() === "event")) return true;
  if (String(t || "").toLowerCase() === "event") return true;

  return Boolean(node.startDate && (node.name || node.headline));
}

function deepFindFirst(node, keys) {
  if (!node || !keys?.length) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const v = deepFindFirst(item, keys);
      if (v != null) return v;
    }
    return null;
  }

  if (typeof node !== "object") return null;

  for (const key of keys) {
    if (node[key] != null) return node[key];
  }

  for (const value of Object.values(node)) {
    const v = deepFindFirst(value, keys);
    if (v != null) return v;
  }

  return null;
}

function extractMetaContent(html, attrName, attrValue) {
  const s = String(html || "");
  const re1 = new RegExp(
    `<meta[^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]*>`,
    "i"
  );

  const m = s.match(re1) || s.match(re2);
  return m?.[1] ? decodeHtml(m[1]).trim() : null;
}

function extractFirstH1(html) {
  const m = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m?.[1] ? cleanText(m[1]) : null;
}

function extractTitleTag(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? cleanText(m[1]) : null;
}

function extractEventDateTimeFromHtml(html) {
  const s = String(html || "");

  const patterns = [
    /"startDate"\s*:\s*"([^"]+)"/i,
    /datetime=["']([^"']+)["']/i,
    /data-start-date=["']([^"']+)["']/i,
    /data-date=["']([^"']+)["']/i,
    /data-start=["']([^"']+)["']/i
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }

  return null;
}

function extractVisibleDateTime(html) {
  const text = cleanText(html);

  const patterns = [
    /\b(20\d{2}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z|[+\-]\d{2}:\d{2})?)?)\b/i,
    /\b(\d{1,2}[./-]\d{1,2}[./-]20\d{2})(?:\s+(\d{1,2}:\d{2}))?\b/i,
    /\b(\d{1,2}\s+(?:jan|januari|feb|februari|mrt|maart|apr|april|mei|jun|juni|jul|juli|aug|augustus|sep|sept|september|okt|oct|oktober|october|nov|november|dec|december)\s+20\d{2})(?:\s+(\d{1,2}:\d{2}))?\b/i,
    /\b(\d{1,2}\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+20\d{2})(?:\s+(\d{1,2}:\d{2}))?\b/i
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      return [m[1], m[2]].filter(Boolean).join(" ");
    }
  }

  return null;
}
// parsers/parser-paradiso.js
// FULL FILE REPLACE — PART 3/3

function parseParadisoDateLike(value) {
  if (!value) return null;

  const raw = decodeHtml(String(value).trim());
  const s = raw.toLowerCase();

  // ISO / native parse
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) {
    return {
      date_local: formatDateLocal(native, AMSTERDAM_TZ),
      time_local: hasExplicitTime(raw) ? formatTimeLocal(native, AMSTERDAM_TZ) : null,
      event_epoch_ms: native.getTime()
    };
  }

  // dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy [hh:mm]
  let m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hh = m[4] != null ? Number(m[4]) : 19;
    const mm = m[5] != null ? Number(m[5]) : 0;

    const dt = buildAmsterdamDate(year, month, day, hh, mm);
    return {
      date_local: formatDateLocal(dt, AMSTERDAM_TZ),
      time_local: m[4] != null ? pad2(hh) + ":" + pad2(mm) : null,
      event_epoch_ms: dt.getTime()
    };
  }

  // 27 maart 2026 [19:30] / 27 march 2026 [19:30]
  m = s.match(/^(\d{1,2})\s+([a-z\u00c0-\u017f]+)\s+(20\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/i);
  if (m) {
    const day = Number(m[1]);
    const month = monthNameToNumber(m[2]);
    const year = Number(m[3]);
    const hh = m[4] != null ? Number(m[4]) : 19;
    const mm = m[5] != null ? Number(m[5]) : 0;

    if (month) {
      const dt = buildAmsterdamDate(year, month, day, hh, mm);
      return {
        date_local: formatDateLocal(dt, AMSTERDAM_TZ),
        time_local: m[4] != null ? pad2(hh) + ":" + pad2(mm) : null,
        event_epoch_ms: dt.getTime()
      };
    }
  }

  return null;
}

function monthNameToNumber(name) {
  const n = String(name || "").toLowerCase();

  const map = {
    jan: 1, januari: 1, january: 1,
    feb: 2, februari: 2, february: 2,
    mrt: 3, maart: 3, mar: 3, march: 3,
    apr: 4, april: 4,
    mei: 5, may: 5,
    jun: 6, juni: 6, june: 6,
    jul: 7, juli: 7, july: 7,
    aug: 8, augustus: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    okt: 10, oktober: 10, oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  return map[n] || null;
}

function hasExplicitTime(value) {
  return /\d{1,2}:\d{2}/.test(String(value || ""));
}

function buildAmsterdamDate(year, month, day, hour, minute) {
  // pragmatic approach για worker χωρίς external tz lib
  // ξεκινάμε με UTC κοντά στην Amsterdam local time
  return new Date(Date.UTC(year, month - 1, day, hour - 1, minute, 0));
}

function formatDateLocal(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const get = (type) => parts.find(p => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatTimeLocal(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find(p => p.type === type)?.value || "";
  const hh = get("hour");
  const mm = get("minute");
  return hh && mm ? `${hh}:${mm}` : null;
}

function extractArtists(title, rawTitle) {
  const source = String(rawTitle || title || "").trim();
  if (!source) return [];

  const normalized = cleanTitle(source);
  const parts = normalized
    .split(/\s+\+\s+|,\s+|\s+•\s+|\s+\|\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+support:\s+/i)
    .map(x => cleanTitle(x))
    .filter(Boolean);

  return parts.length ? parts : [normalized];
}

function cleanTitle(value) {
  return decodeHtml(String(value || ""))
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+Paradiso.*$/i, "")
    .trim();
}

function buildSourceId({ source, title, dateLocal, numericId }) {
  const slug = slugify(title || "event");
  const idPart = numericId ? String(numericId) : "noid";
  return `${source}-${slug}-${dateLocal}-${idPart}`;
}

function extractParadisoNumericId(url) {
  const m = String(url || "").match(/\/(\d+)\/?$/);
  return m?.[1] || null;
}

async function fetchText(url, accept = "text/html,application/xhtml+xml") {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; eConcerts/1.0; +https://econcerts.errtanq9.workers.dev)",
        "accept": accept
      }
    });

    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return out;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (!Number.isFinite(code)) return _;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code)) return _;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    });
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

function absolutizeUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function stripUrlHash(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}