// src/parsers/parser-013.js

const BASE_URL = "https://www.podiuminfo.nl/podium/4/concerten";
const VENUE_NAME = "013";
const CITY = "Tilburg";
const SOURCE = "013";

function cleanText(str = "") {
  return String(str)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function absoluteUrl(url = "") {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://www.podiuminfo.nl${url}`;
  return `https://www.podiuminfo.nl/${url}`;
}

function parseDutchDate(dateText = "") {
  const months = {
    januari: 0,
    februari: 1,
    maart: 2,
    april: 3,
    mei: 4,
    juni: 5,
    juli: 6,
    augustus: 7,
    september: 8,
    oktober: 9,
    november: 10,
    december: 11
  };

  const cleaned = cleanText(dateText)
    .toLowerCase()
    .replace(/^maandag\s+/i, "")
    .replace(/^dinsdag\s+/i, "")
    .replace(/^woensdag\s+/i, "")
    .replace(/^donderdag\s+/i, "")
    .replace(/^vrijdag\s+/i, "")
    .replace(/^zaterdag\s+/i, "")
    .replace(/^zondag\s+/i, "");

  const match = cleaned.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);

  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2];
  const year = Number(match[3]);
  const month = months[monthName];

  if (month === undefined) return null;

  return new Date(Date.UTC(year, month, day, 19, 0, 0));
}

async function fetchPage(page = 1) {
  const url = `${BASE_URL}/${page}/013/Tilburg/`;

  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) {
    throw new Error(`013 page ${page} failed: ${res.status}`);
  }

  return await res.text();
}

function extractEventsFromHtml(html = "") {
  const events = [];

  const blocks = html.match(/<a[^>]+href="\/concert\/[^"]+"[\s\S]*?<\/a>/gi) || [];

  for (const block of blocks) {
    try {
      const hrefMatch = block.match(/href="([^"]+)"/i);
      const titleMatch =
        block.match(/title="([^"]+)"/i) ||
        block.match(/<img[^>]+alt="([^"]+)"/i);

      const dateMatch = block.match(
        /(\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4})/i
      );

      const artistMatch =
        block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) ||
        block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);

      const href = absoluteUrl(hrefMatch?.[1] || "");
      const rawArtist = cleanText(
        artistMatch?.[1]
          ?.replace(/<[^>]+>/g, "")
          ?.replace(/\s+\|\s+.*/g, "") || titleMatch?.[1] || ""
      );

      const rawDate = cleanText(dateMatch?.[1] || "");
      const parsedDate = parseDutchDate(rawDate);

      if (!rawArtist || !parsedDate) continue;

      const id = [
        SOURCE,
        rawArtist.toLowerCase(),
        parsedDate.getTime()
      ].join("_");

      events.push({
        id,
        artist: rawArtist,
        title: rawArtist,
        venue: VENUE_NAME,
        city: CITY,
        country: "NL",
        source: SOURCE,
        url: href,
        date: parsedDate.toISOString(),
        start: parsedDate.toISOString(),
        startTs: parsedDate.getTime(),
        rawDate
      });
    } catch (err) {
      console.log("013 parser block error", err);
    }
  }

  return events;
}

export async function fetch013Events() {
  const allEvents = [];
  const seen = new Set();

  for (let page = 1; page <= 6; page++) {
    try {
      const html = await fetchPage(page);
      const pageEvents = extractEventsFromHtml(html);

      if (!pageEvents.length) break;

      for (const event of pageEvents) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        allEvents.push(event);
      }
    } catch (err) {
      console.log(`013 parser page ${page} error`, err);
      break;
    }
  }

  return allEvents.sort((a, b) => a.startTs - b.startTs);
}