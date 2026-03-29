const PODIUMINFO_BASE = "https://www.podiuminfo.nl";
const AGENDA_URL = `${PODIUMINFO_BASE}/concertagenda/podium/musicon/`;

export async function fetchMusiconEvents(options = {}) {
  const {
    maxPages = 1,
    retriesPerPage = 2
  } = options;

  const allEvents = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildAgendaUrl(page);
    let html = "";

    for (let attempt = 0; attempt <= retriesPerPage; attempt += 1) {
      try {
        html = await fetchText(url);
        if (html) break;
      } catch {
        // retry
      }
    }

    if (!html) continue;

    const pageEvents = parsePage(html);

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
  if (page <= 1) return AGENDA_URL;
  return `${AGENDA_URL}${page}/`;
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

function parsePage(html) {
  const nowTs = Date.now();
  const pageYear = extractPageYearOptions(html);
  const tableStart = String(html || "").indexOf("DATUM");

  if (tableStart === -1) return [];

  const section = String(html).slice(tableStart);
  const lines = section
    .split(/\r?\n/)
    .map((x) => clean(stripTags(x)))
    .filter(Boolean);

  const events = [];
  let currentDate = null;
  let currentTime = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (isDutchDateLine(line)) {
      currentDate = line;
      currentTime = null;
      continue;
    }

    if (isTimeLine(line)) {
      currentTime = line;
      continue;
    }

    if (!currentDate || !currentTime) continue;
    if (isNoiseLine(line)) continue;

    const title = line;
    const normalized = normalizeRowEvent({
      title,
      dateText: currentDate,
      timeText: currentTime,
      html,
      nowTs,
      pageYear
    });

    if (!normalized) continue;

    events.push(normalized);

    currentTime = null;
  }

  return dedupeEvents(events);
}
function normalizeRowEvent({ title, dateText, timeText, nowTs, pageYear }) {
  const rawTitle = clean(title);
  if (!rawTitle) return null;

  const start = parseDutchAgendaDateTime(dateText, timeText, pageYear);
  if (!start) return null;

  if (start.timestamp < startOfTodayAmsterdam(nowTs)) {
    return null;
  }

  return {
    source: "musicon",
    source_id: buildSourceId({
      title: rawTitle,
      dateLocal: start.date_local,
      venueName: "Musicon"
    }),
    title: rawTitle,
    artists_main: rawTitle,
    artists_all: [rawTitle],
    raw_title: rawTitle,
    date_local: start.date_local,
    time_local: start.time_local,
    venue_name: "Musicon",
    city: "Den Haag",
    country: "NL",
    url: null,
    image_url: null,
    genre_hint: null,
    fetched_at: nowTs
  };
}

function extractPageYearOptions(html) {
  const years = [...String(html || "").matchAll(/>\s*(20\d{2})\s*</g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));

  return years.length ? Math.max(...years) : new Date().getFullYear();
}

function parseDutchAgendaDateTime(dateText, timeText, fallbackYear) {
  const months = {
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

  const m = clean(dateText).match(
    /^(ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)$/i
  );
  if (!m) return null;

  const day = Number(m[2]);
  const month = months[m[3].toLowerCase()];
  const year = Number(fallbackYear) || new Date().getFullYear();

  const tm = clean(timeText).match(/^(\d{2}):(\d{2})$/);
  if (!tm) return null;

  const hour = Number(tm[1]);
  const minute = Number(tm[2]);

  const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+01:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  return {
    timestamp: d.getTime(),
    date_local: `${year}-${pad2(month)}-${pad2(day)}`,
    time_local: `${pad2(hour)}:${pad2(minute)}`
  };
}

function dedupeEvents(events) {
  const out = [];
  const seen = new Set();

  for (const ev of events) {
    const key = ev.source_id || makeNormalizedKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }

  return out;
}

function isDutchDateLine(value) {
  return /^(ma|di|wo|do|vr|za|zo)\s+\d{1,2}\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)$/i.test(clean(value));
}

function isTimeLine(value) {
  return /^\d{2}:\d{2}$/.test(clean(value));
}

function isNoiseLine(value) {
  const v = clean(value).toLowerCase();
  return [
    "datum",
    "naam",
    "podium",
    "plaats",
    "info",
    "musicon",
    "den haag",
    "pagina 1",
    "gratis uitverkocht livestream leden die gaan leden die willen"
  ].includes(v);
}
function startOfTodayAmsterdam(nowTs) {
  const now = new Date(nowTs);
  const todayAmsterdam = formatAmsterdamDate(now);
  const midnightLocal = new Date(`${todayAmsterdam}T00:00:00+01:00`);
  return midnightLocal.getTime() - 2 * 60 * 60 * 1000;
}

function formatAmsterdamDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value || "";
  const m = parts.find((p) => p.type === "month")?.value || "";
  const d = parts.find((p) => p.type === "day")?.value || "";

  return `${y}-${m}-${d}`;
}

function buildSourceId({ title, dateLocal, venueName }) {
  return `musicon-${slugify(title)}-${slugify(venueName)}-${dateLocal}`;
}

function makeNormalizedKey(ev) {
  return [
    ev.date_local || "",
    ev.time_local || "",
    ev.title || "",
    ev.venue_name || ""
  ]
    .map((x) => clean(String(x).toLowerCase()))
    .join("::");
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function clean(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function pad2(n) {
  return String(n).padStart(2, "0");
}