// tivoli-parser.js
// Listening Mirror — TivoliVredenburg Parser (PRODUCTION)

export async function fetchTivoliEvents({ maxEvents = 60 } = {}) {

  const want = Math.max(1, Math.min(300, Number(maxEvents) || 60));

  const rawEvents = [];

  const MAX_PAGES = 12;

  for (let page = 1; page <= MAX_PAGES && rawEvents.length < want * 2; page++) {

    const url = `https://www.tivolivredenburg.nl/agenda/page/${page}/`;

    let html = "";
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "ListeningMirrorBot/1.0",
          "accept-language": "en-US,en;q=0.9,nl;q=0.8"
        }
      });
      html = await res.text();
    } catch {
      continue;
    }

    const parsed = parseAgendaPage(html);

    rawEvents.push(...parsed);

  }

  const uniq = dedupeByUrl(rawEvents);

  const upcoming = uniq.filter(e => e.startTs > Date.now() - 6 * 60 * 60 * 1000);

  const head = upcoming.slice(0, 24);
  const tail = upcoming.slice(24);

  const hydratedHead = await Promise.all(
    head.map(ev => hydrateEvent(ev).catch(() => ev))
  );

  const all = hydratedHead.concat(tail);

  all.sort((a, b) => a.startTs - b.startTs);

  return all.slice(0, want).map(mapToConcertSchema);

}



function parseAgendaPage(html) {

  const out = [];

  const monthMap = {
    jan:0,"jan.":0,
    feb:1,"feb.":1,
    mrt:2,"mrt.":2,
    apr:3,"apr.":3,
    mei:4,
    jun:5,"jun.":5,
    jul:6,"jul.":6,
    aug:7,"aug.":7,
    sep:8,"sep.":8,
    okt:9,"okt.":9,
    nov:10,"nov.":10,
    dec:11,"dec.":11
  };

  const re = /\b(ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+([a-z]{3}\.?)\s+(\d{4})[\s\S]{0,900}?href="(https:\/\/www\.tivolivredenburg\.nl\/agenda\/[^"]+)"[^>]*>\s*([^<]{2,200})\s*<\/a>/gi;

  let m;

  while ((m = re.exec(html))) {

    const day = Number(m[2]);
    const mon = monthMap[String(m[3]).toLowerCase()];
    const year = Number(m[4]);
    const url = m[5];
    const title = clean(m[6]);

    if (mon == null || !url || !title) continue;

    const startTs = new Date(year, mon, day, 19, 0, 0).getTime();

    out.push({
      title,
      url,
      startTs,
      venue: "TivoliVredenburg"
    });

  }

  return out;

}
async function hydrateEvent(ev) {

  const html = await fetch(ev.url).then(r => r.text()).catch(() => "");
  if (!html) return ev;

  let startTs = ev.startTs;

  const ldMatch = html.match(/"startDate"\s*:\s*"([^"]+)"/i);
  if (ldMatch) {
    const d = new Date(ldMatch[1]);
    if (!Number.isNaN(d.getTime())) {
      startTs = d.getTime();
    }
  }

  let title = ev.title;

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = clean(strip(h1[1]));
    if (t.length > 2) title = t;
  }

  let zaal = "";

  const zaalMatch = html.match(/\b(Ronda|Pandora|Cloud Nine|Hertz|Grote Zaal|Kleine Zaal)\b/i);
  if (zaalMatch) zaal = zaalMatch[1];

  let image = null;

  const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image/i);
  if (imgMatch) image = imgMatch[1];

  return {
    ...ev,
    title,
    startTs,
    venue: zaal ? `TivoliVredenburg (${zaal})` : "TivoliVredenburg",
    image
  };

}



function mapToConcertSchema(ev) {

  const d = new Date(ev.startTs);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return {
    source: "tivoli",
    source_id: `tivoli-${slug(ev.title)}-${yyyy}-${mm}-${dd}`,
    title: ev.title,
    artists_main: ev.title,
    artists_all: [ev.title],
    raw_title: ev.title,
    date_local: `${yyyy}-${mm}-${dd}`,
    time_local: `${hh}:${mi}`,
    venue_name: ev.venue,
    city: "Utrecht",
    country: "NL",
    url: ev.url,
    image_url: ev.image || null,
    genre_hint: null,
    fetched_at: Date.now()
  };

}



function dedupeByUrl(arr) {
  const m = new Map();
  for (const e of arr) {
    if (!m.has(e.url)) m.set(e.url, e);
  }
  return Array.from(m.values());
}



function clean(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function strip(s) {
  return String(s || "").replace(/<[^>]+>/g, " ");
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
