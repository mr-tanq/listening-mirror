// concert-fetch-engine.js
// Listening Mirror — Concert Worker
// Venue fetch + parse engine v1

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
  const blocks = splitIntoCandidateBlocks(html);
  const events = [];

  for (const block of blocks) {
    const rawTitle = extractTitle(block);
    const dateLocal = extractDate(block);
    const link = extractLink(block, venue.url);
    const imageUrl = extractImage(block);
    const timeLocal = extractTime(block);

    if (!rawTitle || !dateLocal || !link) continue;
    if (!looksLikeRealEvent(rawTitle, link, venue)) continue;

    const artistInfo = normalizeArtist(rawTitle);

    events.push({
      source: venue.id,
      source_id: buildSourceId(venue.id, artistInfo.main, dateLocal, link),

      title: artistInfo.main,
      artists_main: artistInfo.main,
      artists_all: artistInfo.all,
      raw_title: rawTitle,

      date_local: dateLocal,
      time_local: timeLocal,

      venue_name: venue.name,
      city: venue.city,
      country: venue.country,

      url: link,
      image_url: imageUrl,

      genre_hint: null,
      fetched_at: Date.now()
    });
  }

  return events;
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
    /<h4[^>]*>([\s\S]*?)<\/h4>/i
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

function extractDate(block) {
  let m = block.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = block.match(
    /\b(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s+(20\d{2})\b/i
  );
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = nlMonth(m[2]);
    const year = m[3];
    return `${year}-${month}-${day}`;
  }

  m = block.match(
    /\b(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(20\d{2})\b/i
  );
  if (m) {
    const day = m[2].padStart(2, "0");
    const month = enMonth(m[3]);
    const year = m[4];
    return `${year}-${month}-${day}`;
  }

  m = block.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(20\d{2})\b/i
  );
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = enMonth(m[2]);
    const year = m[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

function extractTime(block) {
  let m = block.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (!m) return null;

  const hh = String(m[1]).padStart(2, "0");
  const mm = m[2];
  return `${hh}:${mm}`;
}

function extractLink(block, baseUrl) {
  const m = block.match(/href="([^"]+)"/i);
  if (!m) return null;

  const href = m[1].trim();
  if (!href) return null;

  try {
    return new URL(href, baseUrl).toString();
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
  const t = title.toLowerCase();
  const l = link.toLowerCase();

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
    "lidmaatschap"
  ];

  if (blockedWords.some((word) => t === word || t.includes(word))) {
    return false;
  }

  if (l.includes("/news") || l.includes("/contact") || l.includes("/over")) {
    return false;
  }

  if (t.length < 2) return false;

  const venueNames = [
    venue.name.toLowerCase(),
    venue.city.toLowerCase(),
    venue.id.toLowerCase()
  ];

  const isOnlyVenueLabel = venueNames.some((name) => t === name);
  if (isOnlyVenueLabel) return false;

  return true;
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

    map.set(key, mergeEvents(existing, event));
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.date_local !== b.date_local) {
      return String(a.date_local).localeCompare(String(b.date_local));
    }
    return String(a.title).localeCompare(String(b.title));
  });
}

function mergeEvents(a, b) {
  return {
    ...a,
    image_url: a.image_url || b.image_url || null,
    time_local: a.time_local || b.time_local || null,
    raw_title: chooseLonger(a.raw_title, b.raw_title),
    artists_all: uniqueStrings([...(a.artists_all || []), ...(b.artists_all || [])])
  };
}
function chooseLonger(a, b) {
  const aa = a || "";
  const bb = b || "";
  return bb.length > aa.length ? bb : aa;
}

function uniqueStrings(items) {
  return Array.from(
    new Set(
      items
        .map((x) => cleanText(String(x || "")))
        .filter(Boolean)
    )
  );
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(str) {
  return String(str || "").replace(/<[^>]*>/g, " ");
}

function nlMonth(value) {
  const map = {
    jan: "01",
    feb: "02",
    mrt: "03",
    apr: "04",
    mei: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    okt: "10",
    nov: "11",
    dec: "12"
  };

  return map[String(value || "").toLowerCase()] || "01";
}

function enMonth(value) {
  const map = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };

  return map[String(value || "").toLowerCase()] || "01";
}