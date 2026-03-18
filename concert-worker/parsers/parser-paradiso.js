const PODIUMINFO_BASE = "https://www.podiuminfo.nl";
const PARADISO_VENUE_ID = 2;

export async function fetchParadisoEvents() {

  const all = [];
  const seen = new Set();
  const now = Date.now();

  for (let page = 1; page <= 10; page++) {

    const url = `${PODIUMINFO_BASE}/podium/${PARADISO_VENUE_ID}/concerten/${page}/Paradiso/Amsterdam/`;

    const res = await fetch(url);
    const html = await res.text();

    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

    if (!rows.length) break;

    for (const r of rows) {

      const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(x => clean(x[1]));

      if (tds.length < 4) continue;

      const dateToken = tds[0].toLowerCase();
      const time = extractTime(tds[1]);
      const artist = clean(stripTags(tds[2]));
      const venue = normalizeVenue(tds[3]);

      const hrefMatch = r[1].match(/href="([^"]+)"/i);
      const url = hrefMatch ? abs(hrefMatch[1]) : null;

      const date_local = parseDate(dateToken);
      if (!date_local) continue;

      const source_id =
        `paradiso-${slug(artist)}-${date_local}-${slug(venue)}`;

      if (seen.has(source_id)) continue;
      seen.add(source_id);

      all.push({
        source: "paradiso",
        source_id,
        title: artist,
        artists_main: artist,
        artists_all: [artist],
        raw_title: artist,
        date_local,
        time_local: time,
        venue_name: venue,
        city: "Amsterdam",
        country: "NL",
        url,
        image_url: null,
        fetched_at: now
      });

    }

  }

  return all;
}

/* helpers */

function clean(v) {
  return String(v || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(v) {
  return String(v || "").replace(/<[^>]+>/g, "");
}

function extractTime(v) {
  const m = String(v).match(/\d{1,2}:\d{2}/);
  return m ? m[0] : null;
}

function abs(u) {
  if (!u) return null;
  if (u.startsWith("http")) return u;
  return PODIUMINFO_BASE + u;
}

function slug(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeVenue(v) {

  const t = clean(v).toLowerCase();

  if (t.includes("bovenzaal")) return "Paradiso - Bovenzaal";
  if (t.includes("grote zaal")) return "Paradiso - Grote Zaal";
  if (t.includes("kelder")) return "Paradiso - Kelder";
  if (t.includes("parallel")) return "Parallel";
  if (t.includes("bitterzoet")) return "Bitterzoet";
  if (t.includes("tolhuistuin")) return "Tolhuistuin";

  return clean(v);
}

function parseDate(token) {

  const m = token.match(/(ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+([a-z]+)/i);
  if (!m) return null;

  const day = Number(m[2]);
  const month = mapMonth(m[3]);

  if (!month) return null;

  const year = new Date().getUTCFullYear();

  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function mapMonth(m) {

  const map = {
    jan:1,feb:2,mrt:3,apr:4,mei:5,jun:6,
    jul:7,aug:8,sep:9,okt:10,nov:11,dec:12
  };

  return map[m];
}