/* econcerts.js (FULL FILE REPLACE) — PART 1/4
   Listening Mirror — Concerts tab (premium signals layout)

   ✅ Signals mode (LIVE2) + Explore mode (AICON city feed)
   ✅ Announced / Plan / Dismissed
   ✅ Premium sections for Announced:
      - Hero signal
      - Strong Matches
      - Suggested for You
      - Alerts
   ✅ No "All NL" section
   ✅ Suggested includes low-listen artists too
   ✅ Keeps: plan/dismiss, sort, dedupe, AICON refresh
   ✅ Supports image-backed cards via event.imageUrl if available
   ✅ Safe fallback visuals if no image exists
*/

(() => {
  "use strict";

  // ------------------------------------------------------------
  // Basic helpers
  // ------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  function safeStr(v) {
    return String(v || "").trim();
  }

  function lowerKey(v) {
    return safeStr(v).toLowerCase();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function isValidDate(d) {
    return d instanceof Date && !Number.isNaN(d.getTime());
  }

  function parseIsoToDate(s) {
    const t = safeStr(s);
    if (!t) return null;
    const d = new Date(t);
    return isValidDate(d) ? d : null;
  }

  function fetchJson(url) {
    return fetch(url, { method: "GET" }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && (data.error || data.message))
          ? String(data.error || data.message)
          : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (data && data.ok === false) {
        const msg = safeStr(data.error || data.message || "Unknown error");
        throw new Error(msg || "Unknown error");
      }
      return data;
    });
  }

  // ------------------------------------------------------------
  // Formatting helpers
  // ------------------------------------------------------------
  function formatDateTime(d) {
    if (!isValidDate(d)) return "";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const get = (type) => parts.find((p) => p.type === type)?.value || "00";
    const dd = get("day");
    const mm = get("month");
    const yyyy = get("year");
    const hh = get("hour");
    const min = get("minute");
    return `${dd}.${mm}.${yyyy} • ${hh}:${min}`;
  }

  function formatShortDayDate(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(d);
  }

  function formatMonthDay(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      day: "numeric",
      month: "short",
    }).format(d);
  }

  function daysUntil(d) {
    if (!isValidDate(d)) return null;
    const now = Date.now();
    const diff = d.getTime() - now;
    return Math.floor(diff / 86400000);
  }

  // Strict-ish Title Case for artist display
  function titleCaseArtist(input) {
    const s0 = safeStr(input);
    if (!s0) return "";

    const KEEP_UPPER = new Set([
      "DJ","MC","II","III","IV","V","VI","VII","VIII","IX","X",
      "USA","UK","EU","EP","LP","TV","DJ'S","IDM","EDM"
    ]);

    const parts = s0.split(/(\s+|[-–—/&+])/);

    const fixed = parts.map((tok) => {
      if (!tok) return tok;
      if (/^\s+$/.test(tok)) return tok;
      if (/^[-–—/&+]$/.test(tok)) return tok;

      const up = tok.toUpperCase();
      if (KEEP_UPPER.has(up)) return up;

      if (tok.includes(".") && tok === tok.toUpperCase()) return tok;

      const m = tok.match(/^([("'[\{]*)([A-Za-zÀ-ÖØ-öø-ÿ])([\s\S]*)$/u);
      if (!m) return tok;

      const lead = m[1] || "";
      const first = m[2] || "";
      const rest = (m[3] || "").toLowerCase();

      return lead + first.toUpperCase() + rest;
    });

    return fixed.join("");
  }

  // ------------------------------------------------------------
  // Persistent UI store
  // ------------------------------------------------------------
  const STORE_KEY = "lm_econcerts_ui_v20_premium_signals";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return {
          planIds: [],
          dismissedIds: [],
          lastRefreshAt: 0,
          baseApi: "",
          activeTab: "announced",  // announced | plan | dismissed
          sortMode: "date",        // date | city
          mode: "signals",         // signals | explore
          aiconCity: "utrecht",
        };
      }

      const obj = JSON.parse(raw);

      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        baseApi: safeStr(obj.baseApi),
        activeTab: ["announced", "plan", "dismissed"].includes(String(obj.activeTab))
          ? String(obj.activeTab)
          : "announced",
        sortMode: (String(obj.sortMode) === "city" || String(obj.sortMode) === "date")
          ? String(obj.sortMode)
          : "date",
        mode: (String(obj.mode) === "explore" || String(obj.mode) === "signals")
          ? String(obj.mode)
          : "signals",
        aiconCity: safeStr(obj.aiconCity) ? String(obj.aiconCity) : "utrecht",
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        baseApi: "",
        activeTab: "announced",
        sortMode: "date",
        mode: "signals",
        aiconCity: "utrecht",
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();

  // ------------------------------------------------------------
  // API bases
  // ------------------------------------------------------------
  const FALLBACK_LIVE2_BASE = "https://live2.errtanq9.workers.dev";
  const FALLBACK_AICON_BASE = "https://aicon.errtanq9.workers.dev";

  function getLive2Base() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.LIVE2_BASE_API === "string"
      ? w.LIVE2_BASE_API
      : (typeof w.BASE_API === "string" ? w.BASE_API : "");
    const fromStore = safeStr(store?.baseApi || "");
    const base = (fromWindow || fromStore || FALLBACK_LIVE2_BASE).trim();
    return base.replace(/\/+$/, "");
  }

  function getAiconBase() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.AICON_BASE_API === "string" ? w.AICON_BASE_API : "";
    const base = (fromWindow || FALLBACK_AICON_BASE).trim();
    return base.replace(/\/+$/, "");
  }

  // ------------------------------------------------------------
  // Source URLs
  // ------------------------------------------------------------
  const LIVE2_DEFAULTS = {
    size: 400,
    tasteArtists: 2000,
    scoreMin: 1, // very permissive: if user listened even 2x, still allow as suggestion
    reco: false,
  };

  function buildSignalsUrl() {
    const base = getLive2Base();
    const u = new URL(base + "/econcerts");
    u.searchParams.set("size", String(LIVE2_DEFAULTS.size));
    u.searchParams.set("tasteArtists", String(LIVE2_DEFAULTS.tasteArtists));
    u.searchParams.set("scoreMin", String(LIVE2_DEFAULTS.scoreMin));
    return u.toString();
  }

  function buildAiconCityUrl(city) {
    const base = getAiconBase();
    const u = new URL(base + "/events");
    u.searchParams.set("city", String(city || "").trim().toLowerCase());
    return u.toString();
  }

  // ------------------------------------------------------------
  // NL cities for AICON refresh / explore
  // ------------------------------------------------------------
  const NL_CITIES = [
    "amsterdam",
    "utrecht",
    "rotterdam",
    "den haag",
    "eindhoven",
    "tilburg",
    "groningen",
    "nijmegen",
    "haarlem",
    "arnhem",
    "zwolle",
    "breda",
    "leiden",
    "maastricht",
    "enschede",
    "zoetermeer",
    "leeuwarden",
  ];

  function metalAgendaUrlForCity(citySlug) {
    const title = citySlug
      .split(" ")
      .map((p) => p ? (p[0].toUpperCase() + p.slice(1)) : p)
      .join(" ");
    return `https://www.metalagenda.nl/p/${encodeURI(title)}`;
  }
   /* econcerts.js (FULL FILE REPLACE) — PART 2/4 */

  // ------------------------------------------------------------
  // Normalize LIVE2 / AICON events into one shape
  // ------------------------------------------------------------
  function normalizeLive2Event(ev) {
    const id = safeStr(ev?.id);
    const artist = safeStr(ev?.artist);
    const venue = safeStr(ev?.venue);
    const city = safeStr(ev?.city);
    const startTs = Number(ev?.startTs || 0);
    const startIso = safeStr(ev?.start);
    const url = safeStr(ev?.url);

    const start =
      (Number.isFinite(startTs) && startTs > 0) ? new Date(startTs) :
      parseIsoToDate(startIso) ||
      new Date(0);

    if (!id || !artist || !isValidDate(start) || start.getTime() <= 0) return null;

    // Future-ready image fields:
    const imageUrl =
      safeStr(ev?.imageUrl) ||
      safeStr(ev?.artistImage) ||
      safeStr(ev?.spotifyArtistImage) ||
      safeStr(ev?.lastfmArtistImage) ||
      safeStr(ev?.coverUrl) ||
      "";

    return {
      id: `live2:${id}`,
      artist,
      attractions: Array.isArray(ev?.attractions) ? ev.attractions : [],
      city,
      venue,
      start,
      startTs: start.getTime(),
      url,
      plays: Number(ev?.plays || 0) || 0,
      score: Number(ev?.score || 0) || 0,
      star: !!ev?.star,
      matched: safeStr(ev?.matched || ""),
      source: safeStr(ev?.source || "live2"),
      mode: "signals",
      imageUrl,
    };
  }

  function normalizeAiconEvent(ev, fallbackCity) {
    const rawId = safeStr(ev?.id || ev?.key || ev?.uid || "");
    const artist = safeStr(ev?.artist || ev?.title || ev?.name || "");
    const venue = safeStr(ev?.venue || ev?.location || ev?.place || "");
    const city = safeStr(ev?.city || fallbackCity || "");
    const url = safeStr(ev?.url || ev?.link || "");
    const source = safeStr(ev?.source || ev?.provider || "aicon");

    const startTs =
      Number(ev?.startTs || ev?.ts || ev?.time || 0) ||
      (parseIsoToDate(ev?.start || ev?.date || ev?.datetime || "")?.getTime() || 0);

    const start = (startTs > 0) ? new Date(startTs) : null;

    const imageUrl =
      safeStr(ev?.imageUrl) ||
      safeStr(ev?.artistImage) ||
      safeStr(ev?.spotifyArtistImage) ||
      safeStr(ev?.lastfmArtistImage) ||
      safeStr(ev?.coverUrl) ||
      "";

    const idBase = rawId || `${lowerKey(artist)}|${startTs}|${lowerKey(venue)}|${lowerKey(city)}|${lowerKey(source)}`;
    if (!artist || !start || !isValidDate(start) || start.getTime() <= 0) return null;

    return {
      id: `aicon:${idBase}`,
      artist,
      attractions: Array.isArray(ev?.attractions) ? ev.attractions : [],
      city,
      venue,
      start,
      startTs: start.getTime(),
      url,
      plays: Number(ev?.plays || 0) || 0,
      score: Number(ev?.score || 0) || 0,
      star: !!ev?.star,
      matched: safeStr(ev?.matched || ""),
      source,
      mode: "explore",
      imageUrl,
    };
  }

  // ------------------------------------------------------------
  // Dedupe logic
  // ------------------------------------------------------------
  function isVipUrl(url) {
    const u = lowerKey(url);
    return u.includes("vip") || u.includes("package") || u.includes("packages") || u.includes("hospitality") || u.includes("comfort");
  }

  function venueLooksLikeSubRoom(venue) {
    const v = lowerKey(venue);
    return v.includes("club") || v.includes("room") || v.includes("lounge") || v.includes("vinyl") || v.includes("bar");
  }

  function timeBucket(ts) {
    const step = 10 * 60 * 1000;
    return Math.round(ts / step) * step;
  }

  function softKey(ev) {
    const ts = Number(ev.startTs || 0) || (ev.start ? ev.start.getTime() : 0);
    return [lowerKey(ev.artist), String(timeBucket(ts)), lowerKey(ev.city), lowerKey(ev.venue)].join("|");
  }

  function pickBetterEvent(a, b) {
    const aVip = isVipUrl(a.url);
    const bVip = isVipUrl(b.url);
    if (aVip !== bVip) return aVip ? b : a;

    const aSub = venueLooksLikeSubRoom(a.venue);
    const bSub = venueLooksLikeSubRoom(b.venue);
    if (aSub !== bSub) return aSub ? b : a;

    const aMeta = (a.venue ? 1 : 0) + (a.city ? 1 : 0) + (a.attractions?.length ? 1 : 0) + (a.url ? 1 : 0);
    const bMeta = (b.venue ? 1 : 0) + (b.city ? 1 : 0) + (b.attractions?.length ? 1 : 0) + (b.url ? 1 : 0);
    if (aMeta !== bMeta) return bMeta > aMeta ? b : a;

    const aScore = Number(a.score || 0);
    const bScore = Number(b.score || 0);
    if (aScore !== bScore) return bScore > aScore ? b : a;

    return a;
  }

  function dedupeEvents(events) {
    const byId = new Map();
    for (const ev of events) {
      if (!ev || !ev.id) continue;
      if (!byId.has(ev.id)) byId.set(ev.id, ev);
      else byId.set(ev.id, pickBetterEvent(byId.get(ev.id), ev));
    }

    const bySoft = new Map();
    for (const ev of byId.values()) {
      const k = softKey(ev);
      if (!bySoft.has(k)) bySoft.set(k, ev);
      else bySoft.set(k, pickBetterEvent(bySoft.get(k), ev));
    }

    return Array.from(bySoft.values());
  }

  // ------------------------------------------------------------
  // Plan / dismiss actions
  // ------------------------------------------------------------
  const isPlanned = (id) => store.planIds.includes(id);
  const isDismissed = (id) => store.dismissedIds.includes(id);

  async function addToPlan(id) {
    if (!store.planIds.includes(id)) store.planIds.push(id);
    store.dismissedIds = store.dismissedIds.filter((x) => x !== id);
    saveStore(store);
  }

  async function dismiss(id) {
    if (!store.dismissedIds.includes(id)) store.dismissedIds.push(id);
    store.planIds = store.planIds.filter((x) => x !== id);
    saveStore(store);
  }

  async function removeFromPlan(id) {
    store.planIds = store.planIds.filter((x) => x !== id);
    saveStore(store);
  }

  async function undismiss(id) {
    store.dismissedIds = store.dismissedIds.filter((x) => x !== id);
    saveStore(store);
  }

  // ------------------------------------------------------------
  // Matching / premium UI derivation
  // ------------------------------------------------------------
  function getMatchTier(event) {
    if (!event || event.mode !== "signals") return "none";

    const score = Number(event.score || 0);
    const plays = Number(event.plays || 0);
    const matched = safeStr(event.matched);
    const starred = !!event.star;

    if (starred || score >= 82 || plays >= 20) return "strong";
    if (score >= 55 || plays >= 6 || matched) return "suggested";
    if (score > 0 || plays > 0) return "suggested"; // permissive by design
    return "none";
  }

  function getReasonText(event) {
    if (!event) return "";

    const score = Number(event.score || 0);
    const plays = Number(event.plays || 0);
    const matched = safeStr(event.matched);

    if (event.mode === "signals") {
      if (plays >= 20) return "Top artist in your listening";
      if (score >= 82) return "Very strong listening match";
      if (plays >= 8) return `You played this artist ${plays} times`;
      if (matched) return `Matched from your listening: ${matched}`;
      if (plays > 0) return "You played this artist before";
      if (score > 0) return "Detected in your listening radar";
      return "Listening-linked recommendation";
    }

    return "Explore feed from selected city";
  }

  function isStrongMatch(event) {
    return getMatchTier(event) === "strong";
  }

  function isSuggestedMatch(event) {
    return getMatchTier(event) === "suggested";
  }

  function isAlertWorthy(event) {
    if (!event) return false;
    const d = daysUntil(event.start);
    const score = Number(event.score || 0);
    const plays = Number(event.plays || 0);

    if (d !== null && d >= 0 && d <= 21) return true;
    if (score >= 70) return true;
    if (plays >= 10) return true;
    return false;
  }

  function pickHeroEvent(events) {
    if (!Array.isArray(events) || !events.length) return null;

    const ranked = [...events].sort((a, b) => {
      const aStrong = isStrongMatch(a) ? 1 : 0;
      const bStrong = isStrongMatch(b) ? 1 : 0;
      if (aStrong !== bStrong) return bStrong - aStrong;

      const aScore = Number(a.score || 0);
      const bScore = Number(b.score || 0);
      if (aScore !== bScore) return bScore - aScore;

      const aPlays = Number(a.plays || 0);
      const bPlays = Number(b.plays || 0);
      if (aPlays !== bPlays) return bPlays - aPlays;

      return a.startTs - b.startTs;
    });

    return ranked[0] || null;
  }

  function splitVisibleEventsByState(events) {
    const plannedIds = new Set(store.planIds);
    const dismissedIds = new Set(store.dismissedIds);

    const planned = [];
    const dismissed = [];
    const announced = [];

    for (const ev of events) {
      if (dismissedIds.has(ev.id)) {
        dismissed.push(ev);
      } else if (plannedIds.has(ev.id)) {
        planned.push(ev);
      } else {
        announced.push(ev);
      }
    }

    return { announced, planned, dismissed };
  }

  function sortChronoAsc(a, b) {
    return a.start.getTime() - b.start.getTime();
  }

  function sortCityThenTimeAsc(a, b) {
    const ac = lowerKey(a.city);
    const bc = lowerKey(b.city);
    if (ac < bc) return -1;
    if (ac > bc) return 1;
    return a.start.getTime() - b.start.getTime();
  }

  function getSorter() {
    return store.sortMode === "city" ? sortCityThenTimeAsc : sortChronoAsc;
  }

  function filterSuggestedNotStrong(events) {
    return events.filter((ev) => isSuggestedMatch(ev) && !isStrongMatch(ev));
  }

  function filterStrong(events) {
    return events.filter((ev) => isStrongMatch(ev));
  }

  function buildAlerts(events, heroId) {
    return events
      .filter((ev) => ev.id !== heroId)
      .filter((ev) => isAlertWorthy(ev))
      .sort((a, b) => {
        const ad = daysUntil(a.start);
        const bd = daysUntil(b.start);
        const aSoon = ad === null ? 9999 : ad;
        const bSoon = bd === null ? 9999 : bd;
        if (aSoon !== bSoon) return aSoon - bSoon;

        const aScore = Number(a.score || 0);
        const bScore = Number(b.score || 0);
        return bScore - aScore;
      })
      .slice(0, 3);
  }

  function getSignalSummary(strongCount, suggestedCount) {
    if (strongCount > 0 && suggestedCount > 0) {
      return `${strongCount} strong matches, ${suggestedCount} suggestions from your listening`;
    }
    if (strongCount > 0) {
      return `${strongCount} strong matches from your listening`;
    }
    if (suggestedCount > 0) {
      return `${suggestedCount} suggestions from artists you have played`;
    }
    return "No listening-linked concerts detected right now";
}
   /* econcerts.js (FULL FILE REPLACE) — PART 3/4 */

  // ------------------------------------------------------------
  // Visual helpers / CSS injection
  // ------------------------------------------------------------
  function getFallbackVisual(seed) {
    const s = lowerKey(seed);
    let hue = 18;
    if (s) {
      let sum = 0;
      for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
      hue = sum % 360;
    }

    return `
      radial-gradient(circle at 50% 25%, rgba(255,220,170,.28), transparent 28%),
      linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.72)),
      linear-gradient(135deg,
        hsla(${hue}, 65%, 20%, .98),
        hsla(${(hue + 22) % 360}, 58%, 12%, .98) 45%,
        hsla(${(hue + 220) % 360}, 55%, 10%, .98)
      )
    `;
  }

  function buildCoverStyle(event) {
    const img = safeStr(event?.imageUrl);
    if (img) {
      return `
        linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.72)),
        url("${img.replace(/"/g, "%22")}")
      `;
    }
    return getFallbackVisual(event?.artist || event?.id || "concert");
  }

  function injectStylesOnce() {
    if (document.getElementById("lmEconcertsPremiumStyles")) return;

    const style = document.createElement("style");
    style.id = "lmEconcertsPremiumStyles";
    style.textContent = `
      .lmECWrap{
        display:flex;
        flex-direction:column;
        gap:14px;
      }

      .lmECControls{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        align-items:center;
      }

      .lmECSeg{
        display:inline-flex;
        gap:8px;
        padding:6px;
        border-radius:999px;
        background:rgba(255,255,255,.045);
        border:1px solid rgba(255,255,255,.08);
        box-shadow:0 10px 30px rgba(0,0,0,.22);
      }

      .lmECBtn,
      .lmECSelect{
        appearance:none;
        border:none;
        outline:none;
        border-radius:999px;
        padding:10px 14px;
        background:rgba(255,255,255,.055);
        color:inherit;
        font:inherit;
        font-weight:700;
        letter-spacing:.01em;
        border:1px solid rgba(255,255,255,.08);
        cursor:pointer;
        transition:transform .16s ease, background .16s ease, border-color .16s ease, opacity .16s ease;
      }

      .lmECBtn:hover,
      .lmECSelect:hover{
        transform:translateY(-1px);
        background:rgba(255,255,255,.08);
      }

      .lmECBtn.is-on{
        background:linear-gradient(180deg, rgba(187,225,255,.18), rgba(125,175,255,.10));
        border-color:rgba(150,205,255,.22);
        box-shadow:0 10px 24px rgba(35,86,170,.16);
      }

      .lmECSelect{
        min-width:136px;
      }

      .lmECStatus{
        margin-left:auto;
        max-width:100%;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        font-size:.92rem;
        opacity:.78;
      }

      .lmECHero{
        position:relative;
        overflow:hidden;
        border-radius:24px;
        background:
          radial-gradient(circle at 20% 18%, rgba(184,233,255,.20), transparent 20%),
          linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
        border:1px solid rgba(255,255,255,.08);
        box-shadow:0 20px 50px rgba(0,0,0,.30);
        padding:16px;
      }

      .lmECHeroBadge{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:8px 12px;
        border-radius:999px;
        font-size:.84rem;
        font-weight:800;
        letter-spacing:.03em;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.08);
        margin-bottom:10px;
      }

      .lmECHeroTitle{
        font-size:1.06rem;
        font-weight:800;
        margin:0 0 4px;
        line-height:1.25;
      }

      .lmECHeroSub{
        opacity:.84;
        margin:0;
        font-size:.96rem;
      }

      .lmECSection{
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      .lmECSectionHead{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }

      .lmECSectionTitle{
        margin:0;
        font-size:1rem;
        font-weight:900;
        letter-spacing:.01em;
      }

      .lmECSectionMeta{
        font-size:.84rem;
        opacity:.68;
      }

      .lmECGrid{
        display:grid;
        gap:12px;
      }

      .lmECGrid--stack{
        grid-template-columns:1fr;
      }

      .lmECGrid--compact{
        grid-template-columns:1fr;
      }

      .lmECCard{
        position:relative;
        overflow:hidden;
        border-radius:22px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
        box-shadow:0 18px 40px rgba(0,0,0,.26);
      }

      .lmECCard--hero,
      .lmECCard--strong{
        min-height:240px;
      }

      .lmECCover{
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center center;
        transform:scale(1.02);
      }

      .lmECShade{
        position:absolute;
        inset:0;
        background:
          linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.20) 30%, rgba(0,0,0,.74) 100%);
      }

      .lmECBody{
        position:relative;
        z-index:1;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
        min-height:inherit;
        padding:14px;
        gap:10px;
      }

      .lmECBadge{
        display:inline-flex;
        align-items:center;
        gap:7px;
        align-self:flex-start;
        padding:7px 12px;
        border-radius:999px;
        font-size:.78rem;
        font-weight:900;
        letter-spacing:.03em;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(20,20,24,.36);
        backdrop-filter:blur(5px);
      }

      .lmECBadge--strong{
        background:linear-gradient(180deg, rgba(193,65,32,.84), rgba(145,25,16,.76));
      }

      .lmECBadge--suggested{
        background:linear-gradient(180deg, rgba(89,120,188,.80), rgba(52,66,126,.72));
      }

      .lmECBadge--alert{
        background:linear-gradient(180deg, rgba(164,132,37,.84), rgba(105,76,15,.76));
      }

      .lmECTitle{
        font-size:1.65rem;
        font-weight:900;
        line-height:1.02;
        margin:0;
        text-transform:uppercase;
      }

      .lmECMeta{
        margin:0;
        font-size:1rem;
        font-weight:700;
      }

      .lmECSubMeta{
        margin:0;
        opacity:.92;
        font-size:.95rem;
      }

      .lmECReason{
        margin:0;
        opacity:.86;
        font-size:.92rem;
        line-height:1.35;
      }

      .lmECActions{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        align-items:center;
      }

      .lmECActionBtn{
        appearance:none;
        border:none;
        outline:none;
        border-radius:12px;
        padding:10px 12px;
        font:inherit;
        font-weight:800;
        cursor:pointer;
        color:inherit;
        background:rgba(255,255,255,.08);
        border:1px solid rgba(255,255,255,.08);
      }

      .lmECActionBtn--primary{
        background:linear-gradient(180deg, rgba(184,54,39,.94), rgba(149,24,14,.88));
      }

      .lmECMiniList{
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      .lmECMiniCard{
        position:relative;
        overflow:hidden;
        min-height:108px;
        border-radius:18px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
        box-shadow:0 14px 34px rgba(0,0,0,.22);
      }

      .lmECMiniBody{
        position:relative;
        z-index:1;
        display:flex;
        align-items:flex-end;
        justify-content:space-between;
        gap:12px;
        min-height:108px;
        padding:12px;
      }

      .lmECMiniInfo{
        display:flex;
        flex-direction:column;
        gap:6px;
        min-width:0;
      }

      .lmECMiniTitle{
        margin:0;
        font-size:1.35rem;
        font-weight:900;
        line-height:1.04;
        text-transform:uppercase;
      }

      .lmECMiniMeta{
        margin:0;
        font-size:.95rem;
        opacity:.95;
      }

      .lmECMiniReason{
        margin:0;
        font-size:.84rem;
        opacity:.82;
      }

      .lmECEmpty{
        padding:16px 14px;
        border-radius:18px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.06);
        opacity:.78;
      }

      @media (min-width: 860px){
        .lmECGrid--compact{
          grid-template-columns:repeat(2, minmax(0,1fr));
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------
  // DOM bootstrapping
  // ------------------------------------------------------------
  const listEl = $("#econcertsList");
  if (!listEl) return;

  injectStylesOnce();

  const legacyRefreshBtn = $("#econcertsRefresh");
  const legacyGroupBtn = $("#econcertsToggleGroup");
  if (legacyRefreshBtn) legacyRefreshBtn.style.display = "none";
  if (legacyGroupBtn) legacyGroupBtn.style.display = "none";

  let lastEvents = [];
  let lastMeta = null;

  function setEmpty(msg) {
    listEl.innerHTML = `<div class="lmECEmpty">${msg}</div>`;
  }

  // ------------------------------------------------------------
  // Controls rendering
  // ------------------------------------------------------------
  function makeBtn(label, onClick, isOn = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `lmECBtn${isOn ? " is-on" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function buildControls() {
    const wrap = document.createElement("div");
    wrap.className = "lmECControls";

    const modeSeg = document.createElement("div");
    modeSeg.className = "lmECSeg";

    modeSeg.appendChild(makeBtn("Signals", () => {
      store.mode = "signals";
      saveStore(store);
      refresh().catch(() => setEmpty("Failed to refresh."));
    }, store.mode === "signals"));

    modeSeg.appendChild(makeBtn("Explore", () => {
      store.mode = "explore";
      saveStore(store);
      refresh().catch(() => setEmpty("Failed to refresh."));
    }, store.mode === "explore"));

    const stateSeg = document.createElement("div");
    stateSeg.className = "lmECSeg";

    stateSeg.appendChild(makeBtn(`Announced`, () => {
      store.activeTab = "announced";
      saveStore(store);
      render(lastEvents, lastMeta);
    }, store.activeTab === "announced"));

    stateSeg.appendChild(makeBtn(`Plan`, () => {
      store.activeTab = "plan";
      saveStore(store);
      render(lastEvents, lastMeta);
    }, store.activeTab === "plan"));

    stateSeg.appendChild(makeBtn(`Dismissed`, () => {
      store.activeTab = "dismissed";
      saveStore(store);
      render(lastEvents, lastMeta);
    }, store.activeTab === "dismissed"));

    wrap.appendChild(modeSeg);
    wrap.appendChild(stateSeg);

    if (store.mode === "explore") {
      const citySelect = document.createElement("select");
      citySelect.className = "lmECSelect";

      const cities = Array.from(new Set(NL_CITIES.concat([store.aiconCity || "utrecht"])))
        .map((c) => lowerKey(c))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      for (const c of cities) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        if (c === lowerKey(store.aiconCity || "utrecht")) opt.selected = true;
        citySelect.appendChild(opt);
      }

      citySelect.addEventListener("change", () => {
        store.aiconCity = lowerKey(citySelect.value || "utrecht");
        saveStore(store);
        refresh().catch(() => setEmpty("Failed to refresh."));
      });

      wrap.appendChild(citySelect);
    }

    wrap.appendChild(makeBtn(
      store.sortMode === "city" ? "Sort: City" : "Sort: Date",
      () => {
        store.sortMode = store.sortMode === "city" ? "date" : "city";
        saveStore(store);
        render(lastEvents, lastMeta);
      },
      false
    ));

    wrap.appendChild(makeBtn("Refresh NL (AICON)", () => {
      refreshNlInAicon().catch((e) => {
        setEmpty(`AICON refresh failed: ${String(e?.message || e)}`);
      });
    }));

    const status = document.createElement("div");
    status.className = "lmECStatus";
    status.textContent = store.mode === "signals"
      ? "Listening-linked concert radar"
      : `Explore city feed: ${store.aiconCity || "utrecht"}`;
    wrap.appendChild(status);

    return wrap;
       }
   /* econcerts.js (FULL FILE REPLACE) — PART 4/4 */

  // ------------------------------------------------------------
  // Card rendering
  // ------------------------------------------------------------
  function buildActionButtons(event, view) {
    const actions = document.createElement("div");
    actions.className = "lmECActions";

    if (event.url) {
      const btnLink = document.createElement("button");
      btnLink.type = "button";
      btnLink.className = "lmECActionBtn lmECActionBtn--primary";
      btnLink.textContent = "Get Tickets";
      btnLink.addEventListener("click", () => {
        window.open(event.url, "_blank", "noopener,noreferrer");
      });
      actions.appendChild(btnLink);
    }

    if (view === "announced") {
      const btnDismiss = document.createElement("button");
      btnDismiss.type = "button";
      btnDismiss.className = "lmECActionBtn";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnDismiss);

      const btnPlan = document.createElement("button");
      btnPlan.type = "button";
      btnPlan.className = "lmECActionBtn";
      btnPlan.textContent = isPlanned(event.id) ? "Remove from Plan" : "Add to Plan";
      btnPlan.addEventListener("click", async () => {
        if (isPlanned(event.id)) await removeFromPlan(event.id);
        else await addToPlan(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnPlan);
    }

    if (view === "plan") {
      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "lmECActionBtn";
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", async () => {
        await removeFromPlan(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnRemove);

      const btnDismiss = document.createElement("button");
      btnDismiss.type = "button";
      btnDismiss.className = "lmECActionBtn";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnDismiss);
    }

    if (view === "dismissed") {
      const btnPlan = document.createElement("button");
      btnPlan.type = "button";
      btnPlan.className = "lmECActionBtn";
      btnPlan.textContent = isPlanned(event.id) ? "Remove from Plan" : "Add to Plan";
      btnPlan.addEventListener("click", async () => {
        if (isPlanned(event.id)) await removeFromPlan(event.id);
        else await addToPlan(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnPlan);

      const btnUndo = document.createElement("button");
      btnUndo.type = "button";
      btnUndo.className = "lmECActionBtn lmECActionBtn--primary";
      btnUndo.textContent = "Undo Dismiss";
      btnUndo.addEventListener("click", async () => {
        await undismiss(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnUndo);
    }

    return actions;
  }

  function buildLargeCard(event, badgeText, badgeClass, view, isHero = false) {
    const card = document.createElement("div");
    card.className = `lmECCard ${isHero ? "lmECCard--hero" : "lmECCard--strong"}`;
    card.style.minHeight = isHero ? "268px" : "232px";

    const cover = document.createElement("div");
    cover.className = "lmECCover";
    cover.style.backgroundImage = buildCoverStyle(event);

    const shade = document.createElement("div");
    shade.className = "lmECShade";

    const body = document.createElement("div");
    body.className = "lmECBody";

    const badge = document.createElement("div");
    badge.className = `lmECBadge ${badgeClass}`;
    badge.textContent = badgeText;

    const title = document.createElement("h3");
    title.className = "lmECTitle";
    title.textContent = titleCaseArtist(event.artist);

    const meta = document.createElement("p");
    meta.className = "lmECMeta";
    meta.textContent = [safeStr(event.city), safeStr(event.venue)].filter(Boolean).join(" • ");

    const subMeta = document.createElement("p");
    subMeta.className = "lmECSubMeta";
    subMeta.textContent = formatShortDayDate(event.start);

    const reason = document.createElement("p");
    reason.className = "lmECReason";
    reason.textContent = getReasonText(event);

    body.appendChild(badge);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(subMeta);
    body.appendChild(reason);
    body.appendChild(buildActionButtons(event, view));

    card.appendChild(cover);
    card.appendChild(shade);
    card.appendChild(body);

    return card;
  }

  function buildMiniCard(event, badgeText, badgeClass, view) {
    const card = document.createElement("div");
    card.className = "lmECMiniCard";

    const cover = document.createElement("div");
    cover.className = "lmECCover";
    cover.style.backgroundImage = buildCoverStyle(event);

    const shade = document.createElement("div");
    shade.className = "lmECShade";

    const body = document.createElement("div");
    body.className = "lmECMiniBody";

    const info = document.createElement("div");
    info.className = "lmECMiniInfo";

    const badge = document.createElement("div");
    badge.className = `lmECBadge ${badgeClass}`;
    badge.textContent = badgeText;

    const title = document.createElement("h4");
    title.className = "lmECMiniTitle";
    title.textContent = titleCaseArtist(event.artist);

    const meta = document.createElement("p");
    meta.className = "lmECMiniMeta";
    meta.textContent = `${safeStr(event.city)} • ${formatMonthDay(event.start)}`;

    const reason = document.createElement("p");
    reason.className = "lmECMiniReason";
    reason.textContent = getReasonText(event);

    info.appendChild(badge);
    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(reason);

    body.appendChild(info);
    body.appendChild(buildActionButtons(event, view));

    card.appendChild(cover);
    card.appendChild(shade);
    card.appendChild(body);

    return card;
  }

  function buildSection(titleText, metaText, children) {
    const sec = document.createElement("section");
    sec.className = "lmECSection";

    const head = document.createElement("div");
    head.className = "lmECSectionHead";

    const title = document.createElement("h3");
    title.className = "lmECSectionTitle";
    title.textContent = titleText;

    head.appendChild(title);

    if (metaText) {
      const meta = document.createElement("div");
      meta.className = "lmECSectionMeta";
      meta.textContent = metaText;
      head.appendChild(meta);
    }

    sec.appendChild(head);

    const body = document.createElement("div");
    body.className = "lmECGrid lmECGrid--stack";

    for (const child of children) body.appendChild(child);
    sec.appendChild(body);

    return sec;
  }

  function renderAnnounced(events) {
    const wrap = document.createElement("div");
    wrap.className = "lmECWrap";

    const controls = buildControls();
    wrap.appendChild(controls);

    const strong = filterStrong(events).sort(getSorter());
    const suggested = filterSuggestedNotStrong(events).sort(getSorter());
    const hero = pickHeroEvent([...strong, ...suggested]);
    const heroId = hero?.id || "";
    const alerts = buildAlerts(events, heroId);

    const heroBlock = document.createElement("div");
    heroBlock.className = "lmECHero";

    const heroBadge = document.createElement("div");
    heroBadge.className = "lmECHeroBadge";
    heroBadge.textContent = "LIVE SIGNAL DETECTED";

    const heroTitle = document.createElement("h2");
    heroTitle.className = "lmECHeroTitle";
    heroTitle.textContent = getSignalSummary(strong.length, suggested.length);

    const heroSub = document.createElement("p");
    heroSub.className = "lmECHeroSub";
    heroSub.textContent = store.mode === "signals"
      ? "Concert radar based on your real listening footprint."
      : `Explore feed for ${store.aiconCity || "utrecht"}.`;

    heroBlock.appendChild(heroBadge);
    heroBlock.appendChild(heroTitle);
    heroBlock.appendChild(heroSub);
    wrap.appendChild(heroBlock);

    if (hero) {
      wrap.appendChild(buildSection("Featured Signal", "", [
        buildLargeCard(
          hero,
          isStrongMatch(hero) ? "🔥 STRONG MATCH" : "✨ SUGGESTED FOR YOU",
          isStrongMatch(hero) ? "lmECBadge--strong" : "lmECBadge--suggested",
          "announced",
          true
        )
      ]));
    }

    if (strong.length) {
      wrap.appendChild(buildSection("Strong Matches", `${strong.length} found`, strong
        .filter((ev) => ev.id !== heroId)
        .slice(0, 4)
        .map((ev) => buildLargeCard(ev, "🔥 STRONG MATCH", "lmECBadge--strong", "announced"))
      ));
    }

    if (suggested.length) {
      const grid = document.createElement("section");
      grid.className = "lmECSection";

      const head = document.createElement("div");
      head.className = "lmECSectionHead";

      const title = document.createElement("h3");
      title.className = "lmECSectionTitle";
      title.textContent = "Suggested for You";

      const meta = document.createElement("div");
      meta.className = "lmECSectionMeta";
      meta.textContent = `${suggested.length} from artists you have played`;

      head.appendChild(title);
      head.appendChild(meta);
      grid.appendChild(head);

      const body = document.createElement("div");
      body.className = "lmECGrid lmECGrid--compact";

      suggested
        .filter((ev) => ev.id !== heroId)
        .slice(0, 12)
        .forEach((ev) => {
          body.appendChild(buildMiniCard(ev, "✨ SUGGESTED", "lmECBadge--suggested", "announced"));
        });

      grid.appendChild(body);
      wrap.appendChild(grid);
    }

    if (alerts.length) {
      const section = buildSection("Alerts", `${alerts.length} worth checking`, alerts.map((ev) =>
        buildMiniCard(ev, "⚠ ALERT", "lmECBadge--alert", "announced")
      ));
      wrap.appendChild(section);
    }

    if (!hero && !strong.length && !suggested.length) {
      const empty = document.createElement("div");
      empty.className = "lmECEmpty";
      empty.textContent = "No listening-linked concerts found right now.";
      wrap.appendChild(empty);
    }

    listEl.innerHTML = "";
    listEl.appendChild(wrap);
  }

  function renderStateList(events, titleText, view) {
    const wrap = document.createElement("div");
    wrap.className = "lmECWrap";
    wrap.appendChild(buildControls());

    const body = document.createElement("div");
    body.className = "lmECMiniList";

    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "lmECEmpty";
      empty.textContent = "Empty";
      body.appendChild(empty);
    } else {
      events.sort(getSorter()).forEach((ev) => {
        const tier = getMatchTier(ev);
        const badge = tier === "strong"
          ? ["🔥 STRONG MATCH", "lmECBadge--strong"]
          : tier === "suggested"
            ? ["✨ SUGGESTED", "lmECBadge--suggested"]
            : ["🎟 EVENT", "lmECBadge--alert"];
        body.appendChild(buildMiniCard(ev, badge[0], badge[1], view));
      });
    }

    wrap.appendChild(buildSection(titleText, `${events.length} shows`, [body]));
    listEl.innerHTML = "";
    listEl.appendChild(wrap);
  }

  function render(events, meta) {
    lastEvents = Array.isArray(events) ? events : [];
    lastMeta = meta || null;

    const split = splitVisibleEventsByState(lastEvents);
    const active = store.activeTab || "announced";

    if (active === "plan") {
      renderStateList(split.planned, "Saved Shows", "plan");
      return;
    }

    if (active === "dismissed") {
      renderStateList(split.dismissed, "Dismissed Shows", "dismissed");
      return;
    }

    renderAnnounced(split.announced);
  }

  // ------------------------------------------------------------
  // AICON refresh tooling
  // ------------------------------------------------------------
  async function aiconRefreshCity(citySlug) {
    const base = getAiconBase();
    const u = new URL(base + "/refresh");
    u.searchParams.set("source", "metalagenda");
    u.searchParams.set("city", citySlug);
    u.searchParams.set("url", metalAgendaUrlForCity(citySlug));
    return fetchJson(u.toString());
  }

  async function refreshNlInAicon() {
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < NL_CITIES.length; i++) {
      const c = NL_CITIES[i];
      try {
        const r = await aiconRefreshCity(c);
        if (r && r.ok !== false) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }

    await refresh();
    return { ok, fail };
  }

  // ------------------------------------------------------------
  // Main refresh
  // ------------------------------------------------------------
  async function refresh() {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    if (store.mode === "explore") {
      setEmpty(`Refreshing explore feed: ${store.aiconCity}…`);

      const payload = await fetchJson(buildAiconCityUrl(store.aiconCity || "utrecht"));
      const arr = Array.isArray(payload?.events) ? payload.events : (Array.isArray(payload) ? payload : []);
      const mapped = arr.map((ev) => normalizeAiconEvent(ev, store.aiconCity)).filter(Boolean);
      const events = dedupeEvents(mapped);

      render(events, payload?.meta || null);
      return;
    }

    setEmpty("Refreshing listening-linked concert signals…");

    const payload = await fetchJson(buildSignalsUrl());
    const arr = Array.isArray(payload?.events) ? payload.events : [];
    const mapped = arr.map(normalizeLive2Event).filter(Boolean);
    const events = dedupeEvents(mapped);

    render(events, payload?.meta || null);
  }

  // ------------------------------------------------------------
  // Auto-refresh when tab opens
  // ------------------------------------------------------------
  function wireMainTabAutoRefresh() {
    const tabBtn =
      document.querySelector('.tabBtn[data-tab="econcerts"]') ||
      document.querySelector('[data-tab="econcerts"]');

    if (!tabBtn) return;

    tabBtn.addEventListener("click", () => {
      refresh().catch(() => {});
    }, { passive: true });
  }

  wireMainTabAutoRefresh();

  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    get lastMeta() { return lastMeta; },
    forceRefresh() { refresh().catch(() => {}); }
  };

  refresh().catch((e) => {
    setEmpty(`Failed to refresh. ${safeStr(e?.message || "")}`.trim());
  });
})();
