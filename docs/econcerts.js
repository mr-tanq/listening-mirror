/* econcerts.js (FULL FILE REPLACE)
   Listening Mirror — Concerts tab (recommended-only from econcerts worker)

   ✅ Uses NEW econcerts worker only
   ✅ Shows only relevant concerts:
      - top
      - strong
      - recommended
   ✅ No unrelated / hidden concerts
   ✅ Auto-refresh on Concerts tab open
   ✅ Uses images in this order:
      1) event.imageUrl / event.image_url
      2) Top/Recent images already loaded by app.js
      3) Last.fm lookup via window.LASTFM_API_KEY
      4) cinematic fallback
   ✅ Keeps Plan / Dismissed local state
*/

(() => {
  "use strict";

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
      "USA","UK","EU","EP","LP","TV","DJ'S","IDM","EDM","V.I.C.","dEUS"
    ]);

    const parts = s0.split(/(\s+|[-–—/&+])/);

    const fixed = parts.map((tok) => {
      if (!tok) return tok;
      if (/^\s+$/.test(tok)) return tok;
      if (/^[-–—/&+]$/.test(tok)) return tok;

      const up = tok.toUpperCase();
      if (KEEP_UPPER.has(tok) || KEEP_UPPER.has(up)) return tok;
      if (tok.includes(".") && tok === tok.toUpperCase()) return tok;
      if (/^[a-z][A-Z]/.test(tok) || /[A-Z].*[A-Z]/.test(tok)) return tok;

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

  function formatTimeHM(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(d);
  }

  function daysUntil(d) {
    if (!isValidDate(d)) return null;
    return Math.floor((d.getTime() - Date.now()) / 86400000);
  }

  const STORE_KEY = "lm_econcerts_ui_v51_recommended_only";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return {
          planIds: [],
          dismissedIds: [],
          lastRefreshAt: 0,
          activeTab: "announced",
        };
      }
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        activeTab: ["announced", "plan", "dismissed"].includes(String(obj.activeTab))
          ? String(obj.activeTab)
          : "announced",
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        activeTab: "announced",
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();

  const ECONCERTS_BASE = "https://econcerts.errtanq9.workers.dev";

  function buildRecommendedUrl() {
    const u = new URL(ECONCERTS_BASE + "/concerts/recommended");
    u.searchParams.set("bucketed", "1");
    u.searchParams.set("includeHidden", "0");
    u.searchParams.set("directOnly", "0");
    u.searchParams.set("limit", "500");
    u.searchParams.set("minFinalScore", "20");
    u.searchParams.set("maxSeeds", "8");
    u.searchParams.set("similarPerSeed", "12");
    u.searchParams.set("minRelatedScore", "10");
    return u.toString();
  }

  function parseEventDate(ev) {
    const dateLocal = safeStr(ev?.date_local);
    const timeLocal = safeStr(ev?.time_local) || "20:00";

    if (dateLocal) {
      const dt = new Date(`${dateLocal}T${timeLocal.length === 5 ? timeLocal : "20:00"}:00+02:00`);
      if (isValidDate(dt)) return dt;
    }

    return parseIsoToDate(ev?.start) || null;
  }

  function mapVisibilityToTier(visibility) {
    const v = safeStr(visibility);
    if (v === "top") return "strong";
    if (v === "strong") return "strong";
    if (v === "recommended") return "suggested";
    if (v === "older-taste") return "suggested";
    if (v === "borderline") return "suggested";
    return "none";
  }

  function buildReasonText(ev) {
    const reasons = Array.isArray(ev?.reasons) ? ev.reasons.filter(Boolean) : [];
    if (reasons.length) return reasons[0];
    if (safeStr(ev?.matchedBy) === "direct") return "Direct listening match";
    if (safeStr(ev?.matchedBy) === "related") return "Recommended from similar artists";
    return "Listening-linked recommendation";
  }

  function normalizeRecommendedEvent(ev) {
    const start = parseEventDate(ev);
    if (!isValidDate(start)) return null;

    const title = safeStr(ev?.title || ev?.artists_main || ev?.matchedArtist);
    if (!title) return null;

    const source = safeStr(ev?.source || "econcerts");
    const sourceId = safeStr(ev?.source_id || `${source}-${title}-${safeStr(ev?.date_local)}`);
    const id = `econcerts:${source}:${sourceId}`;

    const imageUrl =
      safeStr(ev?.image_url) ||
      safeStr(ev?.imageUrl) ||
      "";

    return {
      id,
      source,
      sourceId,
      artist: title,
      title,
      city: safeStr(ev?.city),
      venue: safeStr(ev?.venue_name || ev?.venue),
      start,
      startTs: start.getTime(),
      url: safeStr(ev?.url),
      imageUrl,
      score: Number(ev?.finalScore || ev?.directScore || ev?.relatedScore || 0) || 0,
      directScore: Number(ev?.directScore || 0) || 0,
      relatedScore: Number(ev?.relatedScore || 0) || 0,
      matchedBy: safeStr(ev?.matchedBy),
      matchedArtist: safeStr(ev?.matchedArtist),
      matchedTier: safeStr(ev?.matchedTier),
      visibility: safeStr(ev?.visibility),
      tier: mapVisibilityToTier(ev?.visibility),
      reason: buildReasonText(ev),
      reasons: Array.isArray(ev?.reasons) ? ev.reasons.slice() : []
    };
  }

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
    return events.filter((ev) => ev.tier === "strong");
  }

  function getSuggested(events) {
    return events.filter((ev) => ev.tier === "suggested");
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
      const as = a.tier === "strong" ? 1 : 0;
      const bs = b.tier === "strong" ? 1 : 0;
      if (as !== bs) return bs - as;

      const aScore = Number(a.score || 0);
      const bScore = Number(b.score || 0);
      if (aScore !== bScore) return bScore - aScore;

      return a.startTs - b.startTs;
    });

    return ranked[0] || null;
  }

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

  function getAppState() {
    try {
      return window.__LM_APP__?.getState?.() || null;
    } catch {
      return null;
    }
  }

  function scoreImageUrl(url) {
    const u = safeStr(url);
    if (!u) return 0;

    let score = 1;
    const low = lowerKey(u);

    if (low.includes("i.errtanq9.workers.dev")) score += 4;
    if (low.includes("spotify")) score += 3;
    if (low.includes("scdn")) score += 3;
    if (low.includes("lastfm")) score += 1;
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(low)) score += 2;
    if (!isBadLastfmImage(low)) score += 1;

    return score;
  }

  function pickBestImage(candidates) {
    const valid = candidates
      .map((x) => safeStr(x))
      .filter(Boolean);

    if (!valid.length) return "";

    valid.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
    return valid[0] || "";
  }

  function findImageFromAppState(artistRaw) {
    const appState = getAppState();
    if (!appState) return "";

    const artist = normalizeArtistForLookup(artistRaw);
    const artistNorm = normalizeArtistForDedupe(artist);

    const top = Array.isArray(appState.lastTop) ? appState.lastTop : [];
    const recent = Array.isArray(appState.lastRecent) ? appState.lastRecent : [];

    const topMatches = [];
    const recentMatches = [];

    for (const it of top) {
      const topType = safeStr(appState.topType);
      const name = safeStr(it?.name);
      const subArtist = safeStr(it?.artist);
      const img = safeStr(it?.image);

      if (!img) continue;

      if (topType === "artists") {
        if (normalizeArtistForDedupe(name) === artistNorm) topMatches.push(img);
      } else {
        if (normalizeArtistForDedupe(subArtist) === artistNorm) topMatches.push(img);
      }
    }

    for (const it of recent) {
      const recentArtist = safeStr(it?.artist);
      const img = safeStr(it?.image);
      if (!img) continue;
      if (normalizeArtistForDedupe(recentArtist) === artistNorm) recentMatches.push(img);
    }

    return pickBestImage([...topMatches, ...recentMatches]);
  }

  async function resolveLastfmArtistImage(artistRaw) {
    const apiKey = getLastfmApiKey();
    const artist = normalizeArtistForLookup(artistRaw);
    if (!apiKey || !artist) return "";

    const cacheKey = `lastfm:${lowerKey(artist)}`;
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

  async function resolveImageForEvent(ev) {
    if (safeStr(ev.imageUrl)) return safeStr(ev.imageUrl);

    const appStateImg = findImageFromAppState(ev.artist);
    if (appStateImg) return appStateImg;

    return await resolveLastfmArtistImage(ev.artist);
  }

  async function enrichEventsWithImages(events) {
    const out = await Promise.all(events.map(async (ev) => {
      const imageUrl = await resolveImageForEvent(ev);
      return { ...ev, imageUrl: imageUrl || "" };
    }));
    return out;
  }

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
      .lmc-wrap{ display:flex; flex-direction:column; gap:16px; }
      .lmc-topbar{ display:flex; flex-direction:column; gap:10px; margin-bottom:2px; }
      .lmc-heading{ margin:0; font-size:1.12rem; font-weight:900; letter-spacing:.01em; color:rgba(255,255,255,.98); }
      .lmc-pills{ display:flex; flex-wrap:wrap; gap:8px; }
      .lmc-pill-btn{
        appearance:none; border:none; outline:none; border-radius:999px; padding:9px 13px;
        background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08);
        color:inherit; font:inherit; font-weight:800; cursor:pointer;
      }
      .lmc-pill-btn.is-on{
        background:linear-gradient(180deg, rgba(187,225,255,.16), rgba(125,175,255,.10));
        border-color:rgba(150,205,255,.22);
      }
      .lmc-signal{
        border-radius:22px; padding:14px 16px; border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 18% 18%, rgba(106,181,255,.22), transparent 18%),
          linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.03));
        box-shadow:0 18px 38px rgba(0,0,0,.24);
      }
      .lmc-signal-badge{
        display:inline-flex; align-items:center; gap:8px; border-radius:999px; padding:7px 11px;
        font-size:.82rem; font-weight:900; letter-spacing:.03em;
        background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); margin-bottom:8px;
      }
      .lmc-signal-text{ font-size:.98rem; line-height:1.35; color:rgba(255,255,255,.92); }
      .lmc-section{ display:flex; flex-direction:column; gap:10px; }
      .lmc-section-title{ margin:0; font-size:1.02rem; font-weight:900; }
      .lmc-hero,.lmc-strong{
        position:relative; overflow:hidden; border-radius:24px; min-height:218px;
        border:1px solid rgba(255,255,255,.09); box-shadow:0 18px 42px rgba(0,0,0,.28);
      }
      .lmc-hero{ min-height:250px; }
      .lmc-cover{
        position:absolute; inset:0; background-size:cover; background-position:center center; transform:scale(1.02);
      }
      .lmc-cover::after{
        content:""; position:absolute; inset:0;
        background:linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.18) 34%, rgba(0,0,0,.72) 100%);
      }
      .lmc-body{
        position:relative; z-index:1; min-height:inherit; display:flex; flex-direction:column;
        justify-content:flex-end; gap:9px; padding:14px;
      }
      .lmc-badge{
        align-self:flex-start; display:inline-flex; align-items:center; gap:7px; padding:7px 12px;
        border-radius:999px; font-size:.79rem; font-weight:900; letter-spacing:.03em;
        background:linear-gradient(180deg, rgba(195,72,35,.92), rgba(147,27,18,.82));
        border:1px solid rgba(255,255,255,.10); box-shadow:0 8px 20px rgba(110,20,12,.20);
      }
      .lmc-title{ margin:0; font-size:1.82rem; line-height:1.02; font-weight:900; text-transform:uppercase; }
      .lmc-meta{ margin:0; font-size:1rem; font-weight:700; }
      .lmc-submeta{ margin:0; font-size:.96rem; opacity:.96; }
      .lmc-reason{ margin:0; font-size:.92rem; opacity:.88; }
      .lmc-actions{ display:flex; flex-wrap:wrap; gap:8px; margin-top:2px; }
      .lmc-btn{
        appearance:none; border:none; outline:none; border-radius:12px; padding:10px 13px;
        font:inherit; font-weight:800; color:inherit; cursor:pointer;
        background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.08);
      }
      .lmc-btn--primary{ background:linear-gradient(180deg, rgba(191,57,39,.96), rgba(149,24,14,.88)); }
      .lmc-upcoming-shell{
        border-radius:22px; border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.03));
        box-shadow:0 16px 34px rgba(0,0,0,.22); overflow:hidden;
      }
      .lmc-upcoming-head{
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:14px 14px 10px; border-bottom:1px solid rgba(255,255,255,.05);
      }
      .lmc-upcoming-title{ margin:0; font-size:1rem; font-weight:900; }
      .lmc-chevron{ opacity:.7; font-weight:900; }
      .lmc-mini-list{ display:flex; flex-direction:column; gap:10px; padding:12px; }
      .lmc-mini-card{
        position:relative; overflow:hidden; min-height:96px; border-radius:16px;
        border:1px solid rgba(255,255,255,.08); box-shadow:0 12px 26px rgba(0,0,0,.20);
      }
      .lmc-mini-body{
        position:relative; z-index:1; min-height:96px; display:flex; align-items:flex-end;
        justify-content:space-between; gap:12px; padding:12px;
      }
      .lmc-mini-info{ min-width:0; display:flex; flex-direction:column; gap:4px; }
      .lmc-mini-title{ margin:0; font-size:1.38rem; line-height:1.04; font-weight:900; text-transform:uppercase; }
      .lmc-mini-meta{ margin:0; font-size:.95rem; opacity:.96; }
      .lmc-mini-right{ display:flex; align-items:center; gap:8px; }
      .lmc-alert{
        border-radius:22px; border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.03));
        box-shadow:0 16px 34px rgba(0,0,0,.22); overflow:hidden;
      }
      .lmc-alert-top{
        display:flex; align-items:center; gap:9px; padding:12px 14px 8px;
        font-size:.88rem; font-weight:900; letter-spacing:.03em;
      }
      .lmc-alert-body{ padding:0 14px 14px; }
      .lmc-alert-band{ font-size:1.18rem; font-weight:900; margin:0 0 6px; }
      .lmc-alert-text{ margin:0 0 10px; color:rgba(255,255,255,.90); }
      .lmc-alert-dates{ margin:0 0 12px; color:rgba(255,255,255,.85); line-height:1.55; }
      .lmc-empty{
        padding:16px 14px; border-radius:18px; background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.06); color:rgba(255,255,255,.74);
      }
    `;
    document.head.appendChild(style);
  }

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
    badge.textContent = event.visibility === "top" ? "🔥 TOP MATCH" : "🔥 STRONG MATCH";

    const title = document.createElement("h3");
    title.className = "lmc-title";
    title.textContent = titleCaseArtist(normalizeArtistForLookup(event.artist));

    const meta = document.createElement("p");
    meta.className = "lmc-meta";
    meta.textContent = safeStr(event.city) || "";

    const subMeta = document.createElement("p");
    subMeta.className = "lmc-submeta";
    subMeta.textContent = [
      safeStr(event.venue),
      formatShortDayDate(event.start),
      formatTimeHM(event.start)
    ].filter(Boolean).join(" • ");

    const reason = document.createElement("p");
    reason.className = "lmc-reason";
    reason.textContent = event.reason;

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
    badge.textContent = event.visibility === "recommended" ? "✨ RECOMMENDED" : "🔥 STRONG MATCH";

    const title = document.createElement("h3");
    title.className = "lmc-title";
    title.style.fontSize = "1.48rem";
    title.textContent = titleCaseArtist(normalizeArtistForLookup(event.artist));

    const meta = document.createElement("p");
    meta.className = "lmc-meta";
    meta.textContent = [safeStr(event.city), safeStr(event.venue)].filter(Boolean).join(" • ");

    const subMeta = document.createElement("p");
    subMeta.className = "lmc-submeta";
    subMeta.textContent = [formatShortDayDate(event.start), formatTimeHM(event.start)].filter(Boolean).join(" • ");

    const reason = document.createElement("p");
    reason.className = "lmc-reason";
    reason.textContent = event.reason;

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
    meta.textContent = [
      safeStr(event.city),
      formatMonthDay(event.start),
      formatTimeHM(event.start)
    ].filter(Boolean).join(" | ");

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
    txt.textContent = event.reason || "New relevant concert detected";

    const dates = document.createElement("p");
    dates.className = "lmc-alert-dates";
    dates.innerHTML = [
      safeStr(event.city),
      safeStr(event.venue),
      formatMonthDay(event.start),
      formatTimeHM(event.start)
    ].filter(Boolean).join(" • ");

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
      .slice(0, 6);
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

  function extractWorkerEvents(payload) {
    const all = [];

    const directEvents = Array.isArray(payload?.events) ? payload.events : [];
    if (directEvents.length) all.push(...directEvents);

    const buckets = payload?.buckets || {};
    const bucketNames = ["top", "strong", "recommended"];

    for (const name of bucketNames) {
      const arr = Array.isArray(buckets?.[name]) ? buckets[name] : [];
      for (const ev of arr) all.push(ev);
    }

    const seen = new Map();

    for (const raw of all) {
      const mapped = normalizeRecommendedEvent(raw);
      if (!mapped) continue;

      if (!["top", "strong", "recommended", "older-taste", "borderline"].includes(mapped.visibility)) {
        continue;
      }

      const prev = seen.get(mapped.id);
      if (!prev) {
        seen.set(mapped.id, mapped);
        continue;
      }

      if (Number(mapped.score || 0) > Number(prev.score || 0)) {
        seen.set(mapped.id, mapped);
      }
    }

    return Array.from(seen.values())
      .filter((ev) => ev.tier === "strong" || ev.tier === "suggested")
      .sort(sortChronoAsc);
  }

  async function refresh() {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing concert signals…");

    const payload = await fetchJson(buildRecommendedUrl());
    const mapped = extractWorkerEvents(payload);
    const enriched = await enrichEventsWithImages(mapped);

    render(enriched, payload?.meta || null);
  }

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
