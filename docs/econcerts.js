/* econcerts.js (FULL FILE REPLACE)
   Listening Mirror — Concerts tab (signals-only, mockup-style)

   ✅ Signals-only UI
   ✅ Auto-refresh on Concerts tab open
   ✅ Mockup-style sections:
      - Concerts You Should Not Miss
      - Live Signal Detected
      - This Week
      - Upcoming Shows
      - Concert Alert
   ✅ Last.fm artist artwork via window.LASTFM_API_KEY
   ✅ Artist lookup cleanup:
      "Villagers of Ioannina City / My Diligence" -> "Villagers of Ioannina City"
   ✅ Rejects obvious Last.fm placeholder/default images
   ✅ Smart same-band same-day dedupe:
      keeps only one event when same band same day appears twice
*/

(() => {
  "use strict";

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  function safeStr(v) {
    return String(v || "").trim();
  }

  function lowerKey(v) {
    return safeStr(v).toLowerCase();
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

  async function fetchJson(url, init = undefined) {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = safeStr(data?.error || data?.message || `HTTP ${res.status}`);
      throw new Error(msg);
    }
    if (data && data.ok === false) {
      const msg = safeStr(data?.error || data?.message || "Unknown error");
      throw new Error(msg);
    }
    return data;
  }

  function titleCaseArtist(input) {
    const s0 = safeStr(input);
    if (!s0) return "";

    const KEEP_UPPER = new Set([
      "DJ","MC","II","III","IV","V","VI","VII","VIII","IX","X",
      "USA","UK","EU","EP","LP","TV","DJ'S","IDM","EDM","V.I.C."
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
    return Math.floor((d.getTime() - Date.now()) / 86400000);
  }

  function getDateKeyLocal(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  // ------------------------------------------------------------
  // Store
  // ------------------------------------------------------------
  const STORE_KEY = "lm_econcerts_ui_v40_signals_mockup_dedupe";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return {
          planIds: [],
          dismissedIds: [],
          lastRefreshAt: 0,
          baseApi: "",
          activeTab: "announced", // announced | plan | dismissed
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
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        baseApi: "",
        activeTab: "announced",
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();

  // ------------------------------------------------------------
  // API
  // ------------------------------------------------------------
  const FALLBACK_LIVE2_BASE = "https://live2.errtanq9.workers.dev";

  function getLive2Base() {
    const w = typeof window !== "undefined" ? window : {};
    const fromWindow = typeof w.LIVE2_BASE_API === "string"
      ? w.LIVE2_BASE_API
      : (typeof w.BASE_API === "string" ? w.BASE_API : "");
    const fromStore = safeStr(store?.baseApi || "");
    return (fromWindow || fromStore || FALLBACK_LIVE2_BASE).replace(/\/+$/, "");
  }

  const LIVE2_DEFAULTS = {
    size: 400,
    tasteArtists: 2000,
    scoreMin: 1,
    reco: false,
  };

  function buildSignalsUrl() {
    const u = new URL(getLive2Base() + "/econcerts");
    u.searchParams.set("size", String(LIVE2_DEFAULTS.size));
    u.searchParams.set("tasteArtists", String(LIVE2_DEFAULTS.tasteArtists));
    u.searchParams.set("scoreMin", String(LIVE2_DEFAULTS.scoreMin));
    return u.toString();
  }

  // ------------------------------------------------------------
  // Normalize
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
      imageUrl,
    };
  }

  // ------------------------------------------------------------
  // Artist normalization for images + dedupe
  // ------------------------------------------------------------
  function normalizeArtistForLookup(raw) {
    let s = safeStr(raw);
    if (!s) return "";

    s = s.replace(/\s+/g, " ").trim();

    const splitters = [
      /\s+\/\s+/i,
      /\s+\+\s+/i,
      /\s+&\s+/i,
      /\s+w\/\s+/i,
      /\s+with\s+/i,
      /\s+feat\.?\s+/i,
      /\s+ft\.?\s+/i,
      /\s*,\s*/i,
    ];

    for (const re of splitters) {
      if (re.test(s)) {
        s = s.split(re)[0];
        break;
      }
    }

    s = s.replace(/\s+\(.*?\)\s*$/g, "").trim();
    s = s.replace(/\s+\[.*?\]\s*$/g, "").trim();
    return s;
  }

  function normalizeArtistForDedupe(raw) {
    return lowerKey(normalizeArtistForLookup(raw))
      .replace(/\bthe\b/g, "")
      .replace(/[^a-z0-9à-öø-ÿ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeVenueName(raw) {
    const v = lowerKey(raw)
      .replace(/[^a-z0-9à-öø-ÿ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!v) return "";

    if (v.includes("tivolivredenburg")) return "tivolivredenburg";
    if (v === "tivoli") return "tivolivredenburg";
    if (v.includes("de helling")) return "de helling";
    if (v.includes("patronaat")) return "patronaat";
    if (v.includes("paradiso")) return "paradiso";
    if (v.includes("melkweg")) return "melkweg";
    if (v.includes("paard")) return "paard";

    return v;
  }

  function normalizeCityName(raw) {
    const c = lowerKey(raw)
      .replace(/[^a-z0-9à-öø-ÿ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!c) return "";
    if (c === "den haag" || c === "the hague") return "den haag";
    return c;
  }

  function sameDaySameBandKey(ev) {
    return `${normalizeArtistForDedupe(ev.artist)}|${getDateKeyLocal(ev.start)}`;
  }

  function getPreferredVenueScore(ev) {
    const venue = normalizeVenueName(ev.venue);
    const city = normalizeCityName(ev.city);
    let score = 0;

    if (ev.url) score += 4;
    if (ev.venue) score += 3;
    if (ev.city) score += 2;
    if (Array.isArray(ev.attractions) && ev.attractions.length) score += 1;
    if (Number(ev.score || 0) > 0) score += 1;
    if (Number(ev.plays || 0) > 0) score += 1;

    if (venue === "tivolivredenburg") score += 4;
    if (venue === "patronaat") score += 3;
    if (venue === "paradiso") score += 3;
    if (venue === "melkweg") score += 3;
    if (venue === "paard") score += 3;

    if (city === "utrecht") score += 1;
    if (city === "amsterdam") score += 1;
    if (city === "den haag") score += 1;

    return score;
  }

  function areLikelyDuplicateShows(a, b) {
    if (sameDaySameBandKey(a) !== sameDaySameBandKey(b)) return false;

    const venueA = normalizeVenueName(a.venue);
    const venueB = normalizeVenueName(b.venue);
    const cityA = normalizeCityName(a.city);
    const cityB = normalizeCityName(b.city);

    if (venueA && venueB && venueA === venueB) return true;
    if (cityA && cityB && cityA === cityB) return true;

    // Known same-show confusion examples / venue-family heuristics
    const tivoliFamily = new Set(["tivolivredenburg", "de helling"]);
    if (tivoliFamily.has(venueA) && tivoliFamily.has(venueB) && cityA === "utrecht" && cityB === "utrecht") {
      return true;
    }

    // Same band same day in two different NL cities is suspicious enough for source noise.
    // Prefer keeping the better metadata one.
    if (cityA && cityB && cityA !== cityB) return true;

    return false;
  }

  function pickBetterDuplicate(a, b) {
    const aScore = getPreferredVenueScore(a);
    const bScore = getPreferredVenueScore(b);
    if (aScore !== bScore) return bScore > aScore ? b : a;

    const aVenueLen = safeStr(a.venue).length;
    const bVenueLen = safeStr(b.venue).length;
    if (aVenueLen !== bVenueLen) return bVenueLen > aVenueLen ? b : a;

    const aUrlLen = safeStr(a.url).length;
    const bUrlLen = safeStr(b.url).length;
    if (aUrlLen !== bUrlLen) return bUrlLen > aUrlLen ? b : a;

    return Number(b.score || 0) > Number(a.score || 0) ? b : a;
  }

  // ------------------------------------------------------------
  // Base dedupe + smart same-band same-day collapse
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
    return [normalizeArtistForDedupe(ev.artist), String(timeBucket(ts)), normalizeCityName(ev.city), normalizeVenueName(ev.venue)].join("|");
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
    // pass 1: exact-ish
    const byId = new Map();
    for (const ev of events) {
      if (!ev || !ev.id) continue;
      if (!byId.has(ev.id)) byId.set(ev.id, ev);
      else byId.set(ev.id, pickBetterEvent(byId.get(ev.id), ev));
    }

    // pass 2: soft
    const bySoft = new Map();
    for (const ev of byId.values()) {
      const k = softKey(ev);
      if (!bySoft.has(k)) bySoft.set(k, ev);
      else bySoft.set(k, pickBetterEvent(bySoft.get(k), ev));
    }

    // pass 3: same-band same-day smart collapse
    const result = [];
    const groups = new Map();

    for (const ev of bySoft.values()) {
      const k = sameDaySameBandKey(ev);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(ev);
    }

    for (const group of groups.values()) {
      if (group.length === 1) {
        result.push(group[0]);
        continue;
      }

      let kept = group[0];
      for (let i = 1; i < group.length; i++) {
        const cur = group[i];
        if (areLikelyDuplicateShows(kept, cur)) {
          kept = pickBetterDuplicate(kept, cur);
        } else {
          // rare case: truly different same-day festivals/sets
          result.push(cur);
        }
      }
      result.push(kept);
    }

    return result;
  }

  // ------------------------------------------------------------
  // State actions
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
  // Matching buckets
  // ------------------------------------------------------------
  function getMatchTier(event) {
    const score = Number(event?.score || 0);
    const plays = Number(event?.plays || 0);
    const matched = safeStr(event?.matched);
    const starred = !!event?.star;

    if (starred || score >= 82 || plays >= 20) return "strong";
    if (score >= 55 || plays >= 2 || matched) return "suggested";
    if (score > 0 || plays > 0) return "suggested";
    return "none";
  }

  function getReasonText(event) {
    if (!event) return "";
    const score = Number(event.score || 0);
    const plays = Number(event.plays || 0);
    const matched = safeStr(event.matched);

    if (plays >= 20) return "Top artist in your listening";
    if (score >= 82) return "Very strong listening match";
    if (plays >= 8) return `You played this artist ${plays} times`;
    if (matched) return `Matched from your listening: ${matched}`;
    if (plays > 0) return "You played this artist before";
    return "Listening-linked recommendation";
  }

  function isStrongMatch(event) {
    return getMatchTier(event) === "strong";
  }

  function isSuggestedMatch(event) {
    return getMatchTier(event) === "suggested";
  }

  function sortChronoAsc(a, b) {
    return a.start.getTime() - b.start.getTime();
  }

  function splitVisibleEventsByState(events) {
    const plannedIds = new Set(store.planIds);
    const dismissedIds = new Set(store.dismissedIds);

    const announced = [];
    const planned = [];
    const dismissed = [];

    for (const ev of events) {
      if (dismissedIds.has(ev.id)) dismissed.push(ev);
      else if (plannedIds.has(ev.id)) planned.push(ev);
      else announced.push(ev);
    }

    announced.sort(sortChronoAsc);
    planned.sort(sortChronoAsc);
    dismissed.sort(sortChronoAsc);

    return { announced, planned, dismissed };
  }

  function getStrong(events) {
    return events.filter(isStrongMatch);
  }

  function getSuggested(events) {
    return events.filter((ev) => isSuggestedMatch(ev) && !isStrongMatch(ev));
  }

  function getAlertEvent(events) {
    const candidates = events
      .filter((ev) => {
        const d = daysUntil(ev.start);
        return d !== null && d >= 0 && d <= 45;
      })
      .sort((a, b) => {
        const ad = daysUntil(a.start) ?? 9999;
        const bd = daysUntil(b.start) ?? 9999;
        if (ad !== bd) return ad - bd;
        return Number(b.score || 0) - Number(a.score || 0);
      });

    return candidates[0] || null;
  }

  function getHeroEvent(events) {
    const ranked = [...events].sort((a, b) => {
      const as = isStrongMatch(a) ? 1 : 0;
      const bs = isStrongMatch(b) ? 1 : 0;
      if (as !== bs) return bs - as;

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

  // ------------------------------------------------------------
  // Last.fm artist artwork
  // ------------------------------------------------------------
  const artistImageCache = new Map();

  function getLastfmApiKey() {
    const w = typeof window !== "undefined" ? window : {};
    return safeStr(w.LASTFM_API_KEY);
  }

  function isBadLastfmImage(url) {
    const u = lowerKey(url);
    if (!u) return true;
    return (
      u.includes("/2a96cbd8b46e442fc41c2b86b821562f") ||
      u.includes("noimage") ||
      u.includes("default") ||
      u.includes("placeholder") ||
      u.includes("/4128a6eb29f94943c9d206c08e625904") ||
      u.endsWith(".gif")
    );
  }

  async function resolveLastfmArtistImage(artistRaw) {
    const apiKey = getLastfmApiKey();
    const artist = normalizeArtistForLookup(artistRaw);
    if (!apiKey || !artist) return "";

    const cacheKey = lowerKey(artist);
    if (artistImageCache.has(cacheKey)) return artistImageCache.get(cacheKey) || "";

    try {
      const u = new URL("https://ws.audioscrobbler.com/2.0/");
      u.searchParams.set("method", "artist.getinfo");
      u.searchParams.set("artist", artist);
      u.searchParams.set("api_key", apiKey);
      u.searchParams.set("format", "json");

      const data = await fetchJson(u.toString());
      const imgs = Array.isArray(data?.artist?.image) ? data.artist.image : [];

      const chosen =
        imgs.find((x) => safeStr(x?.size) === "extralarge")?.["#text"] ||
        imgs.find((x) => safeStr(x?.size) === "large")?.["#text"] ||
        imgs.find((x) => safeStr(x?.size) === "medium")?.["#text"] ||
        "";

      const finalUrl = isBadLastfmImage(chosen) ? "" : safeStr(chosen);
      artistImageCache.set(cacheKey, finalUrl);
      return finalUrl;
    } catch {
      artistImageCache.set(cacheKey, "");
      return "";
    }
  }

  async function enrichEventsWithImages(events) {
    const out = await Promise.all(events.map(async (ev) => {
      if (safeStr(ev.imageUrl)) return ev;
      const imageUrl = await resolveLastfmArtistImage(ev.artist);
      return { ...ev, imageUrl: imageUrl || "" };
    }));
    return out;
  }

  // ------------------------------------------------------------
  // UI styles
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
      radial-gradient(circle at 50% 22%, rgba(255,220,170,.22), transparent 22%),
      linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.68)),
      linear-gradient(135deg,
        hsla(${hue}, 64%, 18%, .98),
        hsla(${(hue + 18) % 360}, 60%, 12%, .98) 44%,
        hsla(${(hue + 220) % 360}, 58%, 10%, .98)
      )
    `;
  }

  function buildCoverStyle(event) {
    const img = safeStr(event?.imageUrl);
    if (img) {
      return `
        linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.62)),
        url("${img.replace(/"/g, "%22")}")
      `;
    }
    return getFallbackVisual(event?.artist || event?.id || "concert");
  }

  function injectStylesOnce() {
    if (document.getElementById("lmConcertsMockupStyles")) return;

    const style = document.createElement("style");
    style.id = "lmConcertsMockupStyles";
    style.textContent = `
      #econcertsList{ display:block; }

      .lmc-wrap{
        display:flex;
        flex-direction:column;
        gap:16px;
      }

      .lmc-topbar{
        display:flex;
        flex-direction:column;
        gap:10px;
        margin-bottom:2px;
      }

      .lmc-heading{
        margin:0;
        font-size:1.12rem;
        font-weight:900;
        letter-spacing:.01em;
        color:rgba(255,255,255,.98);
      }

      .lmc-pills{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
      }

      .lmc-pill-btn{
        appearance:none;
        border:none;
        outline:none;
        border-radius:999px;
        padding:9px 13px;
        background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.08);
        color:inherit;
        font:inherit;
        font-weight:800;
        cursor:pointer;
      }

      .lmc-pill-btn.is-on{
        background:linear-gradient(180deg, rgba(187,225,255,.16), rgba(125,175,255,.10));
        border-color:rgba(150,205,255,.22);
      }

      .lmc-signal{
        border-radius:22px;
        padding:14px 16px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 18% 18%, rgba(106,181,255,.22), transparent 18%),
          linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.03));
        box-shadow:0 18px 38px rgba(0,0,0,.24);
      }

      .lmc-signal-badge{
        display:inline-flex;
        align-items:center;
        gap:8px;
        border-radius:999px;
        padding:7px 11px;
        font-size:.82rem;
        font-weight:900;
        letter-spacing:.03em;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.08);
        margin-bottom:8px;
      }

      .lmc-signal-text{
        font-size:.98rem;
        line-height:1.35;
        color:rgba(255,255,255,.92);
      }

      .lmc-section{
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      .lmc-section-title{
        margin:0;
        font-size:1.02rem;
        font-weight:900;
      }

      .lmc-hero,
      .lmc-strong{
        position:relative;
        overflow:hidden;
        border-radius:24px;
        min-height:218px;
        border:1px solid rgba(255,255,255,.09);
        box-shadow:0 18px 42px rgba(0,0,0,.28);
      }

      .lmc-hero{ min-height:250px; }

      .lmc-cover{
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center center;
        transform:scale(1.02);
      }

      .lmc-cover::after{
        content:"";
        position:absolute;
        inset:0;
        background:
          linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.18) 34%, rgba(0,0,0,.72) 100%);
      }

      .lmc-body{
        position:relative;
        z-index:1;
        min-height:inherit;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
        gap:9px;
        padding:14px;
      }

      .lmc-badge{
        align-self:flex-start;
        display:inline-flex;
        align-items:center;
        gap:7px;
        padding:7px 12px;
        border-radius:999px;
        font-size:.79rem;
        font-weight:900;
        letter-spacing:.03em;
        background:linear-gradient(180deg, rgba(195,72,35,.92), rgba(147,27,18,.82));
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 8px 20px rgba(110,20,12,.20);
      }

      .lmc-title{
        margin:0;
        font-size:1.82rem;
        line-height:1.02;
        font-weight:900;
        text-transform:uppercase;
      }

      .lmc-meta{
        margin:0;
        font-size:1rem;
        font-weight:700;
      }

      .lmc-submeta{
        margin:0;
        font-size:.96rem;
        opacity:.96;
      }

      .lmc-reason{
        margin:0;
        font-size:.92rem;
        opacity:.88;
      }

      .lmc-actions{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-top:2px;
      }

      .lmc-btn{
        appearance:none;
        border:none;
        outline:none;
        border-radius:12px;
        padding:10px 13px;
        font:inherit;
        font-weight:800;
        color:inherit;
        cursor:pointer;
        background:rgba(255,255,255,.09);
        border:1px solid rgba(255,255,255,.08);
      }

      .lmc-btn--primary{
        background:linear-gradient(180deg, rgba(191,57,39,.96), rgba(149,24,14,.88));
      }

      .lmc-upcoming-shell{
        border-radius:22px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.03));
        box-shadow:0 16px 34px rgba(0,0,0,.22);
        overflow:hidden;
      }

      .lmc-upcoming-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:14px 14px 10px;
        border-bottom:1px solid rgba(255,255,255,.05);
      }

      .lmc-upcoming-title{
        margin:0;
        font-size:1rem;
        font-weight:900;
      }

      .lmc-chevron{
        opacity:.7;
        font-weight:900;
      }

      .lmc-mini-list{
        display:flex;
        flex-direction:column;
        gap:10px;
        padding:12px;
      }

      .lmc-mini-card{
        position:relative;
        overflow:hidden;
        min-height:96px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.08);
        box-shadow:0 12px 26px rgba(0,0,0,.20);
      }

      .lmc-mini-body{
        position:relative;
        z-index:1;
        min-height:96px;
        display:flex;
        align-items:flex-end;
        justify-content:space-between;
        gap:12px;
        padding:12px;
      }

      .lmc-mini-info{
        min-width:0;
        display:flex;
        flex-direction:column;
        gap:4px;
      }

      .lmc-mini-title{
        margin:0;
        font-size:1.38rem;
        line-height:1.04;
        font-weight:900;
        text-transform:uppercase;
      }

      .lmc-mini-meta{
        margin:0;
        font-size:.95rem;
        opacity:.96;
      }

      .lmc-mini-right{
        display:flex;
        align-items:center;
        gap:8px;
      }

      .lmc-alert{
        border-radius:22px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.03));
        box-shadow:0 16px 34px rgba(0,0,0,.22);
        overflow:hidden;
      }

      .lmc-alert-top{
        display:flex;
        align-items:center;
        gap:9px;
        padding:12px 14px 8px;
        font-size:.88rem;
        font-weight:900;
        letter-spacing:.03em;
      }

      .lmc-alert-body{
        padding:0 14px 14px;
      }

      .lmc-alert-band{
        font-size:1.18rem;
        font-weight:900;
        margin:0 0 6px;
      }

      .lmc-alert-text{
        margin:0 0 10px;
        color:rgba(255,255,255,.90);
      }

      .lmc-alert-dates{
        margin:0 0 12px;
        color:rgba(255,255,255,.85);
        line-height:1.55;
      }

      .lmc-empty{
        padding:16px 14px;
        border-radius:18px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.06);
        color:rgba(255,255,255,.74);
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------
  // DOM + render
  // ------------------------------------------------------------
  const listEl = $("#econcertsList");
  if (!listEl) return;

  injectStylesOnce();

  let lastEvents = [];
  let lastMeta = null;

  function setEmpty(msg) {
    listEl.innerHTML = `<div class="lmc-empty">${msg}</div>`;
  }

  function makeTopPill(label, tabKey) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `lmc-pill-btn${store.activeTab === tabKey ? " is-on" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      store.activeTab = tabKey;
      saveStore(store);
      render(lastEvents, lastMeta);
    });
    return btn;
  }

  function buildActionButtons(event, view) {
    const actions = document.createElement("div");
    actions.className = "lmc-actions";

    if (event.url) {
      const btnLink = document.createElement("button");
      btnLink.type = "button";
      btnLink.className = "lmc-btn lmc-btn--primary";
      btnLink.textContent = "Get Tickets";
      btnLink.addEventListener("click", () => {
        window.open(event.url, "_blank", "noopener,noreferrer");
      });
      actions.appendChild(btnLink);
    }

    if (view === "announced") {
      const btnDismiss = document.createElement("button");
      btnDismiss.type = "button";
      btnDismiss.className = "lmc-btn";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnDismiss);

      const btnPlan = document.createElement("button");
      btnPlan.type = "button";
      btnPlan.className = "lmc-btn";
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
      btnRemove.className = "lmc-btn";
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", async () => {
        await removeFromPlan(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnRemove);

      const btnDismiss = document.createElement("button");
      btnDismiss.type = "button";
      btnDismiss.className = "lmc-btn";
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
      btnPlan.className = "lmc-btn";
      btnPlan.textContent = isPlanned(event.id) ? "Remove from Plan" : "Add to Plan";
      btnPlan.addEventListener("click", async () => {
        if (isPlanned(event.id)) await removeFromPlan(event.id);
        else await addToPlan(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnPlan);

      const btnUndo = document.createElement("button");
      btnUndo.type = "button";
      btnUndo.className = "lmc-btn lmc-btn--primary";
      btnUndo.textContent = "Undo Dismiss";
      btnUndo.addEventListener("click", async () => {
        await undismiss(event.id);
        render(lastEvents, lastMeta);
      });
      actions.appendChild(btnUndo);
    }

    return actions;
  }

  function buildHeroCard(event, view) {
    const card = document.createElement("div");
    card.className = "lmc-hero";

    const cover = document.createElement("div");
    cover.className = "lmc-cover";
    cover.style.backgroundImage = buildCoverStyle(event);

    const body = document.createElement("div");
    body.className = "lmc-body";

    const badge = document.createElement("div");
    badge.className = "lmc-badge";
    badge.textContent = "🔥 STRONG MATCH";

    const title = document.createElement("h3");
    title.className = "lmc-title";
    title.textContent = titleCaseArtist(normalizeArtistForLookup(event.artist));

    const meta = document.createElement("p");
    meta.className = "lmc-meta";
    meta.textContent = safeStr(event.city) || "";

    const subMeta = document.createElement("p");
    subMeta.className = "lmc-submeta";
    subMeta.textContent = [safeStr(event.venue), formatShortDayDate(event.start)].filter(Boolean).join(" • ");

    const reason = document.createElement("p");
    reason.className = "lmc-reason";
    reason.textContent = getReasonText(event);

    body.appendChild(badge);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(subMeta);
    body.appendChild(reason);
    body.appendChild(buildActionButtons(event, view));

    card.appendChild(cover);
    card.appendChild(body);
    return card;
  }

  function buildStrongCard(event, view) {
    const card = document.createElement("div");
    card.className = "lmc-strong";

    const cover = document.createElement("div");
    cover.className = "lmc-cover";
    cover.style.backgroundImage = buildCoverStyle(event);

    const body = document.createElement("div");
    body.className = "lmc-body";

    const badge = document.createElement("div");
    badge.className = "lmc-badge";
    badge.textContent = "🔥 STRONG MATCH";

    const title = document.createElement("h3");
    title.className = "lmc-title";
    title.style.fontSize = "1.48rem";
    title.textContent = titleCaseArtist(normalizeArtistForLookup(event.artist));

    const meta = document.createElement("p");
    meta.className = "lmc-meta";
    meta.textContent = [safeStr(event.city), safeStr(event.venue)].filter(Boolean).join(" • ");

    const subMeta = document.createElement("p");
    subMeta.className = "lmc-submeta";
    subMeta.textContent = formatShortDayDate(event.start);

    body.appendChild(badge);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(subMeta);
    body.appendChild(buildActionButtons(event, view));

    card.appendChild(cover);
    card.appendChild(body);
    return card;
  }

  function buildMiniCard(event, view) {
    const card = document.createElement("div");
    card.className = "lmc-mini-card";

    const cover = document.createElement("div");
    cover.className = "lmc-cover";
    cover.style.backgroundImage = buildCoverStyle(event);

    const body = document.createElement("div");
    body.className = "lmc-mini-body";

    const info = document.createElement("div");
    info.className = "lmc-mini-info";

    const title = document.createElement("h4");
    title.className = "lmc-mini-title";
    title.textContent = titleCaseArtist(normalizeArtistForLookup(event.artist));

    const meta = document.createElement("p");
    meta.className = "lmc-mini-meta";
    meta.textContent = `${safeStr(event.city)} | ${formatMonthDay(event.start)}`;

    info.appendChild(title);
    info.appendChild(meta);

    const right = document.createElement("div");
    right.className = "lmc-mini-right";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lmc-btn";
    btn.textContent = view === "dismissed"
      ? "Undo"
      : isPlanned(event.id)
        ? "Planned"
        : "Add to Plan";

    btn.addEventListener("click", async () => {
      if (view === "dismissed") {
        await undismiss(event.id);
      } else if (isPlanned(event.id)) {
        await removeFromPlan(event.id);
      } else {
        await addToPlan(event.id);
      }
      render(lastEvents, lastMeta);
    });

    right.appendChild(btn);
    body.appendChild(info);
    body.appendChild(right);

    card.appendChild(cover);
    card.appendChild(body);
    return card;
  }

  function buildAlertCard(event) {
    const shell = document.createElement("section");
    shell.className = "lmc-alert";

    const top = document.createElement("div");
    top.className = "lmc-alert-top";
    top.textContent = "⚠ CONCERT ALERT";

    const body = document.createElement("div");
    body.className = "lmc-alert-body";

    const band = document.createElement("p");
    band.className = "lmc-alert-band";
    band.textContent = titleCaseArtist(normalizeArtistForLookup(event.artist));

    const txt = document.createElement("p");
    txt.className = "lmc-alert-text";
    txt.textContent = "New Netherlands date detected";

    const dates = document.createElement("p");
    dates.className = "lmc-alert-dates";
    dates.innerHTML = `${safeStr(event.city)} • ${formatMonthDay(event.start)}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lmc-btn lmc-btn--primary";
    btn.textContent = "View Date";
    btn.addEventListener("click", () => {
      if (event.url) window.open(event.url, "_blank", "noopener,noreferrer");
    });

    body.appendChild(band);
    body.appendChild(txt);
    body.appendChild(dates);
    body.appendChild(btn);

    shell.appendChild(top);
    shell.appendChild(body);
    return shell;
  }

  function renderAnnounced(events) {
    const strong = getStrong(events);
    const suggested = getSuggested(events);
    const hero = getHeroEvent([...strong, ...suggested]);
    const heroId = hero?.id || "";
    const thisWeek = strong.filter((ev) => ev.id !== heroId).slice(0, 2);
    const upcoming = [...suggested, ...strong.filter((ev) => ev.id !== heroId)]
      .filter((ev, i, arr) => arr.findIndex(x => x.id === ev.id) === i)
      .slice(0, 4);
    const alertEvent = getAlertEvent(events);

    const wrap = document.createElement("div");
    wrap.className = "lmc-wrap";

    const topbar = document.createElement("div");
    topbar.className = "lmc-topbar";

    const heading = document.createElement("h2");
    heading.className = "lmc-heading";
    heading.textContent = "Concerts You Should Not Miss";

    const pills = document.createElement("div");
    pills.className = "lmc-pills";
    pills.appendChild(makeTopPill("Announced", "announced"));
    pills.appendChild(makeTopPill("Plan", "plan"));
    pills.appendChild(makeTopPill("Dismissed", "dismissed"));

    topbar.appendChild(heading);
    topbar.appendChild(pills);
    wrap.appendChild(topbar);

    const signal = document.createElement("section");
    signal.className = "lmc-signal";

    const badge = document.createElement("div");
    badge.className = "lmc-signal-badge";
    badge.textContent = "LIVE SIGNAL DETECTED";

    const text = document.createElement("div");
    text.className = "lmc-signal-text";
    text.textContent = `${strong.length + suggested.length} concerts matching your listening`;

    signal.appendChild(badge);
    signal.appendChild(text);
    wrap.appendChild(signal);

    if (hero) {
      wrap.appendChild(buildHeroCard(hero, "announced"));
    }

    if (thisWeek.length) {
      const sec = document.createElement("section");
      sec.className = "lmc-section";

      const title = document.createElement("h3");
      title.className = "lmc-section-title";
      title.textContent = "This Week";
      sec.appendChild(title);

      thisWeek.forEach((ev) => sec.appendChild(buildStrongCard(ev, "announced")));
      wrap.appendChild(sec);
    }

    if (upcoming.length) {
      const shell = document.createElement("section");
      shell.className = "lmc-upcoming-shell";

      const head = document.createElement("div");
      head.className = "lmc-upcoming-head";

      const title = document.createElement("h3");
      title.className = "lmc-upcoming-title";
      title.textContent = "Upcoming Shows";

      const chev = document.createElement("div");
      chev.className = "lmc-chevron";
      chev.textContent = "›";

      head.appendChild(title);
      head.appendChild(chev);
      shell.appendChild(head);

      const list = document.createElement("div");
      list.className = "lmc-mini-list";
      upcoming.forEach((ev) => list.appendChild(buildMiniCard(ev, "announced")));
      shell.appendChild(list);

      wrap.appendChild(shell);
    }

    if (alertEvent) {
      wrap.appendChild(buildAlertCard(alertEvent));
    }

    if (!hero && !thisWeek.length && !upcoming.length) {
      const empty = document.createElement("div");
      empty.className = "lmc-empty";
      empty.textContent = "No listening-linked concerts found right now.";
      wrap.appendChild(empty);
    }

    listEl.innerHTML = "";
    listEl.appendChild(wrap);
  }

  function renderState(events, titleText, view) {
    const wrap = document.createElement("div");
    wrap.className = "lmc-wrap";

    const topbar = document.createElement("div");
    topbar.className = "lmc-topbar";

    const heading = document.createElement("h2");
    heading.className = "lmc-heading";
    heading.textContent = titleText;

    const pills = document.createElement("div");
    pills.className = "lmc-pills";
    pills.appendChild(makeTopPill("Announced", "announced"));
    pills.appendChild(makeTopPill("Plan", "plan"));
    pills.appendChild(makeTopPill("Dismissed", "dismissed"));

    topbar.appendChild(heading);
    topbar.appendChild(pills);
    wrap.appendChild(topbar);

    const shell = document.createElement("section");
    shell.className = "lmc-upcoming-shell";

    const list = document.createElement("div");
    list.className = "lmc-mini-list";

    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "lmc-empty";
      empty.textContent = "Empty";
      list.appendChild(empty);
    } else {
      events.forEach((ev) => list.appendChild(buildMiniCard(ev, view)));
    }

    shell.appendChild(list);
    wrap.appendChild(shell);

    listEl.innerHTML = "";
    listEl.appendChild(wrap);
  }

  function render(events, meta) {
    lastEvents = Array.isArray(events) ? events : [];
    lastMeta = meta || null;

    const split = splitVisibleEventsByState(lastEvents);

    if (store.activeTab === "plan") {
      renderState(split.planned, "Planned Shows", "plan");
      return;
    }

    if (store.activeTab === "dismissed") {
      renderState(split.dismissed, "Dismissed Shows", "dismissed");
      return;
    }

    renderAnnounced(split.announced);
  }

  // ------------------------------------------------------------
  // Refresh
  // ------------------------------------------------------------
  async function refresh() {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing concert signals…");

    const payload = await fetchJson(buildSignalsUrl());
    const arr = Array.isArray(payload?.events) ? payload.events : [];
    const mapped = arr.map(normalizeLive2Event).filter(Boolean);
    const deduped = dedupeEvents(mapped);
    const enriched = await enrichEventsWithImages(deduped);

    render(enriched, payload?.meta || null);
  }

  // ------------------------------------------------------------
  // Auto refresh on Concerts tab open
  // ------------------------------------------------------------
  function wireConcertsTabRefresh() {
    const btn =
      document.querySelector("#tabConcerts") ||
      document.querySelector('[data-view="viewConcerts"]');

    if (!btn) return;

    btn.addEventListener("click", () => {
      refresh().catch((e) => {
        setEmpty(`Failed to refresh. ${safeStr(e?.message || "")}`.trim());
      });
    }, { passive: true });
  }

  wireConcertsTabRefresh();

  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    forceRefresh() { refresh().catch(() => {}); }
  };

  refresh().catch((e) => {
    setEmpty(`Failed to refresh. ${safeStr(e?.message || "")}`.trim());
  });
})();
