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