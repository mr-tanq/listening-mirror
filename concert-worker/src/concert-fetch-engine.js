// concert-fetch-engine.js
// Listening Mirror — Concert Worker
// Venue fetch + parse engine v8
// Custom handling for: paradiso, doornroosje, patronaat, paard, tivoli

import { VENUES } from "./venues-engine.js";

export async function fetchAllVenueEvents() {
  const results = [];

  for (const venue of VENUES) {
    try {
      const events = await fetchVenueEventsById(venue.id);
      results.push(...events);
    } catch (err) {
      console.log(`[concert-fetch-engine] failed for ${venue.id}: ${err.message}`);
    }
  }

  return dedupeEvents(results);
}

export async function fetchVenueEventsById(venueId) {
  const venue = VENUES.find((v) => v.id === venueId);

  if (!venue) {
    throw new Error(`Unknown venue: ${venueId}`);
  }

  const html = await fetchHtml(venue.url);
  const events = parseVenueHtml(html, venue);

  return dedupeEvents(events);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ListeningMirrorConcertBot/1.0",
      "accept-language": "en-US,en;q=0.9,nl;q=0.8"
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }

  return await res.text();
}

function parseVenueHtml(html, venue) {
  switch (venue.id) {
    case "paradiso":
      return parseParadiso(html, venue);
    case "doornroosje":
      return parseDoornroosje(html, venue);
    case "patronaat":
      return parsePatronaat(html, venue);
    case "paard":
      return parsePaard(html, venue);
    case "tivoli":
      return parseTivoli(html, venue);
    default:
      return parseGenericVenue(html, venue);
  }
}

function parseGenericVenue(html, venue) {
  const blocks = splitIntoCandidateBlocks(html);
  const events = [];

  for (const block of blocks) {
    let rawTitle = extractTitle(block);
    const link = extractLink(block, venue.url);
    const dateLocal = extractDate(block) || extractDateFromUrl(link);
    const imageUrl = extractImage(block);
    const timeLocal = extractTime(block);

    if (!rawTitle || isBlockedTitle(rawTitle)) {
      rawTitle = titleFromLink(link);
    }

    if (!rawTitle || isBlockedTitle(rawTitle) || !dateLocal || !link) continue;
    if (!looksLikeRealEvent(rawTitle, link, venue)) continue;

    const artistInfo = normalizeArtist(rawTitle);

    events.push(
      buildEvent({
        venue,
        sourceId: buildSourceId(venue.id, artistInfo.main, dateLocal, link),
        rawTitle,
        title: artistInfo.main,
        artistsAll: artistInfo.all,
        dateLocal,
        timeLocal,
        link,
        imageUrl
      })
    );
  }

  return events;
}

function parseParadiso(html, venue) {
  const events = [];
  const seen = new Set();

  const linkRegex =
    /href="([^"]*(?:\/nl\/programma\/|\/program\/|\/en\/program\/)[^"]+)"/gi;

  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;

    let link;
    try {
      link = new URL(href, "https://www.paradiso.nl").toString();
    } catch {
      continue;
    }

    const lower = link.toLowerCase();

    if (
      lower.includes("/nieuws/") ||
      lower.includes("/news/") ||
      lower.includes("/archief/") ||
      lower.includes("/over/") ||
      lower.includes("?")
    ) {
      continue;
    }

    if (seen.has(link)) continue;
    seen.add(link);

    const start = Math.max(0, match.index - 2200);
    const end = Math.min(html.length, match.index + 4200);
    const block = html.slice(start, end);

    let rawTitle = extractTitle(block);
    const dateLocal = extractDate(block) || extractDateFromUrl(link);
    const timeLocal = extractTime(block);
    const imageUrl = extractImage(block);

    if (!rawTitle || isBlockedTitle(rawTitle)) {
      rawTitle = titleFromLink(link);
    }

    if (!rawTitle || isBlockedTitle(rawTitle) || !dateLocal) continue;
    if (!looksLikeRealEvent(rawTitle, link, venue)) continue;

    const artistInfo = normalizeArtist(rawTitle);

    events.push(
      buildEvent({
        venue,
        sourceId: buildSourceId(venue.id, artistInfo.main, dateLocal, link),
        rawTitle,
        title: artistInfo.main,
        artistsAll: artistInfo.all,
        dateLocal,
        timeLocal,
        link,
        imageUrl
      })
    );
  }

  return events;
}
function parseDoornroosje(html, venue) {
  const events = [];
  const blocks = html.split(/href="https:\/\/www\.doornroosje\.nl\/event\/|href="\/event\//i);

  for (let i = 1; i < blocks.length; i++) {
    const partial = blocks[i];
    const hrefMatch = partial.match(/^([^"]+)"/);
    if (!hrefMatch) continue;

    const hrefPart = hrefMatch[1].replace(/^https:\/\/www\.doornroosje\.nl\/event\//i, "");
    const link = new URL(`/event/${hrefPart}`, "https://www.doornroosje.nl").toString();
    const block = `href="${link}" ${partial}`;

    let rawTitle = extractTitle(block);
    const dateLocal = extractDate(block) || extractDateFromUrl(link);
    const timeLocal = extractTime(block);
    const imageUrl = extractImage(block);

    if (!rawTitle || isBlockedTitle(rawTitle)) {
      rawTitle = titleFromLink(link);
    }

    if (!rawTitle || isBlockedTitle(rawTitle) || !dateLocal || !link) continue;
    if (!looksLikeRealEvent(rawTitle, link, venue)) continue;

    const artistInfo = normalizeArtist(rawTitle);

    events.push(
      buildEvent({
        venue,
        sourceId: buildSourceId(venue.id, artistInfo.main, dateLocal, link),
        rawTitle,
        title: artistInfo.main,
        artistsAll: artistInfo.all,
        dateLocal,
        timeLocal,
        link,
        imageUrl
      })
    );
  }

  return events;
}

function parsePatronaat(html, venue) {
  const events = [];
  const blocks = html.split(/href="https:\/\/patronaat\.nl\/event\/|href="\/event\//i);

  for (let i = 1; i < blocks.length; i++) {
    const partial = blocks[i];
    const hrefMatch = partial.match(/^([^"]+)"/);
    if (!hrefMatch) continue;

    const hrefPart = hrefMatch[1].replace(/^https:\/\/patronaat\.nl\/event\//i, "");
    const link = new URL(`/event/${hrefPart}`, "https://patronaat.nl").toString();
    const block = `href="${link}" ${partial}`;

    let rawTitle = extractTitle(block);
    const dateLocal = extractDate(block) || extractDateFromUrl(link);
    const timeLocal = extractTime(block);
    const imageUrl = extractImage(block);

    if (!rawTitle || isBlockedTitle(rawTitle)) {
      rawTitle = titleFromLink(link);
    }

    if (!rawTitle || isBlockedTitle(rawTitle) || !dateLocal || !link) continue;
    if (!looksLikeRealEvent(rawTitle, link, venue)) continue;

    const artistInfo = normalizeArtist(rawTitle);

    events.push(
      buildEvent({
        venue,
        sourceId: buildSourceId(venue.id, artistInfo.main, dateLocal, link),
        rawTitle,
        title: artistInfo.main,
        artistsAll: artistInfo.all,
        dateLocal,
        timeLocal,
        link,
        imageUrl
      })
    );
  }

  return events;
}

function parsePaard(html, venue) {
  const events = [];
  const seen = new Set();

  const linkRegex =
    /href="([^"]*(?:\/programma\/|\/event\/|\/agenda\/)[^"]+)"/gi;

  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;

    let link;
    try {
      link = new URL(href, "https://www.paard.nl").toString();
    } catch {
      continue;
    }

    const lower = link.toLowerCase();

    if (
      lower.includes("/nieuws/") ||
      lower.includes("/news/") ||
      lower.includes("/contact") ||
      lower.includes("/over") ||
      lower.includes("/vacature") ||
      lower.includes("/ticket") ||
      lower.includes("?")
    ) {
      continue;
    }

    if (seen.has(link)) continue;
    seen.add(link);

    const start = Math.max(0, match.index - 2400);
    const end = Math.min(html.length, match.index + 5000);
    const block = html.slice(start, end);

    let rawTitle = extractTitle(block);
    const dateLocal = extractDate(block) || extractDateFromUrl(link);
    const timeLocal = extractTime(block);
    const imageUrl = extractImage(block);

    if (!rawTitle || isBlockedTitle(rawTitle)) {
      rawTitle = titleFromLink(link);
    }

    if (!rawTitle || isBlockedTitle(rawTitle) || !dateLocal || !link) continue;
    if (!looksLikeRealEvent(rawTitle, link, venue)) continue;

    const artistInfo = normalizeArtist(rawTitle);

    events.push(
      buildEvent({
        venue,
        sourceId: buildSourceId(venue.id, artistInfo.main, dateLocal, link),
        rawTitle,
        title: artistInfo.main,
        artistsAll: artistInfo.all,
        dateLocal,
        timeLocal,
        link,
        imageUrl
      })
    );
  }

  return events;
}

function parseTivoli(html, venue) {
  const events = [];
  const seen = new Set();

  const linkRegex = /href="([^"]*\/agenda\/\d+\/[^"]+)"/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;

    let link;
    try {
      link = new URL(href, "https://www.tivolivredenburg.nl").toString();
    } catch {
      continue;
    }

    if (seen.has(link)) continue;
    seen.add(link);

    const start = Math.max(0, match.index - 2400);
    const end = Math.min(html.length, match.index + 5200);
    const block = html.slice(start, end);

    let rawTitle = extractTitle(block);
    const dateLocal = extractDate(block) || extractDateFromUrl(link);
    const timeLocal = extractTime(block);
    const imageUrl = extractImage(block);

    if (!rawTitle || isBlockedTitle(rawTitle)) {
      rawTitle = titleFromTivoliLink(link);
    }

    if (!rawTitle || isBlockedTitle(rawTitle) || !dateLocal || !link) continue;
    if (!looksLikeRealEvent(rawTitle, link, venue)) continue;
    if (!looksLikeMusicEvent(rawTitle, link)) continue;

    const artistInfo = normalizeArtist(rawTitle);

    events.push(
      buildEvent({
        venue,
        sourceId: buildSourceId(venue.id, artistInfo.main, dateLocal, link),
        rawTitle,
        title: artistInfo.main,
        artistsAll: artistInfo.all,
        dateLocal,
        timeLocal,
        link,
        imageUrl
      })
    );
  }

  return events;
}
function buildEvent({
  venue,
  sourceId,
  rawTitle,
  title,
  artistsAll,
  dateLocal,
  timeLocal,
  link,
  imageUrl
}) {
  return {
    source: venue.id,
    source_id: sourceId,
    title,
    artists_main: title,
    artists_all: artistsAll,
    raw_title: rawTitle,
    date_local: dateLocal,
    time_local: timeLocal || null,
    venue_name: venue.name,
    city: venue.city,
    country: venue.country,
    url: link,
    image_url: imageUrl || null,
    genre_hint: null,
    fetched_at: Date.now()
  };
}

function splitIntoCandidateBlocks(html) {
  const chunks = html.split(/<a\s/i);
  const blocks = [];

  for (const chunk of chunks) {
    const block = "<a " + chunk;
    if (block.length < 120) continue;
    blocks.push(block);
  }

  return blocks;
}

function extractTitle(block) {
  const patterns = [
    /title="([^"]+)"/i,
    /aria-label="([^"]+)"/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    /<h3[^>]*>([\s\S]*?)<\/h3>/i,
    /<h4[^>]*>([\s\S]*?)<\/h4>/i,
    /<strong[^>]*>([\s\S]*?)<\/strong>/i
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match) {
      const cleaned = cleanText(stripTags(match[1]));
      if (cleaned) return cleaned;
    }
  }

  return null;
}

function extractDate(text) {
  if (!text) return null;

  const t = cleanText(String(text || "").toLowerCase()).replace(/\s+/g, " ").trim();

  const MONTHS = {
    jan: 0, januari: 0,
    feb: 1, februari: 1,
    mrt: 2, maart: 2, mar: 2,
    apr: 3, april: 3,
    mei: 4, may: 4,
    jun: 5, juni: 5,
    jul: 6, juli: 6,
    aug: 7, augustus: 7,
    sep: 8, sept: 8, september: 8,
    okt: 9, oktober: 9, oct: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  let m = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = t.match(/\b(\d{1,2})-(\d{1,2})-(20\d{2})\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
      return isoDate(y, mo, d);
    }
  }

  m = t.match(/\b(\d{1,2})\s+(jan|januari|feb|februari|mrt|maart|mar|apr|april|mei|may|jun|juni|jul|juli|aug|augustus|sep|sept|september|okt|oktober|oct|nov|november|dec|december)\s+(20\d{2})\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2]];
    const y = Number(m[3]);
    return isoDate(y, mo, d);
  }

  m = t.match(/\b(?:ma|di|wo|do|vr|za|zo|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})\s+(jan|januari|feb|februari|mrt|maart|mar|apr|april|mei|may|jun|juni|jul|juli|aug|augustus|sep|sept|september|okt|oktober|oct|nov|november|dec|december)\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2]];
    return inferYearAndFormat(mo, d);
  }

  m = t.match(/\b(\d{1,2})\s+(jan|januari|feb|februari|mrt|maart|mar|apr|april|mei|may|jun|juni|jul|juli|aug|augustus|sep|sept|september|okt|oktober|oct|nov|november|dec|december)\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2]];
    return inferYearAndFormat(mo, d);
  }

  return null;
}

function extractDateFromUrl(link) {
  if (!link) return null;

  const s = String(link).toLowerCase();

  let m = s.match(/(?:^|\/)(\d{1,2})-(\d{1,2})-(20\d{2})(?:$|[/-])/i);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
      return isoDate(y, mo, d);
    }
  }

  m = s.match(/(?:^|\/)(20\d{2})-(\d{2})-(\d{2})(?:$|[/-])/i);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  return null;
}

function inferYearAndFormat(monthIndex, day) {
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, monthIndex, day);
  const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;

  if (candidate.getTime() < now.getTime() - thirtyDaysMs) {
    year += 1;
  }

  return isoDate(year, monthIndex, day);
}

function isoDate(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function extractTime(block) {
  const m = block.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (!m) return null;
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}

function extractLink(block, baseUrl) {
  const m = block.match(/href="([^"]+)"/i);
  if (!m) return null;

  try {
    return new URL(m[1].trim(), baseUrl).toString();
  } catch {
    return null;
  }
}

function extractImage(block) {
  const patterns = [
    /<img[^>]+src="([^"]+)"/i,
    /<img[^>]+data-src="([^"]+)"/i,
    /<source[^>]+srcset="([^"]+)"/i
  ];

  for (const pattern of patterns) {
    const m = block.match(pattern);
    if (m && m[1]) {
      const value = m[1].split(",")[0].trim().split(" ")[0].trim();
      if (value.startsWith("http")) return value;
    }
  }

  return null;
}

function normalizeArtist(rawTitle) {
  let cleaned = cleanText(rawTitle)
    .replace(/\(.*?\)/g, " ")
    .replace(/\blive\b/gi, " ")
    .replace(/\bconcert\b/gi, " ")
    .replace(/\bshow\b/gi, " ")
    .replace(/^ga naar:\s*/i, "")
    .replace(/^geannuleerd:\s*/i, "")
    .replace(/^cancelled:\s*/i, "")
    .replace(/^canceled:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned
    .split(/\s+\+\s+|\s*&\s*|\s*,\s*|\/| \| /)
    .map((x) => cleanText(x))
    .filter(Boolean)
    .slice(0, 6);

  return {
    main: parts[0] || cleaned,
    all: parts.length ? parts : [cleaned]
  };
}
function looksLikeRealEvent(title, link, venue) {
  const t = cleanText(title).toLowerCase();
  const l = String(link || "").toLowerCase();

  const blockedWords = [
    "agenda",
    "programma",
    "program",
    "tickets",
    "ticket info",
    "nieuws",
    "news",
    "about",
    "contact",
    "vacature",
    "privacy",
    "cookie",
    "huisregels",
    "route",
    "locatie",
    "zaalverhuur",
    "membership",
    "lidmaatschap",
    "vul op zijn minst 3 tekens in.",
    "zoek",
    "search"
  ];

  if (blockedWords.some((word) => t === word || t.includes(word))) return false;
  if (l.includes("/news") || l.includes("/nieuws/") || l.includes("/contact") || l.includes("/over")) return false;
  if (t.length < 2) return false;

  const venueNames = [
    venue.name.toLowerCase(),
    venue.city.toLowerCase(),
    venue.id.toLowerCase()
  ];

  if (venueNames.some((name) => t === name)) return false;

  return true;
}

function looksLikeMusicEvent(title, link) {
  const t = cleanText(title).toLowerCase();
  const l = String(link || "").toLowerCase();

  const blocked = [
    "verkiezing",
    "verkiezings",
    "debat",
    "podcast",
    "workshop",
    "dansworkshop",
    "markt",
    "zing je sterk",
    "taalshow"
  ];

  if (blocked.some((w) => t.includes(w) || l.includes(w))) return false;
  return true;
}

function isBlockedTitle(title) {
  const t = cleanText(title).toLowerCase();
  return (
    !t ||
    t.includes("vul op zijn minst") ||
    t === "zoek" ||
    t === "search" ||
    t === "programma" ||
    t === "agenda" ||
    t === "tickets"
  );
}

function titleFromLink(link) {
  if (!link) return "";

  try {
    const u = new URL(link);
    const slug = u.pathname.split("/").filter(Boolean).pop() || "";
    return slug
      .replace(/-\d+$/, "")
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function titleFromTivoliLink(link) {
  if (!link) return "";

  try {
    const u = new URL(link);
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] || "";

    return slug
      .replace(/-\d{2}-\d{2}-20\d{2}$/i, "")
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function buildSourceId(source, artistMain, dateLocal, link) {
  const linkTail = safeLinkTail(link);
  return `${source}-${slugify(artistMain)}-${dateLocal}-${linkTail}`;
}

function safeLinkTail(link) {
  try {
    const u = new URL(link);
    const tail = u.pathname.split("/").filter(Boolean).pop() || "event";
    return slugify(tail).slice(0, 40) || "event";
  } catch {
    return "event";
  }
}

function dedupeEvents(events) {
  const map = new Map();

  for (const event of events) {
    const key = [
      slugify(event.artists_main || event.title || ""),
      event.date_local || "",
      slugify(event.venue_name || ""),
      slugify(event.city || "")
    ].join("|");

    const existing = map.get(key);
    if (!existing) {
      map.set(key, event);
      continue;
    }

    map.set(key, {
      ...existing,
      image_url: existing.image_url || event.image_url || null,
      time_local: existing.time_local || event.time_local || null,
      raw_title:
        (event.raw_title || "").length > (existing.raw_title || "").length
          ? event.raw_title
          : existing.raw_title,
      artists_all: Array.from(
        new Set([...(existing.artists_all || []), ...(event.artists_all || [])])
      )
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.date_local !== b.date_local) {
      return String(a.date_local).localeCompare(String(b.date_local));
    }
    return String(a.title).localeCompare(String(b.title));
  });
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#039;/gi, "'")
    .replace(/&#038;/gi, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    });
}

function cleanText(str) {
  return decodeHtmlEntities(String(str || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(str) {
  return String(str || "").replace(/<[^>]*>/g, " ");
}