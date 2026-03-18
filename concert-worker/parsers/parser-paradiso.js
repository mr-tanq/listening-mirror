const PODIUMINFO_BASE = "https://www.podiuminfo.nl";

export async function fetchParadisoEvents() {

  const all = [];
  const seen = new Set();

  for (let page = 1; page <= 10; page++) {

    const url =
      `https://www.podiuminfo.nl/podium/2/concerten/${page}/Paradiso/Amsterdam/`;

    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "text/html"
      }
    });

    const html = await res.text();

    const scripts =
      [...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
      )];

    if (!scripts.length) break;

    for (const s of scripts) {

      let json;

      try {
        json = JSON.parse(s[1]);
      } catch {
        continue;
      }

      if (!json || json["@type"] !== "MusicEvent") continue;

      const title = clean(json.name);
      const date_local = parseISODate(json.startDate);

      if (!title || !date_local) continue;

      const venue =
        json?.location?.name || "Paradiso";

      const city =
        json?.location?.address?.addressLocality || "Amsterdam";

      const url =
        json.url ? abs(json.url) : null;

      const image =
        json.image || null;

      const source_id =
        `paradiso-${slug(title)}-${date_local}`;

      if (seen.has(source_id)) continue;
      seen.add(source_id);

      all.push({
        source: "paradiso",
        source_id,
        title,
        artists_main: title,
        artists_all: [title],
        raw_title: title,
        date_local,
        time_local: null,
        venue_name: venue,
        city,
        country: "NL",
        url,
        image_url: image,
        fetched_at: Date.now()
      });

    }

  }

  return all;
}

/* helpers */

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
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

function parseISODate(v) {

  if (!v) return null;

  const d = new Date(v);

  if (isNaN(d)) return null;

  return d.toISOString().slice(0, 10);
}