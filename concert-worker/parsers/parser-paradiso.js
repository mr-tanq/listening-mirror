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

function parsePage(html, sourceUrl, nowTs, fallbackYear = new Date().getUTCFullYear()) {
  const section = extractAgendaSection(html);
  if (!section) return [];

  const lines = extractAgendaLines(section);
  const anchors = extractAnchors(section);

  if (!lines.length || !anchors.length) return [];

  let currentDate = null;
  let currentTime = null;
  let anchorIndex = 0;
  let pendingArtist = null;

  const events = [];
  const seen = new Set();

  for (const line of lines) {
    const normalizedLine = cleanText(line);
    if (!normalizedLine) continue;
    if (isGarbageToken(normalizedLine)) continue;

    if (isDateToken(normalizedLine)) {
      currentDate = parseCurrentDateToken(normalizedLine, fallbackYear)?.isoDate || null;
      currentTime = null;
      pendingArtist = null;
      continue;
    }

    if (isTimeToken(normalizedLine)) {
      currentTime = normalizedLine;
      pendingArtist = null;
      continue;
    }

    if (looksLikeVenue(normalizedLine)) {
      if (
        pendingArtist &&
        currentDate &&
        isParadisoRelevantVenue(normalizeVenueName(normalizedLine)) &&
        isFutureOrToday(currentDate, nowTs)
      ) {
        const venueName = normalizeVenueName(normalizedLine);
        const title = pendingArtist.text;
        const source_id = buildSourceId({
          title,
          dateLocal: currentDate,
          venueName
        });

        const event = {
          source: "paradiso",
          source_id,
          title,
          artists_main: title,
          artists_all: [title],
          raw_title: title,
          date_local: currentDate,
          time_local: currentTime || null,
          venue_name: venueName,
          city: "Amsterdam",
          country: "NL",
          url: pendingArtist.url,
          image_url: null,
          genre_hint: null,
          fetched_at: nowTs
        };

        const key = makeNormalizedKey(event);
        if (!seen.has(key)) {
          seen.add(key);
          events.push(event);
        }
      }

      pendingArtist = null;
      continue;
    }

    const matchedAnchor = findNextMatchingAnchor(anchors, anchorIndex, normalizedLine);
    if (matchedAnchor) {
      pendingArtist = matchedAnchor.anchor;
      anchorIndex = matchedAnchor.nextIndex;
      continue;
    }
  }

  return events;
}

function extractAgendaSection(html) {
  const text = String(html || "");
  const startIdx = text.indexOf("DATUM");
  if (startIdx === -1) return text;

  const endCandidates = [
    text.indexOf("## ", startIdx + 1),
    text.indexOf("Meer concerten in", startIdx + 1),
    text.indexOf("Gerelateerde concerten", startIdx + 1)
  ].filter((x) => x !== -1);

  if (!endCandidates.length) {
    return text.slice(startIdx);
  }

  const endIdx = Math.min(...endCandidates);
  return text.slice(startIdx, endIdx);
}

function extractAgendaLines(sectionHtml) {
  const withBreaks = String(sectionHtml || "")
    .replace(/<\/(div|p|tr|li|h\d|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/a>/gi, "</a>\n")
    .replace(/<a\b/gi, "\n<a")
    .replace(/<[^>]+>/g, " ");

  return withBreaks
    .split("\n")
    .map((x) => cleanLineText(decodeHtml(x)))
    .filter(Boolean);
}

function extractAnchors(sectionHtml) {
  const out = [];
  const re = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = re.exec(String(sectionHtml || ""))) !== null) {
    const href = absoluteUrl(m[1]);
    const text = normalizeArtistName(m[2].replace(/<[^>]+>/g, " "));
    if (!text) continue;
    if (isGarbageToken(text)) continue;
    if (isDateToken(text)) continue;
    if (isTimeToken(text)) continue;
    if (isMenuToken(text)) continue;

    out.push({
      text,
      url: href
    });
  }

  return out;
}

function findNextMatchingAnchor(anchors, startIndex, lineText) {
  const normalizedLine = normalizeArtistName(lineText);

  for (let i = startIndex; i < Math.min(anchors.length, startIndex + 6); i += 1) {
    const anchor = anchors[i];

    if (normalizeForCompare(anchor.text) === normalizeForCompare(normalizedLine)) {
      return {
        anchor,
        nextIndex: i + 1
      };
    }

    if (
      normalizeForCompare(anchor.text).includes(normalizeForCompare(normalizedLine)) ||
      normalizeForCompare(normalizedLine).includes(normalizeForCompare(anchor.text))
    ) {
      return {
        anchor,
        nextIndex: i + 1
      };
    }
  }

  return null;
}

function normalizeForCompare(value) {
  return slugify(
    decodeHtml(String(value || ""))
      .replace(/\s+\d+$/g, "")
      .trim()
  );
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLineText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
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

function isMenuToken(value) {
  return [
    "OVERZICHT",
    "ALGEMENE INFO",
    "AGENDA",
    "FACTS",
    "FOTO'S",
    "TICKETINFO",
    "ROUTE/KAART"
  ].includes(cleanText(value).toUpperCase());
}

function looksLikeVenue(value) {
  const t = cleanText(value).toLowerCase();

  return [
    "grote zaal",
    "bovenzaal",
    "kelder",
    "zaal onbekend",
    "grote zaal en bovenzaal",
    "tolhuistuin club",
    "tolhuistuin",
    "bitterzoet",
    "parallel",
    "het zonnehuis",
    "cinetol"
  ].some((x) => t === x || t.startsWith(`${x} `));
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
    const rest = t.replace(/^tolhuistuin[\s,]*/i, "").trim();
    return `Tolhuistuin${rest ? ` - ${rest}` : ""}`;
  }

  if (/^bitterzoet$/i.test(t)) return "Bitterzoet";
  if (/^parallel$/i.test(t)) return "Parallel";
  if (/^het zonnehuis$/i.test(t)) return "Het Zonnehuis";
  if (/^cinetol$/i.test(t)) return "Cinetol";

  return t;
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
    "het zonnehuis",
    "cinetol"
  ].includes(t);
}

function normalizeArtistName(value) {
  return cleanText(decodeHtml(value))
    .replace(/\s+\d+$/g, "")
    .trim();
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

function isFutureOrToday(dateLocal, nowTs) {
  if (!dateLocal) return false;

  const now = new Date(nowTs);
  const today =
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  return dateLocal >= today;
}