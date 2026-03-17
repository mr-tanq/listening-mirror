const PODIUMINFO_BASE = "https://www.podiuminfo.nl";
const PARADISO_VENUE_ID = 2;
const PARADISO_CITY = "Amsterdam";
const PARADISO_SLUG = "Paradiso";

const DUTCH_MONTHS = {
  jan: 1,
  feb: 2,
  mrt: 3,
  apr: 4,
  mei: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  okt: 10,
  nov: 11,
  dec: 12
};

const DUTCH_WEEKDAYS = new Set(["ma", "di", "wo", "do", "vr", "za", "zo"]);

export async function fetchParadisoEvents(options = {}) {
  const {
    maxPages = 8,
    stopWhenEmpty = true
  } = options;

  const nowTs = Date.now();
  const allEvents = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildAgendaUrl(page);
    const html = await fetchText(url);
    const pageEvents = parsePage(html, url, nowTs);

    if (pageEvents.length === 0 && stopWhenEmpty) {
      break;
    }

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
  return `${PODIUMINFO_BASE}/podium/${PARADISO_VENUE_ID}/concerten/${page}/${PARADISO_SLUG}/${PARADISO_CITY}/`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function isTimeToken(value) {
  return /^\d{1,2}:\d{2}$/.test(cleanText(value));
}

function isDateToken(value) {
  const t = cleanText(value).toLowerCase();
  const parts = t.split(" ");
  return parts.length === 3 && DUTCH_WEEKDAYS.has(parts[0]) && /^\d{1,2}$/.test(parts[1]) && DUTCH_MONTHS[parts[2]];
}

function isGarbageToken(value) {
  const t = cleanText(value);
  if (!t) return true;

  if (/^\d+$/.test(t)) return true;

  if (["DATUM", "NAAM", "VOORPROGRAMMA", "ZAAL", "INFO"].includes(t.toUpperCase())) {
    return true;
  }

  return false;
}

function normalizeVenueName(raw) {
  const t = cleanText(raw);

  if (!t) return "Paradiso";

  if (/^grote zaal$/i.test(t)) return "Paradiso - Grote Zaal";
  if (/^bovenzaal$/i.test(t)) return "Paradiso - Bovenzaal";
  if (/^kelder$/i.test(t)) return "Paradiso - Kelder";
  if (/^zaal onbekend$/i.test(t)) return "Paradiso - Zaal onbekend";
  if (/^grote zaal en bovenzaal$/i.test(t)) return "Paradiso - Grote Zaal en Bovenzaal";

  if (/^tolhuistuin/i.test(t)) {
    const rest = t.replace(/^tolhuistuin\s*/i, "").trim();
    return `Tolhuistuin${rest ? ` - ${rest}` : ""}`;
  }

  if (/^bitterzoet$/i.test(t)) return "Bitterzoet";
  if (/^parallel$/i.test(t)) return "Parallel";
  if (/^het zonnehuis$/i.test(t)) return "Het Zonnehuis";

  return t;
}
function toIsoDate(day, monthShort, baseYear) {
  const month = DUTCH_MONTHS[String(monthShort || "").toLowerCase()];
  if (!month) return null;

  const d = Number(day);
  if (!Number.isFinite(d)) return null;

  let year = baseYear;
  const now = new Date();

  if (month < (now.getUTCMonth() + 1) - 6) {
    year += 1;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function absoluteUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${PODIUMINFO_BASE}${url}`;
  return `${PODIUMINFO_BASE}/${url}`;
}

function parseCurrentDateToken(token, fallbackYear) {
  const t = cleanText(token).toLowerCase();
  const parts = t.split(" ");
  if (parts.length !== 3) return null;

  const [, day, monthShort] = parts;
  const iso = toIsoDate(day, monthShort, fallbackYear);
  if (!iso) return null;

  return {
    label: t,
    isoDate: iso
  };
}

function extractAgendaSection(html) {
  const startMarker = "DATUM";
  const endMarker = "## ";

  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return html;

  const firstSummaryIdx = html.indexOf(endMarker, startIdx);
  if (firstSummaryIdx === -1) return html.slice(startIdx);

  return html.slice(startIdx, firstSummaryIdx);
}

function extractAnchorsWithNearbyText(sectionHtml) {
  const anchorRegex = /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
  const results = [];

  let match;
  while ((match = anchorRegex.exec(sectionHtml)) !== null) {
    const href = match[1];
    const innerHtml = match[2];

    const text = cleanText(decodeHtml(innerHtml.replace(/<[^>]+>/g, " ")));
    const start = match.index;
    const end = anchorRegex.lastIndex;

    const before = cleanText(
      decodeHtml(sectionHtml.slice(Math.max(0, start - 120), start).replace(/<[^>]+>/g, " "))
    );

    const after = cleanText(
      decodeHtml(sectionHtml.slice(end, Math.min(sectionHtml.length, end + 160)).replace(/<[^>]+>/g, " "))
    );

    results.push({
      href,
      text,
      before,
      after
    });
  }

  return results;
}

function parseVenueFromContext(afterText) {
  const candidates = afterText
    .split(/\s{2,}| \| | , /)
    .map(cleanText)
    .filter(Boolean);

  for (const c of candidates) {
    if (isGarbageToken(c)) continue;
    if (isTimeToken(c)) continue;
    if (isDateToken(c)) continue;
    return c;
  }

  return "";
}

function normalizeArtistName(value) {
  return cleanText(decodeHtml(value))
    .replace(/\s+\d+$/g, "")
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

function buildSourceId({ title, dateLocal, venueName }) {
  const titleSlug = slugify(title || "event");
  const venueSlug = slugify(venueName || "venue");
  return `paradiso-${titleSlug}-${dateLocal}-${venueSlug}`;
}

function isParadisoRelevantVenue(venueName) {
  const t = cleanText(venueName).toLowerCase();

  return [
    "paradiso - grote zaal",
    "paradiso - bovenzaal",
    "paradiso - kelder",
    "paradiso - zaal onbekend",
    "paradiso - grote zaal en bovenzaal",
    "tolhuistuin - club",
    "bitterzoet",
    "parallel",
    "het zonnehuis"
  ].includes(t);
}

function isFutureOrToday(dateLocal, nowTs) {
  if (!dateLocal) return false;

  const now = new Date(nowTs);
  const today =
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  return dateLocal >= today;
}
function parsePage(html, sourceUrl, nowTs, fallbackYear = new Date().getUTCFullYear()) {
  const section = extractAgendaSection(html);
  const anchors = extractAnchorsWithNearbyText(section);

  let currentDate = null;
  const events = [];

  const roughLines = section
    .replace(/<\/(div|p|tr|li|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((x) => cleanText(decodeHtml(x)))
    .filter(Boolean);

  const dateQueue = [];
  for (const line of roughLines) {
    if (isDateToken(line)) {
      const parsed = parseCurrentDateToken(line, fallbackYear);
      if (parsed) dateQueue.push(parsed);
    }
  }

  for (const a of anchors) {
    const anchorText = normalizeArtistName(a.text);

    if (!anchorText) continue;
    if (isGarbageToken(anchorText)) continue;
    if (isTimeToken(anchorText)) continue;
    if (isDateToken(anchorText)) continue;

    if (
      ["OVERZICHT", "ALGEMENE INFO", "AGENDA", "FACTS", "FOTO'S", "TICKETINFO", "ROUTE/KAART"].includes(
        anchorText.toUpperCase()
      )
    ) {
      continue;
    }

    if (!/\/concert\//i.test(a.href) && !/\/concerten\//i.test(a.href)) {
      continue;
    }

    const nearText = `${a.before} ${anchorText} ${a.after}`;

    const dateMatches = [
      ...a.before.matchAll(/\b(ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\b/gi)
    ];

    if (dateMatches.length > 0) {
      const last = dateMatches[dateMatches.length - 1];
      currentDate = parseCurrentDateToken(last[0], fallbackYear);
    } else if (!currentDate && dateQueue.length > 0) {
      currentDate = dateQueue[0];
    }

    const timeMatch =
      a.before.match(/(\d{1,2}:\d{2})\s*$/) ||
      a.after.match(/^(\d{1,2}:\d{2})\b/) ||
      nearText.match(/\b(\d{1,2}:\d{2})\b/);

    const rawVenue = parseVenueFromContext(a.after);
    const venueName = normalizeVenueName(rawVenue);

    const dateLocal = currentDate?.isoDate || null;

    if (!dateLocal) continue;
    if (!isFutureOrToday(dateLocal, nowTs)) continue;
    if (!anchorText) continue;
    if (!venueName) continue;
    if (!isParadisoRelevantVenue(venueName)) continue;

    const title = anchorText;
    const artistsMain = anchorText;
    const artistsAll = [anchorText];
    const rawTitle = anchorText;
    const url = absoluteUrl(a.href);

    events.push({
      source: "paradiso",
      source_id: buildSourceId({
        title,
        dateLocal,
        venueName
      }),
      title,
      artists_main: artistsMain,
      artists_all: artistsAll,
      raw_title: rawTitle,
      date_local: dateLocal,
      time_local: timeMatch ? timeMatch[1] : null,
      venue_name: venueName,
      city: "Amsterdam",
      country: "NL",
      url,
      image_url: null,
      genre_hint: null,
      fetched_at: nowTs,
      _source_url: sourceUrl
    });
  }

  const seen = new Set();
  return events.filter((ev) => {
    const key = makeNormalizedKey(ev);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeNormalizedKey(ev) {
  return [
    ev.date_local || "",
    ev.time_local || "",
    ev.artists_main || "",
    ev.venue_name || ""
  ]
    .map((x) => cleanText(String(x).toLowerCase()))
    .join("::");
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