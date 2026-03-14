// venues-engine.js
// Listening Mirror — Venue ingestion engine v1

export const VENUES = [
  {
    id: "tivoli",
    city: "Utrecht",
    country: "NL",
    agendaUrl: "https://www.tivolivredenburg.nl/agenda/"
  },
  {
    id: "013",
    city: "Tilburg",
    country: "NL",
    agendaUrl: "https://www.013.nl/programma"
  },
  {
    id: "paradiso",
    city: "Amsterdam",
    country: "NL",
    agendaUrl: "https://www.paradiso.nl/en/landing/concertagenda-paradiso/2069817"
  },
  {
    id: "melkweg",
    city: "Amsterdam",
    country: "NL",
    agendaUrl: "https://www.melkweg.nl/nl/agenda/"
  }
];

export async function fetchAllVenueEvents() {
  const allEvents = [];

  for (const venue of VENUES) {
    try {
      const html = await fetchHtml(venue.agendaUrl);
      const events = parseGenericAgenda(html, venue);
      allEvents.push(...events);
    } catch (err) {
      console.log("Venue fetch error:", venue.id, err.message);
    }
  }

  return allEvents;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ListeningMirrorConcertBot/1.0"
    }
  });

  if (!res.ok) throw new Error("Fetch failed " + res.status);
  return await res.text();
}

function parseGenericAgenda(html, venue) {
  const results = [];

  // heuristic split on anchor blocks
  const blocks = html.split("<a ");

  for (const block of blocks) {
    const title = extractTitle(block);
    const date = extractDate(block);
    const link = extractLink(block, venue.agendaUrl);
    const image = extractImage(block);

    if (!title || !date || !link) continue;

    const artistInfo = normalizeArtist(title);

    results.push({
      source: venue.id,
      source_id: `${venue.id}-${slugify(artistInfo.main)}-${date}`,

      title: artistInfo.main,
      artists_main: artistInfo.main,
      artists_all: artistInfo.all,
      raw_title: title,

      date_local: date,
      time_local: null,

      venue_name: venue.id,
      city: venue.city,
      country: venue.country,

      url: link,
      image_url: image,

      genre_hint: null,
      fetched_at: Date.now()
    });
  }

  return results;
}

function extractTitle(block) {
  let m = block.match(/title="([^"]+)"/i);
  if (m) return cleanText(m[1]);

  m = block.match(/<h\d[^>]*>(.*?)<\/h\d>/i);
  if (m) return cleanText(stripTags(m[1]));

  return null;
}

function extractDate(block) {
  // ISO format
  let m = block.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];

  // NL format
  m = block.match(
    /(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s+(\d{4})/i
  );

  if (m) {
    const day = m[1].padStart(2, "0");
    const month = nlMonth(m[2]);
    return `${m[3]}-${month}-${day}`;
  }

  return null;
}

function extractLink(block, base) {
  const m = block.match(/href="([^"]+)"/i);
  if (!m) return null;

  let href = m[1];

  if (href.startsWith("http")) return href;

  if (href.startsWith("/")) {
    const u = new URL(base);
    return `${u.origin}${href}`;
  }

  return null;
}

function extractImage(block) {
  const m = block.match(/img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

function normalizeArtist(title) {
  let cleaned = title
    .replace(/\(.*?\)/g, "")
    .replace(/live/gi, "")
    .trim();

  const parts = cleaned
    .split(/\+|,|&/)
    .map((s) => cleanText(s))
    .filter(Boolean);

  return {
    main: parts[0] || cleaned,
    all: parts.length ? parts : [cleaned]
  };
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(str) {
  return str
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripTags(str) {
  return str.replace(/<[^>]*>/g, "");
}

function nlMonth(m) {
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

  return map[m.toLowerCase()] || "01";
}
