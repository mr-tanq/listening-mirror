// concert-fetch-engine.js
// Listening Mirror — Concert Worker
// Venue fetch + parse engine v11
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

  if (venue.id === "tivoli") {
    const events = await fetchTivoliEvents({ maxEvents: 80 });
    return dedupeEvents(events);
  }

  const html = await fetchHtml(venue.url);
  const events = await parseVenueHtml(html, venue);

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

async function parseVenueHtml(html, venue) {
  switch (venue.id) {
    case "paradiso":
      return parseParadiso(html, venue);
    case "doornroosje":
      return parseDoornroosje(html, venue);
    case "patronaat":
      return parsePatronaat(html, venue);
    case "paard":
      return parsePaard(html, venue);
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
    /href="([^"]*(?:\/event\/|\/programma\/|\/agenda\/)[^"]+)"/gi;

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
      !lower.includes("/event/") ||
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

    const rawTitle = titleFromLink(link);
    const dateLocal = extractDate(block) || extractDateFromUrl(link);
    const timeLocal = extractTime(block);
    const imageUrl = extractImage(block);

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

// ---------------- TivoliVredenburg (legacy parser resurrection) ----------------

async function fetchTivoliEvents({ maxEvents = 80, hydrateLimit = 18 } = {}) {
  const want = Math.max(1, Math.min(300, Number(maxEvents) || 80));

  const events = [];
  let pagesFetched = 0;

  const maxPages = 12;

  for (let page = 1; page <= maxPages && events.length < want; page++) {
    const pageUrl = `https://www.tivolivredenburg.nl/agenda/page/${page}/`;
    const html = await fetchText(pageUrl).catch(() => "");
    pagesFetched += 1;
    if (!html) continue;

    const parsed = parseTivoliAgendaHtml(html);

    for (const ev of parsed) {
      if (events.length >= want) break;
      events.push(ev);
    }
  }

  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const upcoming = events.filter((e) => Number(e?.startTs) >= cutoff);

  const uniq = dedupeByUrl(upcoming);

  const toHydrate = uniq.slice(0, Math.max(0, Math.min(50, Number(hydrateLimit) || 0)));
  const rest = uniq.slice(toHydrate.length);

  const hydratedHead = await mapLimit(toHydrate, 6, async (ev) => {
    const full = await tivoliHydrateEvent(ev).catch(() => null);
    return full || ev;
  });

  const hydrated = hydratedHead.concat(rest);
  hydrated.sort((a, b) => a.startTs - b.startTs);

  console.log(`[concert-fetch-engine] tivoli pages=${pagesFetched} raw=${events.length} uniq=${uniq.length} final=${hydrated.length}`);

  return hydrated.slice(0, want).map(mapTivoliToConcertSchema);
}

function parseTivoliAgendaHtml(html) {
  const out = [];

  const monthMap = {
    jan: 0, "jan.": 0,
    feb: 1, "feb.": 1,
    mrt: 2, "mrt.": 2,
    apr: 3, "apr.": 3,
    mei: 4,
    jun: 5, "jun.": 5,
    jul: 6, "jul.": 6,
    aug: 7, "aug.": 7,
    sep: 8, "sep.": 8,
    okt: 9, "okt.": 9,
    nov: 10, "nov.": 10,
    dec: 11, "dec.": 11
  };

  const re =
    /\b(ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+([a-z]{3}\.?)\s+(\d{4})[\s\S]{0,900}?href="(https:\/\/www\.tivolivredenburg\.nl\/agenda\/[^"]+)"[^>]*>\s*([^<]{2,180})\s*<\/a>/gi;

  let m;
  while ((m = re.exec(String(html))) && out.length < 5000) {
    const day = Number(m[2]);
    const monRaw = String(m[3] || "").toLowerCase();
    const year = Number(m[4]);
    const url = String(m[5] || "").trim();
    let title = String(m[6] || "").trim();

    title = cleanText(title).replace(/\s+/g, " ").trim();

    const monthIdx = monthMap[monRaw];
    if (monthIdx == null) continue;
    if (!title || !url) continue;
    if (!looksLikeTivoliMusicCandidate(title, url)) continue;

    const startTs = epochFromAmsterdamLocal(year, monthIdx, day, 20, 0, 0);

    out.push({
      id: `tv:${slugify(title)}:${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      artist: title,
      attractions: [title],
      city: "Utrecht",
      venue: "TivoliVredenburg",
      startTs,
      startLocal: formatAmsterdamLocal(new Date(startTs)),
      url,
      image_url: null
    });
  }

  return out;
      }
async function tivoliHydrateEvent(ev) {
  const url = String(ev?.url || "");
  if (!url.startsWith("https://www.tivolivredenburg.nl/agenda/")) return ev;

  const html = await fetchText(url).catch(() => "");
  if (!html) return ev;

  const jsonLdBlocks = [];
  const reLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = reLd.exec(html))) {
    const raw = String(m[1] || "").trim();
    if (raw) jsonLdBlocks.push(raw);
  }

  let startTs = ev.startTs;
  let startLocal = ev.startLocal;

  for (const blk of jsonLdBlocks) {
    const txt = blk.replace(/\n/g, " ").trim();
    const sm = txt.match(/"startDate"\s*:\s*"([^"]+)"/i);
    if (sm) {
      const iso = String(sm[1] || "").trim();
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        startTs = d.getTime();
        startLocal = formatAmsterdamLocal(new Date(startTs));
        break;
      }
    }
  }

  if (startTs === ev.startTs) {
    const sm2 = html.match(/datetime=["'](\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(?:[+\-]\d{2}:\d{2}|Z))["']/i);
    if (sm2) {
      const iso = String(sm2[1] || "").trim();
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        startTs = d.getTime();
        startLocal = formatAmsterdamLocal(new Date(startTs));
      }
    }
  }

  let title = ev.artist;
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1m) {
    const t = cleanText(stripTags(h1m[1])).replace(/\s+/g, " ").trim();
    if (t && t.length >= 2) title = t;
  }

  let zaal = "";
  const zaalM = html.match(/\b(Zaal|Hall|Room)\b[\s\S]{0,80}?\b(Ronda|Pandora|Cloud Nine|Hertz|Grote Zaal|Kleine Zaal)\b/i);
  if (zaalM) zaal = String(zaalM[2] || "").trim();

  let imageUrl = ev.image_url || null;
  const imgMatch =
    html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*wp-post-image/i);

  if (imgMatch && imgMatch[1]) {
    imageUrl = String(imgMatch[1]).trim();
  }

  return {
    ...ev,
    artist: title,
    attractions: [title],
    venue: zaal ? `TivoliVredenburg (${zaal})` : "TivoliVredenburg",
    startTs,
    startLocal,
    image_url: imageUrl || null
  };
}

function mapTivoliToConcertSchema(ev) {
  const dateLocal = formatDateLocal(ev.startTs);
  const timeLocal = formatTimeLocal(ev.startTs);
  const title = cleanText(ev.artist || "");

  return {
    source: "tivoli",
    source_id: `tivoli-${slugify(title)}-${dateLocal}`,
    title,
    artists_main: title,
    artists_all: Array.isArray(ev.attractions) && ev.attractions.length ? ev.attractions : [title],
    raw_title: title,
    date_local: dateLocal,
    time_local: timeLocal,
    venue_name: ev.venue || "TivoliVredenburg",
    city: "Utrecht",
    country: "NL",
    url: ev.url,
    image_url: ev.image_url || null,
    genre_hint: null,
    fetched_at: Date.now()
  };
}

function looksLikeTivoliMusicCandidate(title, url) {
  const t = cleanText(title).toLowerCase();
  const u = String(url || "").toLowerCase();

  const blocked = [
    "verkiezing",
    "verkiezings",
    "debat",
    "podcast",
    "workshop",
    "dansworkshop",
    "markt",
    "taalshow",
    "zing je sterk",
    "college",
    "lezing"
  ];

  if (blocked.some((w) => t.includes(w) || u.includes(w))) return false;
  return true;
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
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
      return isoDate(y, mo, d);
    }
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
    .replace(/.*?/g, " ")
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
    .
