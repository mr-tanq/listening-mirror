// parsers/parser-paradiso.js
// FULL FILE REPLACE — PART 1/3

const PARADISO_BASE = "https://www.paradiso.nl";

export async function fetchParadisoEvents() {
  const now = Date.now();

  // Δοκιμάζουμε και NL και EN agenda roots
  const seedUrls = [
    `${PARADISO_BASE}/nl/agenda`,
    `${PARADISO_BASE}/en/agenda`,
    `${PARADISO_BASE}/nl`,
    `${PARADISO_BASE}/en`
  ];

  const visitedListingPages = new Set();
  const collectedEventUrls = new Set();

  const listingQueue = [...seedUrls];
  const maxListingPages = 12;

  while (listingQueue.length > 0 && visitedListingPages.size < maxListingPages) {
    const pageUrl = listingQueue.shift();
    if (!pageUrl || visitedListingPages.has(pageUrl)) continue;

    visitedListingPages.add(pageUrl);

    const html = await fetchText(pageUrl);
    if (!html) continue;

    // Μαζεύει links προς event pages
    for (const link of extractParadisoEventLinks(html)) {
      collectedEventUrls.add(link);
    }

    // Βρες πιθανό pagination / next
    for (const nextUrl of extractNextListingUrls(html, pageUrl)) {
      if (!visitedListingPages.has(nextUrl)) {
        listingQueue.push(nextUrl);
      }
    }
  }

  const eventUrls = Array.from(collectedEventUrls);

  // Παράλληλο hydrate με limit
  const hydrated = await mapLimit(eventUrls, 6, async (url) => {
    try {
      return await parseParadisoEventPage(url, now);
    } catch {
      return null;
    }
  });

  const valid = hydrated.filter(Boolean);

  // dedupe by source_id, fallback url
  const seen = new Set();
  const out = [];

  for (const ev of valid) {
    const key = ev.source_id || ev.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }

  out.sort((a, b) => {
    const da = `${a.date_local || ""} ${a.time_local || ""}`.trim();
    const db = `${b.date_local || ""} ${b.time_local || ""}`.trim();
    return da.localeCompare(db);
  });

  return out;
}

async function parseParadisoEventPage(url, nowTs) {
  const html = await fetchText(url);
  if (!html) return null;

  const ld = extractJsonLdBlocks(html);
  const parsedLd = ld.map(safeJsonParse).filter(Boolean);

  const title =
    pickTitleFromJsonLd(parsedLd) ||
    extractMetaContent(html, "property", "og:title") ||
    extractMetaContent(html, "name", "twitter:title") ||
    extractFirstH1(html) ||
    extractTitleTag(html);

  if (!title) return null;

  const startIso =
    pickStartDateFromJsonLd(parsedLd) ||
    extractMetaContent(html, "property", "article:published_time") ||
    extractDateTimeFromHtml(html);

  let date_local = null;
  let time_local = null;

  if (startIso) {
    const dt = parseDateLike(startIso);
    if (dt) {
      if (dt.getTime() < nowTs - 6 * 60 * 60 * 1000) {
        return null;
      }

      date_local = formatDateLocal(dt, "Europe/Amsterdam");
      time_local = formatTimeLocal(dt, "Europe/Amsterdam");
    }
  }

  if (!date_local) {
    const fallbackDate = extractVisibleDate(html);
    if (!fallbackDate) return null;

    const dt = parseDateLike(fallbackDate);
    if (!dt) return null;

    if (dt.getTime() < nowTs - 6 * 60 * 60 * 1000) {
      return null;
    }

    date_local = formatDateLocal(dt, "Europe/Amsterdam");
    time_local = null;
  }

  const rawTitle =
    pickRawTitleFromJsonLd(parsedLd) ||
    title;

  const artists_all = extractArtists(title, rawTitle);
  const artists_main = artists_all[0] || title;

  const image_url =
    pickImageFromJsonLd(parsedLd) ||
    extractMetaContent(html, "property", "og:image") ||
    extractMetaContent(html, "name", "twitter:image");

  const numericId = extractParadisoNumericId(url);
  const source_id = buildSourceId({
    source: "paradiso",
    title: artists_main,
    dateLocal: date_local,
    numericId
  });

  return {
    source: "paradiso",
    source_id,
    title: artists_main,
    artists_main,
    artists_all,
    raw_title: rawTitle,
    date_local,
    time_local,
    venue_name: "Paradiso",
    city: "Amsterdam",
    country: "NL",
    url,
    image_url: image_url || null,
    genre_hint: null,
    fetched_at: nowTs
  };
}
// parsers/parser-paradiso.js
// FULL FILE REPLACE — PART 2/3

function extractParadisoEventLinks(html) {
  const out = new Set();
  const s = String(html || "");

  const re = /href=["']([^"']*\/(?:nl|en)\/programma\/[^"']+\/\d+[^"']*)["']/gi;
  let m;

  while ((m = re.exec(s))) {
    const href = absolutizeUrl(m[1], PARADISO_BASE);
    if (!href) continue;
    out.add(stripUrlHash(href));
  }

  return Array.from(out);
}

function extractNextListingUrls(html, pageUrl) {
  const out = new Set();
  const s = String(html || "");

  const patterns = [
    /href=["']([^"']+)["'][^>]*rel=["']next["']/gi,
    /rel=["']next["'][^>]*href=["']([^"']+)["']/gi,
    /href=["']([^"']+)["'][^>]*aria-label=["'][^"']*next[^"']*["']/gi,
    /href=["']([^"']+)["'][^>]*>\s*(?:next|volgende|›|»)\s*</gi
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(s))) {
      const href = absolutizeUrl(m[1], PARADISO_BASE);
      if (!href) continue;
      if (looksLikeListingUrl(href, pageUrl)) {
        out.add(stripUrlHash(href));
      }
    }
  }

  // Fallback: page/2, ?page=2, /agenda?page=2 κτλ
  const genericHrefRe = /href=["']([^"']+)["']/gi;
  let gm;
  while ((gm = genericHrefRe.exec(s))) {
    const href = absolutizeUrl(gm[1], PARADISO_BASE);
    if (!href) continue;
    if (!looksLikeListingUrl(href, pageUrl)) continue;
    out.add(stripUrlHash(href));
  }

  return Array.from(out);
}

function looksLikeListingUrl(url, currentPageUrl) {
  const u = String(url || "").toLowerCase();
  const c = String(currentPageUrl || "").toLowerCase();

  if (u === c) return false;
  if (!u.startsWith(PARADISO_BASE.toLowerCase())) return false;
  if (u.includes("/programma/")) return false;

  return (
    u.includes("/agenda") ||
    u.includes("?page=") ||
    u.includes("/page/") ||
    u.includes("/nl") ||
    u.includes("/en")
  );
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;

  while ((m = re.exec(String(html || "")))) {
    const raw = String(m[1] || "").trim();
    if (raw) blocks.push(raw);
  }

  return blocks;
}

function pickTitleFromJsonLd(blocks) {
  for (const obj of blocks) {
    const candidate = deepFindFirst(obj, ["name", "headline"]);
    if (candidate) return decodeHtml(candidate).trim();
  }
  return null;
}

function pickRawTitleFromJsonLd(blocks) {
  for (const obj of blocks) {
    const candidate = deepFindFirst(obj, ["name", "headline"]);
    if (candidate) return decodeHtml(candidate).trim();
  }
  return null;
}

function pickStartDateFromJsonLd(blocks) {
  for (const obj of blocks) {
    const candidate = deepFindFirst(obj, ["startDate", "startdate"]);
    if (candidate) return String(candidate).trim();
  }
  return null;
}

function pickImageFromJsonLd(blocks) {
  for (const obj of blocks) {
    const candidate = deepFindFirst(obj, ["image"]);
    if (!candidate) continue;

    if (typeof candidate === "string") return candidate.trim();
    if (Array.isArray(candidate) && candidate[0]) return String(candidate[0]).trim();
    if (typeof candidate === "object" && candidate.url) return String(candidate.url).trim();
  }
  return null;
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
  const re = new RegExp(
    `<meta[^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]*>`,
    "i"
  );

  const m = s.match(re) || s.match(re2);
  return m ? decodeHtml(m[1]).trim() : null;
}

function extractFirstH1(html) {
  const m = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  return cleanText(m[1]);
}

function extractTitleTag(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return cleanText(m[1]);
}

function extractDateTimeFromHtml(html) {
  const s = String(html || "");

  const patterns = [
    /datetime=["']([^"']+)["']/i,
    /"startDate"\s*:\s*"([^"]+)"/i,
    /data-start-date=["']([^"']+)["']/i,
    /data-date=["']([^"']+)["']/i
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }

  return null;
}
// parsers/parser-paradiso.js
// FULL FILE REPLACE — PART 3/3

function extractVisibleDate(html) {
  const text = cleanText(String(html || ""));

  // ISO-like
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2})?\b/);
  if (iso?.[1]) return iso[1];

  // European style dd-mm-yyyy or dd/mm/yyyy
  const euro = text.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2})\b/);
  if (euro?.[1]) return euro[1];

  return null;
}

function extractArtists(title, rawTitle) {
  const source = String(rawTitle || title || "").trim();
  if (!source) return [];

  const normalized = decodeHtml(source)
    .replace(/\s+/g, " ")
    .trim();

  const parts = normalized
    .split(/\s+\+\s+|,\s+| \u2022 | • | \| |\s+feat\.?\s+|\s+ft\.?\s+/i)
    .map(s => s.trim())
    .filter(Boolean);

  return parts.length ? parts : [normalized];
}

function buildSourceId({ source, title, dateLocal, numericId }) {
  const slug = slugify(title || "event");
  const idPart = numericId ? String(numericId) : "noid";
  return `${source}-${slug}-${dateLocal}-${idPart}`;
}

function extractParadisoNumericId(url) {
  const m = String(url || "").match(/\/(\d+)(?:\/)?$/);
  return m ? m[1] : null;
}

function parseDateLike(value) {
  if (!value) return null;

  const s = String(value).trim();

  // ISO / native parse
  const native = new Date(s);
  if (!Number.isNaN(native.getTime())) return native;

  // dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = Number(m[3]);
    return new Date(Date.UTC(year, month, day, 12, 0, 0));
  }

  return null;
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

  if (!hh || !mm) return null;
  return `${hh}:${mm}`;
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; eConcerts/1.0; +https://errtanq9.workers.dev)",
        "accept": "text/html,application/xhtml+xml"
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
  let index = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await fn(items[current], current);
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
    .replace(/-+/g, "-")
    .trim();
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