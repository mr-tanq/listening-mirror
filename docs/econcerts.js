/* econcerts.js — FULL FILE REPLACE
   Listening Mirror — Concerts tab
   New UX: Discover / Radar / Going / Hidden
   - Tinder-like swipe deck
   - grouped artist radar
   - itinerary-style going view
   - immersive details sheet
   - keeps existing backend/data logic
*/

(() => {
  "use strict";

  const listEl = document.querySelector("#econcertsList");
  if (!listEl) return;

  const STORE_KEY = "lm_econcerts_ui_v70_swipe_radar";
  const ECONCERTS_BASE = "https://econcerts.errtanq9.workers.dev";
  const ARCHIVE_BASE = "https://listening-mirror-archive.errtanq9.workers.dev";
  const RECOMMENDED_LIMIT = 5000;
  const PLANNED_LIMIT = 2000;

  function safeStr(v) {
    return String(v || "").trim();
  }

  function lowerKey(v) {
    return safeStr(v).toLowerCase();
  }

  function isValidDate(d) {
    return d instanceof Date && !Number.isNaN(d.getTime());
  }

  function parseAmsterdamDate(dateLocal, timeLocal) {
    const datePart = safeStr(dateLocal);
    if (!datePart) return null;
    const timePart = safeStr(timeLocal) || "20:00";
    const normalizedTime = /^\d{2}:\d{2}$/.test(timePart) ? timePart : "20:00";
    const dt = new Date(`${datePart}T${normalizedTime}:00+02:00`);
    return isValidDate(dt) ? dt : null;
  }

  async function fetchJson(url, init = undefined) {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(safeStr(data?.error || data?.message || `HTTP ${res.status}`));
    }
    if (data && data.ok === false) {
      throw new Error(safeStr(data?.error || data?.message || "Unknown error"));
    }
    return data;
  }

  function titleCaseArtist(input) {
    const s0 = safeStr(input);
    if (!s0) return "";

    const KEEP_AS_IS = new Set(["dEUS", "MØ", "A$AP", "V.I.C.", "DJ", "MC", "II", "III", "IV", "UK", "USA", "EU"]);
    const parts = s0.split(/(\s+|[-–—/&+])/);

    return parts.map((tok) => {
      if (!tok) return tok;
      if (/^\s+$/.test(tok)) return tok;
      if (/^[-–—/&+]$/.test(tok)) return tok;
      if (KEEP_AS_IS.has(tok)) return tok;
      if (/^[A-Z0-9.$&'’+-]+$/.test(tok) && tok.length <= 4) return tok;

      const m = tok.match(/^([("'[\{]*)([A-Za-zÀ-ÖØ-öø-ÿ])([\s\S]*)$/u);
      if (!m) return tok;

      const lead = m[1] || "";
      const first = m[2] || "";
      const rest = (m[3] || "").toLowerCase();
      return lead + first.toUpperCase() + rest;
    }).join("");
  }

  function formatShortDayDate(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(d);
  }

  function formatMonthDay(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      day: "numeric",
      month: "short"
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

  function formatLongDate(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(d);
  }

  function daysUntil(d) {
    if (!isValidDate(d)) return null;
    return Math.floor((d.getTime() - Date.now()) / 86400000);
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
      /\s*,\s*/i
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

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
  }

  function buildPlannedEventKey({ source, sourceId, title, dateLocal, venueName, city }) {
    const cleanSource = safeStr(source).toLowerCase();
    const cleanSourceId = safeStr(sourceId);

    if (cleanSource && cleanSourceId) {
      return `planned::${cleanSource}::${cleanSourceId}`;
    }

    return [
      "planned",
      slugify(cleanSource || "unknown"),
      slugify(title || ""),
      slugify(venueName || ""),
      slugify(city || ""),
      safeStr(dateLocal)
    ].filter(Boolean).join("::");
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return {
          activeMode: "discover",
          dismissedIds: [],
          lastRefreshAt: 0,
          snoozedPendingEventKey: "",
          deckIndex: 0
        };
      }
      const obj = JSON.parse(raw);
      return {
        activeMode: ["discover", "radar", "going", "hidden"].includes(String(obj.activeMode))
          ? String(obj.activeMode)
          : "discover",
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        snoozedPendingEventKey: safeStr(obj.snoozedPendingEventKey),
        deckIndex: Math.max(0, Number(obj.deckIndex || 0))
      };
    } catch {
      return {
        activeMode: "discover",
        dismissedIds: [],
        lastRefreshAt: 0,
        snoozedPendingEventKey: "",
        deckIndex: 0
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();
  let lastEvents = [];
  let lastMeta = null;
  let plannedItems = [];
  let plannedMap = new Map();
  let pendingPromptItem = null;
  let pendingPromptBusy = false;
  let detailsSheetEvent = null;
  let radarExpandedGroupKey = "";

  const artistImageCache = new Map();

  function setEmpty(msg) {
    listEl.innerHTML = `<div class="lmx-empty">${msg}</div>`;
  }

  function getRecommendedUrl() {
    const u = new URL(`${ECONCERTS_BASE}/concerts/recommended`);
    u.searchParams.set("bucketed", "1");
    u.searchParams.set("limit", String(RECOMMENDED_LIMIT));
    u.searchParams.set("includeHidden", "0");
    u.searchParams.set("minFinalScore", "20");
    u.searchParams.set("maxSeeds", "8");
    u.searchParams.set("similarPerSeed", "12");
    u.searchParams.set("minRelatedScore", "10");
    return u.toString();
  }

  function getPlannedConcertsUrl() {
    const u = new URL(`${ARCHIVE_BASE}/planned-concerts`);
    u.searchParams.set("limit", String(PLANNED_LIMIT));
    u.searchParams.set("includeArchived", "0");
    u.searchParams.set("includeMissed", "0");
    u.searchParams.set("includeDismissed", "0");
    return u.toString();
  }

  function getLastfmApiKey() {
    return safeStr(window.LASTFM_API_KEY);
  }

  function isBadLastfmImage(url) {
    const u = lowerKey(url);
    if (!u) return true;
    return (
      u.includes("2a96cbd8b46e442fc41c2b86b821562f") ||
      u.includes("4128a6eb29f94943c9d206c08e625904") ||
      u.includes("noimage") ||
      u.includes("placeholder") ||
      u.endsWith(".gif")
    );
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
    const valid = candidates.map((x) => safeStr(x)).filter(Boolean);
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
    const found = [];

    for (const it of top) {
      const topType = safeStr(appState.topType);
      const name = safeStr(it?.name);
      const subArtist = safeStr(it?.artist);
      const img = safeStr(it?.image);
      if (!img) continue;

      if (topType === "artists") {
        if (normalizeArtistForDedupe(name) === artistNorm) found.push(img);
      } else {
        if (normalizeArtistForDedupe(subArtist) === artistNorm) found.push(img);
      }
    }

    for (const it of recent) {
      const recentArtist = safeStr(it?.artist);
      const img = safeStr(it?.image);
      if (!img) continue;
      if (normalizeArtistForDedupe(recentArtist) === artistNorm) found.push(img);
    }

    return pickBestImage(found);
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
      u.searchParams.set("autocorrect", "1");

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
    const fromApp = findImageFromAppState(ev.artist);
    if (fromApp) return fromApp;
    return await resolveLastfmArtistImage(ev.artist);
  }

  async function enrichEventsWithImages(events) {
    return await Promise.all(events.map(async (ev) => {
      const imageUrl = await resolveImageForEvent(ev);
      return { ...ev, imageUrl: imageUrl || "" };
    }));
  }

  function getFallbackVisual(seed) {
    const s = lowerKey(seed);
    let hue = 18;
    if (s) {
      let sum = 0;
      for (let i = 0; i < s.length; i += 1) sum += s.charCodeAt(i);
      hue = sum % 360;
    }
    return `
      radial-gradient(circle at 50% 20%, rgba(255,220,170,.20), transparent 22%),
      linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.70)),
      linear-gradient(135deg,
        hsla(${hue}, 70%, 18%, .98),
        hsla(${(hue + 18) % 360}, 62%, 12%, .98) 44%,
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

  function reasonFromEvent(ev) {
    if (Array.isArray(ev?.reasons) && ev.reasons.length) return safeStr(ev.reasons[0]);
    if (safeStr(ev?.matchedBy) === "direct") return "Direct listening match";
    if (safeStr(ev?.matchedBy) === "related") return "Recommended from similar artists";
    return "Listening-linked recommendation";
  }

  function tierFromVisibility(visibility) {
    const v = safeStr(visibility);
    if (v === "top" || v === "strong") return "strong";
    if (v === "recommended" || v === "older-taste" || v === "borderline") return "suggested";
    return "none";
  }

  function normalizeRecommendedEvent(ev) {
    const start = parseAmsterdamDate(ev?.date_local, ev?.time_local);
    if (!isValidDate(start)) return null;

    const artist = safeStr(ev?.title || ev?.artists_main || ev?.matchedArtist);
    if (!artist) return null;

    const source = safeStr(ev?.source || "econcerts").toLowerCase();
    const sourceId = safeStr(ev?.source_id || `${source}-${artist}-${safeStr(ev?.date_local)}`);
    const eventKey = buildPlannedEventKey({
      source,
      sourceId,
      title: artist,
      dateLocal: safeStr(ev?.date_local),
      venueName: safeStr(ev?.venue_name),
      city: safeStr(ev?.city)
    });

    return {
      id: eventKey,
      eventKey,
      source,
      sourceId,
      artist,
      title: artist,
      city: safeStr(ev?.city),
      country: safeStr(ev?.country || "NL"),
      venue: safeStr(ev?.venue_name),
      dateLocal: safeStr(ev?.date_local),
      timeLocal: safeStr(ev?.time_local),
      start,
      startTs: start.getTime(),
      url: safeStr(ev?.url),
      imageUrl: safeStr(ev?.image_url || ev?.imageUrl),
      visibility: safeStr(ev?.visibility),
      tier: tierFromVisibility(ev?.visibility),
      score: Number(ev?.finalScore || 0) || 0,
      directScore: Number(ev?.directScore || 0) || 0,
      relatedScore: Number(ev?.relatedScore || 0) || 0,
      matchedBy: safeStr(ev?.matchedBy),
      matchedArtist: safeStr(ev?.matchedArtist),
      matchedTier: safeStr(ev?.matchedTier),
      reasons: Array.isArray(ev?.reasons) ? ev.reasons.slice() : [],
      reason: reasonFromEvent(ev),
      fromPlannedDb: false,
      plannedStatus: ""
    };
  }

  function normalizePlannedEvent(ev) {
    const start = parseAmsterdamDate(ev?.date_local, ev?.time_local);
    if (!isValidDate(start)) return null;

    const artist = safeStr(ev?.main_artist || ev?.title);
    const eventKey = safeStr(ev?.event_key);
    if (!artist || !eventKey) return null;

    return {
      id: eventKey,
      eventKey,
      source: safeStr(ev?.source).toLowerCase(),
      sourceId: safeStr(ev?.source_id),
      artist,
      title: safeStr(ev?.title || ev?.main_artist),
      city: safeStr(ev?.city),
      country: safeStr(ev?.country || "NL"),
      venue: safeStr(ev?.venue_name),
      dateLocal: safeStr(ev?.date_local),
      timeLocal: safeStr(ev?.time_local),
      start,
      startTs: start.getTime(),
      url: safeStr(ev?.url),
      imageUrl: safeStr(ev?.image_url),
      visibility: "planned",
      tier: "planned",
      score: 0,
      directScore: 0,
      relatedScore: 0,
      matchedBy: "",
      matchedArtist: "",
      matchedTier: "",
      reasons: [],
      reason: "Planned concert",
      plannedStatus: safeStr(ev?.status || "planned"),
      plannedNotes: safeStr(ev?.notes || ""),
      fromPlannedDb: true
    };
  }

  function extractWorkerEvents(payload) {
    const all = [];
    if (Array.isArray(payload?.events)) all.push(...payload.events);

    const buckets = payload?.buckets || {};
    for (const name of ["top", "strong", "recommended"]) {
      const arr = Array.isArray(buckets?.[name]) ? buckets[name] : [];
      all.push(...arr);
    }

    const byId = new Map();

    for (const raw of all) {
      const ev = normalizeRecommendedEvent(raw);
      if (!ev) continue;
      if (ev.tier === "none") continue;

      const prev = byId.get(ev.id);
      if (!prev || Number(ev.score || 0) > Number(prev.score || 0)) {
        byId.set(ev.id, ev);
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const tierA = a.tier === "strong" ? 1 : 0;
      const tierB = b.tier === "strong" ? 1 : 0;
      if (tierA !== tierB) return tierB - tierA;

      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.startTs - b.startTs;
    });
  }

  async function loadPlannedConcerts() {
    const payload = await fetchJson(getPlannedConcertsUrl());
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const normalized = items.map(normalizePlannedEvent).filter(Boolean);

    plannedItems = normalized.slice();
    plannedMap = new Map(normalized.map((ev) => [ev.eventKey, ev]));
    return normalized;
  }

  function buildPlannedPayload(event) {
    return {
      event_key: safeStr(event?.eventKey || event?.id),
      source: safeStr(event?.source).toLowerCase(),
      source_id: safeStr(event?.sourceId),
      title: safeStr(event?.title || event?.artist),
      main_artist: safeStr(event?.artist || event?.title),
      date_local: safeStr(event?.dateLocal),
      time_local: safeStr(event?.timeLocal),
      venue_name: safeStr(event?.venue),
      city: safeStr(event?.city),
      country: safeStr(event?.country || "NL"),
      url: safeStr(event?.url),
      image_url: safeStr(event?.imageUrl)
    };
  }

  async function addToPlan(event) {
    const payload = buildPlannedPayload(event);
    await fetchJson(`${ARCHIVE_BASE}/planned-concerts/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await loadPlannedConcerts();
  }

  async function removeFromPlan(eventKey) {
    await fetchJson(`${ARCHIVE_BASE}/planned-concerts/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_key: safeStr(eventKey) })
    });
    await loadPlannedConcerts();
  }

  async function markPendingAttended(eventKey) {
    await fetchJson(`${ARCHIVE_BASE}/planned-concerts/attended`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_key: safeStr(eventKey) })
    });
    await loadPlannedConcerts();
  }

  async function markPendingMissed(eventKey) {
    await fetchJson(`${ARCHIVE_BASE}/planned-concerts/missed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_key: safeStr(eventKey) })
    });
    await loadPlannedConcerts();
  }
const isPlanned = (eventKey) => plannedMap.has(safeStr(eventKey));
  const isDismissed = (id) => store.dismissedIds.includes(id);

  async function dismiss(id) {
    if (!store.dismissedIds.includes(id)) store.dismissedIds.push(id);
    saveStore(store);
  }

  async function undismiss(id) {
    store.dismissedIds = store.dismissedIds.filter((x) => x !== id);
    saveStore(store);
  }

  function splitVisibleEventsByState(events) {
    const dismissedIds = new Set(store.dismissedIds);
    const announced = [];
    const planned = [];
    const hidden = [];

    for (const ev of events) {
      if (dismissedIds.has(ev.id)) {
        hidden.push(ev);
      } else if (isPlanned(ev.eventKey || ev.id)) {
        planned.push(ev);
      } else {
        announced.push(ev);
      }
    }

    announced.sort((a, b) => a.startTs - b.startTs);
    planned.sort((a, b) => a.startTs - b.startTs);
    hidden.sort((a, b) => a.startTs - b.startTs);

    return { announced, planned, hidden };
  }

  function getStrong(events) {
    return events.filter((ev) => ev.tier === "strong");
  }

  function getSuggested(events) {
    return events.filter((ev) => ev.tier === "suggested");
  }

  function mergeRecommendedWithPlanned(recommendedEvents, plannedDbEvents) {
    const map = new Map();

    for (const ev of recommendedEvents) map.set(ev.id, ev);

    for (const plannedEv of plannedDbEvents) {
      const existing = map.get(plannedEv.id);
      if (existing) {
        map.set(plannedEv.id, {
          ...existing,
          plannedStatus: plannedEv.plannedStatus,
          plannedNotes: plannedEv.plannedNotes,
          fromPlannedDb: true
        });
      } else {
        map.set(plannedEv.id, plannedEv);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.startTs - b.startTs);
  }

  function getPendingPromptCandidate() {
    const pending = plannedItems
      .filter((ev) => safeStr(ev.plannedStatus) === "pending")
      .sort((a, b) => a.startTs - b.startTs);

    if (!pending.length) return null;

    const snoozedKey = safeStr(store.snoozedPendingEventKey);
    const firstNonSnoozed = pending.find((ev) => ev.eventKey !== snoozedKey);
    return firstNonSnoozed || pending[0] || null;
  }

  function updatePendingPromptState() {
    pendingPromptItem = getPendingPromptCandidate();
    renderPendingPrompt();
  }

  async function handlePendingYes() {
    if (!pendingPromptItem || pendingPromptBusy) return;
    pendingPromptBusy = true;
    renderPendingPrompt();

    try {
      await markPendingAttended(pendingPromptItem.eventKey);
      if (safeStr(store.snoozedPendingEventKey) === safeStr(pendingPromptItem.eventKey)) {
        store.snoozedPendingEventKey = "";
        saveStore(store);
      }
      await refresh();
    } catch (e) {
      pendingPromptBusy = false;
      renderPendingPrompt();
      alert(`Could not move concert to archive.\n\n${safeStr(e?.message || "")}`);
    }
  }

  async function handlePendingNo() {
    if (!pendingPromptItem || pendingPromptBusy) return;
    pendingPromptBusy = true;
    renderPendingPrompt();

    try {
      await markPendingMissed(pendingPromptItem.eventKey);
      if (safeStr(store.snoozedPendingEventKey) === safeStr(pendingPromptItem.eventKey)) {
        store.snoozedPendingEventKey = "";
        saveStore(store);
      }
      await refresh();
    } catch (e) {
      pendingPromptBusy = false;
      renderPendingPrompt();
      alert(`Could not mark concert as missed.\n\n${safeStr(e?.message || "")}`);
    }
  }

  function removeExistingPromptEl() {
    const existing = document.getElementById("lmConcertCheckinOverlay");
    if (existing) existing.remove();
  }

  function renderPendingPrompt() {
    removeExistingPromptEl();
    if (!pendingPromptItem) return;

    const ev = pendingPromptItem;
    const overlay = document.createElement("div");
    overlay.id = "lmConcertCheckinOverlay";
    overlay.className = "lmx-checkin-overlay";

    const panel = document.createElement("div");
    panel.className = "lmx-checkin-panel";

    const image = document.createElement("div");
    image.className = "lmx-checkin-image";
    image.style.backgroundImage = buildCoverStyle(ev);

    const badge = document.createElement("div");
    badge.className = "lmx-checkin-badge";
    badge.textContent = "Post-show check-in";

    const title = document.createElement("h3");
    title.className = "lmx-checkin-title";
    title.textContent = `Did this become part of your story?`;

    const sub = document.createElement("p");
    sub.className = "lmx-checkin-sub";
    sub.textContent = `${titleCaseArtist(normalizeArtistForLookup(ev.artist))} • ${formatLongDate(ev.start)} • ${safeStr(ev.venue)} • ${safeStr(ev.city)}`;

    const actions = document.createElement("div");
    actions.className = "lmx-checkin-actions";

    const yesBtn = document.createElement("button");
    yesBtn.type = "button";
    yesBtn.className = "lmx-checkin-btn lmx-checkin-btn--primary";
    yesBtn.textContent = pendingPromptBusy ? "Working..." : "Yes, I went";
    yesBtn.disabled = pendingPromptBusy;
    yesBtn.addEventListener("click", handlePendingYes);

    const noBtn = document.createElement("button");
    noBtn.type = "button";
    noBtn.className = "lmx-checkin-btn";
    noBtn.textContent = pendingPromptBusy ? "Working..." : "No, remove it";
    noBtn.disabled = pendingPromptBusy;
    noBtn.addEventListener("click", handlePendingNo);

    const laterBtn = document.createElement("button");
    laterBtn.type = "button";
    laterBtn.className = "lmx-checkin-btn";
    laterBtn.textContent = "Remind me later";
    laterBtn.disabled = pendingPromptBusy;
    laterBtn.addEventListener("click", () => {
      store.snoozedPendingEventKey = safeStr(ev.eventKey);
      saveStore(store);
      pendingPromptItem = null;
      renderPendingPrompt();
    });

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    actions.appendChild(laterBtn);

    panel.appendChild(image);
    panel.appendChild(badge);
    panel.appendChild(title);
    panel.appendChild(sub);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function groupEventsByArtist(events) {
    const map = new Map();

    for (const ev of events) {
      const key = normalizeArtistForDedupe(ev.artist || ev.title || ev.id);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, {
          key,
          artist: ev.artist,
          imageUrl: ev.imageUrl,
          tier: ev.tier,
          bestScore: Number(ev.score || 0),
          matchedArtist: ev.matchedArtist,
          reasons: Array.isArray(ev.reasons) ? ev.reasons.slice() : [],
          events: [ev]
        });
      } else {
        const g = map.get(key);
        g.events.push(ev);
        if (!g.imageUrl && ev.imageUrl) g.imageUrl = ev.imageUrl;
        if (Number(ev.score || 0) > Number(g.bestScore || 0)) g.bestScore = Number(ev.score || 0);
        if (g.tier !== "strong" && ev.tier === "strong") g.tier = "strong";
      }
    }

    const groups = Array.from(map.values()).map((g) => {
      g.events.sort((a, b) => a.startTs - b.startTs);
      g.nextEvent = g.events[0] || null;
      g.count = g.events.length;
      return g;
    });

    groups.sort((a, b) => {
      const aStrong = a.tier === "strong" ? 1 : 0;
      const bStrong = b.tier === "strong" ? 1 : 0;
      if (aStrong !== bStrong) return bStrong - aStrong;
      if (Number(b.bestScore || 0) !== Number(a.bestScore || 0)) {
        return Number(b.bestScore || 0) - Number(a.bestScore || 0);
      }
      return Number(a.nextEvent?.startTs || 0) - Number(b.nextEvent?.startTs || 0);
    });

    return groups;
  }

  function getDeck(events) {
    const strong = getStrong(events);
    const suggested = getSuggested(events);

    const groupedSuggested = groupEventsByArtist(suggested)
      .filter((g) => g.count > 1)
      .slice(0, 8);

    const singlesSuggested = suggested.filter((ev) => {
      const key = normalizeArtistForDedupe(ev.artist);
      return !groupedSuggested.some((g) => g.key === key);
    });

    const deck = [];
    strong.forEach((ev) => deck.push({ type: "event", event: ev }));
    singlesSuggested.forEach((ev) => deck.push({ type: "event", event: ev }));
    groupedSuggested.forEach((group) => deck.push({ type: "group", group }));

    return deck;
  }

  function getMatchLabel(item) {
    if (item?.type === "group") return item.group.tier === "strong" ? "Core Taste" : "Artist Cluster";
    const ev = item?.event;
    if (!ev) return "Live Match";
    if (ev.visibility === "top") return "Core Taste";
    if (ev.tier === "strong") return "Strong Match";
    return "Suggested";
  }

  function cityCount(events) {
    return new Set(events.map((x) => lowerKey(x.city)).filter(Boolean)).size;
  }

  function injectStylesOnce() {
    if (document.getElementById("lmConcertsSwipeStyles")) return;

    const style = document.createElement("style");
    style.id = "lmConcertsSwipeStyles";
    style.textContent = `
      #econcertsList { display:block; }
      .lmx-shell { display:flex; flex-direction:column; gap:14px; }
      .lmx-top {
        display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
      }
      .lmx-title-wrap { display:flex; flex-direction:column; gap:6px; min-width:0; }
      .lmx-kicker {
        display:inline-flex; align-items:center; gap:8px; font-size:.82rem; font-weight:900;
        color:rgba(255,255,255,.72); letter-spacing:.04em; text-transform:uppercase;
      }
      .lmx-kicker-dot {
        width:8px; height:8px; border-radius:999px; background:#8db7ff;
        box-shadow:0 0 14px rgba(141,183,255,.9);
        animation:lmxPulse 1.6s infinite ease-in-out;
      }
      @keyframes lmxPulse {
        0%,100% { transform:scale(1); opacity:.9; }
        50% { transform:scale(1.35); opacity:1; }
      }
      .lmx-title { margin:0; font-size:1.18rem; font-weight:900; color:#fff; }
      .lmx-sub { margin:0; font-size:.92rem; color:rgba(255,255,255,.72); }

      .lmx-modebar {
        display:flex; gap:8px; flex-wrap:wrap;
        position:sticky; top:8px; z-index:8;
      }
      .lmx-mode {
        appearance:none; border:none; cursor:pointer;
        border-radius:999px; padding:10px 14px;
        font:inherit; font-weight:900; color:#fff;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.08);
        backdrop-filter:blur(12px);
      }
      .lmx-mode.is-on {
        background:linear-gradient(180deg, rgba(136,171,255,.24), rgba(83,110,255,.12));
        border-color:rgba(162,188,255,.30);
        box-shadow:0 10px 30px rgba(34,58,120,.22);
      }

      .lmx-deck-wrap { display:flex; flex-direction:column; gap:14px; }
      .lmx-deck-stage {
        position:relative; height:72vh; min-height:540px;
      }
      .lmx-card {
        position:absolute; inset:0; border-radius:28px; overflow:hidden;
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 28px 60px rgba(0,0,0,.32);
        background:#0b1017;
        touch-action:none;
        user-select:none;
        transform-origin:center center;
        transition:transform .22s ease, opacity .22s ease, filter .22s ease;
      }
      .lmx-card.is-back-1 { transform:translateY(14px) scale(.975); opacity:.62; filter:blur(.4px); }
      .lmx-card.is-back-2 { transform:translateY(28px) scale(.95); opacity:.34; filter:blur(.8px); }
      .lmx-card-cover {
        position:absolute; inset:0; background-size:cover; background-position:center center;
        transform:scale(1.03);
      }
      .lmx-card-cover::after {
        content:""; position:absolute; inset:0;
        background:
          linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.18) 24%, rgba(0,0,0,.84) 100%),
          radial-gradient(circle at 50% 24%, rgba(124,171,255,.18), transparent 22%);
      }
      .lmx-card-body {
        position:relative; z-index:1; height:100%;
        display:flex; flex-direction:column; justify-content:space-between;
        padding:16px;
      }
      .lmx-chip-row { display:flex; gap:8px; flex-wrap:wrap; align-self:flex-start; }
      .lmx-chip {
        display:inline-flex; align-items:center; gap:6px;
        border-radius:999px; padding:8px 11px;
        font-size:.79rem; font-weight:900; color:#fff;
        background:rgba(255,255,255,.09);
        border:1px solid rgba(255,255,255,.10);
        backdrop-filter:blur(12px);
      }
      .lmx-card-bottom { display:flex; flex-direction:column; gap:12px; }
      .lmx-artist {
        margin:0; font-size:2rem; line-height:1.01; font-weight:950; text-transform:uppercase;
        color:#fff;
      }
      .lmx-meta { margin:0; font-size:1rem; font-weight:800; color:rgba(255,255,255,.96); }
      .lmx-reason { margin:0; font-size:.93rem; color:rgba(255,255,255,.80); line-height:1.4; }
      .lmx-swipe-label {
        position:absolute; top:18px; padding:10px 14px; border-radius:14px;
        font-size:1rem; font-weight:950; letter-spacing:.06em; text-transform:uppercase;
        border:2px solid rgba(255,255,255,.26); opacity:0; pointer-events:none;
        backdrop-filter:blur(12px);
      }
      .lmx-swipe-label.pass { left:18px; color:#ff9d94; }
      .lmx-swipe-label.plan { right:18px; color:#9ef4c2; }
      .lmx-swipe-label.show { opacity:1; }

      .lmx-actions {
        display:flex; align-items:center; justify-content:center; gap:12px;
      }
      .lmx-action {
        appearance:none; border:none; cursor:pointer;
        width:56px; height:56px; border-radius:999px;
        background:rgba(255,255,255,.10);
        border:1px solid rgba(255,255,255,.12);
        color:#fff; font:inherit; font-weight:900;
        backdrop-filter:blur(12px);
        box-shadow:0 10px 24px rgba(0,0,0,.22);
      }
      .lmx-action.lmx-action--big { width:auto; min-width:110px; padding:0 18px; border-radius:999px; }
      .lmx-action--plan {
        background:linear-gradient(180deg, rgba(58,211,140,.24), rgba(27,135,88,.16));
      }
      .lmx-action--hide {
        background:linear-gradient(180deg, rgba(255,114,114,.18), rgba(158,45,45,.10));
      }
      .lmx-action--info {
        background:linear-gradient(180deg, rgba(136,171,255,.24), rgba(83,110,255,.12));
      }

      .lmx-deck-progress {
        display:flex; justify-content:space-between; align-items:center; gap:12px;
        padding:12px 14px; border-radius:18px;
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06);
      }
      .lmx-progress-text { font-size:.9rem; color:rgba(255,255,255,.78); }

      .lmx-radar-grid { display:grid; gap:12px; }
      .lmx-radar-citybar {
        display:grid; grid-template-columns:repeat(auto-fit, minmax(120px,1fr)); gap:10px;
      }
      .lmx-city-node {
        border-radius:20px; padding:14px; min-height:92px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 50% 22%, rgba(124,171,255,.18), transparent 26%),
          linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.03));
      }
      .lmx-city-name { margin:0 0 6px; font-size:1rem; font-weight:900; color:#fff; }
      .lmx-city-count { margin:0; font-size:.88rem; color:rgba(255,255,255,.72); }
.lmx-group {
        border-radius:22px; overflow:hidden;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.03));
        box-shadow:0 16px 34px rgba(0,0,0,.20);
      }
      .lmx-group-head {
        display:flex; gap:12px; align-items:center; padding:14px; cursor:pointer;
      }
      .lmx-group-thumb {
        width:72px; height:72px; border-radius:18px; background-size:cover; background-position:center center;
        flex-shrink:0; border:1px solid rgba(255,255,255,.10);
      }
      .lmx-group-main { min-width:0; display:flex; flex-direction:column; gap:6px; flex:1; }
      .lmx-group-title { margin:0; font-size:1.08rem; font-weight:900; color:#fff; }
      .lmx-group-sub { margin:0; font-size:.9rem; color:rgba(255,255,255,.76); }
      .lmx-group-cta {
        appearance:none; border:none; cursor:pointer; border-radius:999px;
        padding:10px 12px; font:inherit; font-weight:900; color:#fff;
        background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.10);
      }
      .lmx-group-dates {
        display:none; padding:0 14px 14px; gap:10px; flex-direction:column;
      }
      .lmx-group.is-open .lmx-group-dates { display:flex; }
      .lmx-date-row {
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        border-radius:16px; padding:12px;
        background:rgba(255,255,255,.045);
        border:1px solid rgba(255,255,255,.06);
      }
      .lmx-date-left { display:flex; flex-direction:column; gap:4px; min-width:0; }
      .lmx-date-title { margin:0; font-size:.94rem; font-weight:900; color:#fff; }
      .lmx-date-sub { margin:0; font-size:.84rem; color:rgba(255,255,255,.72); }
      .lmx-date-actions { display:flex; gap:8px; flex-shrink:0; }

      .lmx-going-list, .lmx-hidden-list { display:flex; flex-direction:column; gap:12px; }
      .lmx-itinerary {
        display:grid; grid-template-columns:72px 1fr; gap:12px;
        border-radius:22px; overflow:hidden; padding:14px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.03));
      }
      .lmx-date-badge {
        border-radius:18px; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08);
        min-height:92px;
      }
      .lmx-date-badge-day { font-size:1.35rem; font-weight:950; color:#fff; line-height:1; }
      .lmx-date-badge-month { font-size:.82rem; font-weight:900; color:rgba(255,255,255,.72); text-transform:uppercase; letter-spacing:.05em; }
      .lmx-itinerary-main { display:flex; flex-direction:column; gap:8px; min-width:0; }
      .lmx-itinerary-title { margin:0; font-size:1.12rem; font-weight:900; color:#fff; }
      .lmx-itinerary-sub { margin:0; font-size:.92rem; color:rgba(255,255,255,.74); }
      .lmx-itinerary-actions { display:flex; flex-wrap:wrap; gap:8px; }

      .lmx-btn {
        appearance:none; border:none; cursor:pointer; border-radius:12px; padding:10px 12px;
        font:inherit; font-weight:900; color:#fff;
        background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.09);
      }
      .lmx-btn--primary {
        background:linear-gradient(180deg, rgba(136,171,255,.24), rgba(83,110,255,.12));
      }
      .lmx-btn--danger {
        background:linear-gradient(180deg, rgba(255,114,114,.18), rgba(158,45,45,.10));
      }
      .lmx-btn--plan {
        background:linear-gradient(180deg, rgba(58,211,140,.24), rgba(27,135,88,.16));
      }

      .lmx-sheet {
        position:fixed; inset:0; z-index:9998; background:rgba(0,0,0,.48);
        backdrop-filter:blur(10px); display:flex; align-items:flex-end; justify-content:center; padding:16px;
      }
      .lmx-sheet-panel {
        width:min(100%, 520px); max-height:86vh; overflow:auto;
        border-radius:28px; overflow:hidden;
        border:1px solid rgba(255,255,255,.10);
        background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03)), linear-gradient(180deg, #0c1016, #080b10);
        box-shadow:0 28px 60px rgba(0,0,0,.38);
      }
      .lmx-sheet-cover { height:220px; background-size:cover; background-position:center center; }
      .lmx-sheet-body { padding:16px; display:flex; flex-direction:column; gap:14px; }
      .lmx-sheet-title { margin:0; font-size:1.5rem; line-height:1.08; font-weight:950; color:#fff; }
      .lmx-sheet-text { margin:0; font-size:.94rem; color:rgba(255,255,255,.78); line-height:1.5; }
      .lmx-sheet-row { display:flex; flex-wrap:wrap; gap:8px; }
      .lmx-sheet-close {
        position:sticky; top:0; margin-left:auto; display:block;
      }

      .lmx-empty {
        padding:16px 14px; border-radius:18px;
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06);
        color:rgba(255,255,255,.74);
      }

      .lmx-checkin-overlay {
        position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.46);
        backdrop-filter:blur(10px); display:flex; align-items:flex-end; justify-content:center; padding:18px;
      }
      .lmx-checkin-panel {
        width:min(100%, 430px); border-radius:24px; overflow:hidden;
        border:1px solid rgba(255,255,255,.10);
        background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03)),linear-gradient(180deg, #0b0f15, #080b10);
        box-shadow:0 24px 60px rgba(0,0,0,.40); padding:0 0 16px;
      }
      .lmx-checkin-image { height:180px; background-size:cover; background-position:center center; }
      .lmx-checkin-badge {
        display:inline-flex; margin:14px 16px 0; padding:7px 11px; border-radius:999px;
        font-size:.77rem; font-weight:900; letter-spacing:.04em;
        background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.10);
      }
      .lmx-checkin-title { margin:12px 16px 0; font-size:1.24rem; line-height:1.2; font-weight:900; color:#fff; }
      .lmx-checkin-sub { margin:10px 16px 0; font-size:.95rem; line-height:1.45; color:rgba(255,255,255,.84); }
      .lmx-checkin-actions { display:flex; flex-direction:column; gap:8px; padding:14px 16px 0; }
      .lmx-checkin-btn {
        appearance:none; border:none; outline:none; border-radius:14px; padding:13px 14px; font:inherit; font-weight:800;
        color:#fff; cursor:pointer; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.10);
      }
      .lmx-checkin-btn--primary {
        background:linear-gradient(180deg, rgba(136,171,255,.24), rgba(83,110,255,.12));
      }

      @media (max-width: 640px) {
        .lmx-deck-stage { min-height:500px; height:68vh; }
        .lmx-artist { font-size:1.68rem; }
      }
    `;
    document.head.appendChild(style);
  }

  function openDetailsSheetForEvent(ev) {
    detailsSheetEvent = ev;
    render(lastEvents, lastMeta);
  }

  function closeDetailsSheet() {
    detailsSheetEvent = null;
    render(lastEvents, lastMeta);
  }

  function createModeButton(label, mode) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `lmx-mode${store.activeMode === mode ? " is-on" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      store.activeMode = mode;
      saveStore(store);
      render(lastEvents, lastMeta);
    });
    return btn;
  }

  function buildTopShell(events) {
    const shell = document.createElement("div");
    shell.className = "lmx-shell";

    const top = document.createElement("div");
    top.className = "lmx-top";

    const titleWrap = document.createElement("div");
    titleWrap.className = "lmx-title-wrap";

    const kicker = document.createElement("div");
    kicker.className = "lmx-kicker";
    kicker.innerHTML = `<span class="lmx-kicker-dot"></span><span>Live radar active</span>`;

    const title = document.createElement("h2");
    title.className = "lmx-title";
    title.textContent = "Concerts shaped by your listening";

    const sub = document.createElement("p");
    sub.className = "lmx-sub";
    sub.textContent = `${events.length} relevant concerts across ${cityCount(events)} cities`;

    titleWrap.appendChild(kicker);
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    top.appendChild(titleWrap);
    shell.appendChild(top);

    const modebar = document.createElement("div");
    modebar.className = "lmx-modebar";
    modebar.appendChild(createModeButton("Discover", "discover"));
    modebar.appendChild(createModeButton("Radar", "radar"));
    modebar.appendChild(createModeButton(`Going ${plannedItems.filter((x) => x.plannedStatus === "planned").length}`, "going"));
    modebar.appendChild(createModeButton("Hidden", "hidden"));

    shell.appendChild(modebar);
    return shell;
  }

  function buildDeckCard(item, positionIndex) {
    const card = document.createElement("div");
    card.className = `lmx-card${positionIndex === 1 ? " is-back-1" : positionIndex === 2 ? " is-back-2" : ""}`;

    const cover = document.createElement("div");
    cover.className = "lmx-card-cover";
    cover.style.backgroundImage = item.type === "group"
      ? buildCoverStyle({ imageUrl: item.group.imageUrl, artist: item.group.artist, id: item.group.key })
      : buildCoverStyle(item.event);

    const passLabel = document.createElement("div");
    passLabel.className = "lmx-swipe-label pass";
    passLabel.textContent = "Pass";

    const planLabel = document.createElement("div");
    planLabel.className = "lmx-swipe-label plan";
    planLabel.textContent = "Plan";

    const body = document.createElement("div");
    body.className = "lmx-card-body";

    const top = document.createElement("div");
    top.className = "lmx-chip-row";

    const chipMain = document.createElement("div");
    chipMain.className = "lmx-chip";
    chipMain.textContent = getMatchLabel(item);
    top.appendChild(chipMain);

    if (item.type === "event") {
      const ev = item.event;
      const d = daysUntil(ev.start);
      if (d !== null && d >= 0 && d <= 7) {
        const chip = document.createElement("div");
        chip.className = "lmx-chip";
        chip.textContent = "This Week";
        top.appendChild(chip);
      }
      if (safeStr(ev.city)) {
        const chip = document.createElement("div");
        chip.className = "lmx-chip";
        chip.textContent = safeStr(ev.city);
        top.appendChild(chip);
      }
    } else {
      const chip = document.createElement("div");
      chip.className = "lmx-chip";
      chip.textContent = `${item.group.count} dates`;
      top.appendChild(chip);
    }

    const bottom = document.createElement("div");
    bottom.className = "lmx-card-bottom";

    const artist = document.createElement("h3");
    artist.className = "lmx-artist";
    artist.textContent = titleCaseArtist(normalizeArtistForLookup(item.type === "group" ? item.group.artist : item.event.artist));

    const meta = document.createElement("p");
    meta.className = "lmx-meta";

    const reason = document.createElement("p");
    reason.className = "lmx-reason";

    if (item.type === "group") {
      const first = item.group.events[0];
      const last = item.group.events[item.group.events.length - 1];
      meta.textContent = [
        `${item.group.count} dates`,
        safeStr(first?.city),
        formatMonthDay(first?.start),
        last ? `→ ${formatMonthDay(last.start)}` : ""
      ].filter(Boolean).join(" • ");
      reason.textContent = "Multiple dates for an artist that fits your listening.";
    } else {
      const ev = item.event;
      meta.textContent = [
        safeStr(ev.venue),
        safeStr(ev.city),
        formatShortDayDate(ev.start),
        formatTimeHM(ev.start)
      ].filter(Boolean).join(" • ");
      reason.textContent = safeStr(ev.reason || "Listening-linked recommendation");
    }

    const actions = document.createElement("div");
    actions.className = "lmx-actions";

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "lmx-action lmx-action--hide";
    hideBtn.textContent = "×";
    hideBtn.title = "Hide";

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "lmx-action lmx-action--info lmx-action--big";
    infoBtn.textContent = "Why";

    const planBtn = document.createElement("button");
    planBtn.type = "button";
    planBtn.className = "lmx-action lmx-action--plan";
    planBtn.textContent = "✓";
    planBtn.title = "Plan";

    actions.appendChild(hideBtn);
    actions.appendChild(infoBtn);
    actions.appendChild(planBtn);

    bottom.appendChild(artist);
    bottom.appendChild(meta);
    bottom.appendChild(reason);
    bottom.appendChild(actions);

    body.appendChild(top);
    body.appendChild(bottom);

    card.appendChild(cover);
    card.appendChild(passLabel);
    card.appendChild(planLabel);
    card.appendChild(body);

    const triggerPass = async () => {
      if (item.type === "group") {
        for (const ev of item.group.events) await dismiss(ev.id);
      } else {
        await dismiss(item.event.id);
      }
      store.deckIndex += 1;
      saveStore(store);
      render(lastEvents, lastMeta);
    };

    const triggerPlan = async () => {
      if (item.type === "group") {
        const first = item.group.nextEvent || item.group.events[0];
        if (first && !isPlanned(first.eventKey || first.id)) await addToPlan(first);
      } else {
        if (!isPlanned(item.event.eventKey || item.event.id)) await addToPlan(item.event);
      }
      store.deckIndex += 1;
      saveStore(store);
      await refresh();
    };

    hideBtn.addEventListener("click", triggerPass);
    planBtn.addEventListener("click", triggerPlan);
    infoBtn.addEventListener("click", () => {
      openDetailsSheetForEvent(item.type === "group" ? item.group.nextEvent || item.group.events[0] : item.event);
    });

    attachSwipe(card, {
      onLeft: triggerPass,
      onRight: triggerPlan,
      onUp: () => openDetailsSheetForEvent(item.type === "group" ? item.group.nextEvent || item.group.events[0] : item.event),
      passLabel,
      planLabel
    });

    return card;
  }

  function attachSwipe(card, { onLeft, onRight, onUp, passLabel, planLabel }) {
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;
    let active = false;

    const onPointerDown = (e) => {
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dy = 0;
      card.setPointerCapture?.(e.pointerId);
      card.style.transition = "none";
    };

    const onPointerMove = (e) => {
      if (!active) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;

      const rotate = dx * 0.04;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;

      if (dx < -40) passLabel.classList.add("show");
      else passLabel.classList.remove("show");

      if (dx > 40) planLabel.classList.add("show");
      else planLabel.classList.remove("show");
    };

    const onPointerUp = async () => {
      if (!active) return;
      active = false;
      card.style.transition = "transform .22s ease, opacity .22s ease";
      passLabel.classList.remove("show");
      planLabel.classList.remove("show");

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (dx <= -110 && absX > absY) {
        card.style.transform = `translate(-140%, ${dy}px) rotate(-18deg)`;
        setTimeout(() => { onLeft(); }, 140);
        return;
      }

      if (dx >= 110 && absX > absY) {
        card.style.transform = `translate(140%, ${dy}px) rotate(18deg)`;
        setTimeout(() => { onRight(); }, 140);
        return;
      }

      if (dy <= -90 && absY > absX) {
        card.style.transform = `translate(0px, -22px) scale(.99)`;
        setTimeout(() => {
          card.style.transform = "";
          onUp();
        }, 120);
        return;
      }

      card.style.transform = "";
    };

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", onPointerUp);
  }
function buildDiscover(events) {
    const deck = getDeck(events);
    const wrap = document.createElement("div");
    wrap.className = "lmx-deck-wrap";

    const topIndex = Math.min(store.deckIndex, Math.max(deck.length - 1, 0));
    const visible = deck.slice(topIndex, topIndex + 3);

    const progress = document.createElement("div");
    progress.className = "lmx-deck-progress";

    const left = document.createElement("div");
    left.className = "lmx-progress-text";
    left.textContent = deck.length
      ? `${Math.min(topIndex + 1, deck.length)} / ${deck.length} live matches`
      : "0 live matches";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "lmx-btn";
    resetBtn.textContent = "Restart deck";
    resetBtn.addEventListener("click", () => {
      store.deckIndex = 0;
      saveStore(store);
      render(lastEvents, lastMeta);
    });

    progress.appendChild(left);
    progress.appendChild(resetBtn);
    wrap.appendChild(progress);

    const stage = document.createElement("div");
    stage.className = "lmx-deck-stage";

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "lmx-empty";
      empty.textContent = "You’ve cleared the deck. Jump to Radar or restart the stack.";
      wrap.appendChild(empty);
      return wrap;
    }

    visible
      .slice()
      .reverse()
      .forEach((item, idxFromBack) => {
        const position = visible.length - 1 - idxFromBack;
        stage.appendChild(buildDeckCard(item, position));
      });

    wrap.appendChild(stage);
    return wrap;
  }

  function buildRadar(events) {
    const wrap = document.createElement("div");
    wrap.className = "lmx-radar-grid";

    const cityMap = new Map();
    events.forEach((ev) => {
      const key = safeStr(ev.city) || "Unknown";
      cityMap.set(key, (cityMap.get(key) || 0) + 1);
    });

    const cityBar = document.createElement("div");
    cityBar.className = "lmx-radar-citybar";

    Array.from(cityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .forEach(([city, count]) => {
        const node = document.createElement("div");
        node.className = "lmx-city-node";
        node.innerHTML = `
          <p class="lmx-city-name">${city}</p>
          <p class="lmx-city-count">${count} matches</p>
        `;
        cityBar.appendChild(node);
      });

    wrap.appendChild(cityBar);

    const groups = groupEventsByArtist(events);

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "lmx-empty";
      empty.textContent = "No artist groups available right now.";
      wrap.appendChild(empty);
      return wrap;
    }

    groups.forEach((group) => {
      const shell = document.createElement("div");
      shell.className = `lmx-group${radarExpandedGroupKey === group.key ? " is-open" : ""}`;

      const head = document.createElement("div");
      head.className = "lmx-group-head";

      const thumb = document.createElement("div");
      thumb.className = "lmx-group-thumb";
      thumb.style.backgroundImage = buildCoverStyle({
        imageUrl: group.imageUrl,
        artist: group.artist,
        id: group.key
      });

      const main = document.createElement("div");
      main.className = "lmx-group-main";

      const title = document.createElement("h3");
      title.className = "lmx-group-title";
      title.textContent = titleCaseArtist(normalizeArtistForLookup(group.artist));

      const sub = document.createElement("p");
      sub.className = "lmx-group-sub";
      sub.textContent = group.count > 1
        ? `${group.count} dates • ${formatMonthDay(group.events[0].start)} → ${formatMonthDay(group.events[group.events.length - 1].start)}`
        : `${safeStr(group.nextEvent?.city)} • ${safeStr(group.nextEvent?.venue)} • ${formatShortDayDate(group.nextEvent?.start)}`;

      main.appendChild(title);
      main.appendChild(sub);

      const cta = document.createElement("button");
      cta.type = "button";
      cta.className = "lmx-group-cta";
      cta.textContent = radarExpandedGroupKey === group.key ? "Hide dates" : "View dates";

      head.appendChild(thumb);
      head.appendChild(main);
      head.appendChild(cta);

      const dates = document.createElement("div");
      dates.className = "lmx-group-dates";

      group.events.forEach((ev) => {
        const row = document.createElement("div");
        row.className = "lmx-date-row";

        const left = document.createElement("div");
        left.className = "lmx-date-left";

        const t1 = document.createElement("p");
        t1.className = "lmx-date-title";
        t1.textContent = `${formatShortDayDate(ev.start)} • ${formatTimeHM(ev.start)}`;

        const t2 = document.createElement("p");
        t2.className = "lmx-date-sub";
        t2.textContent = [safeStr(ev.venue), safeStr(ev.city), safeStr(ev.reason)].filter(Boolean).join(" • ");

        left.appendChild(t1);
        left.appendChild(t2);

        const actions = document.createElement("div");
        actions.className = "lmx-date-actions";

        const planBtn = document.createElement("button");
        planBtn.type = "button";
        planBtn.className = `lmx-btn${isPlanned(ev.eventKey || ev.id) ? "" : " lmx-btn--plan"}`;
        planBtn.textContent = isPlanned(ev.eventKey || ev.id) ? "Planned" : "Plan";
        planBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!isPlanned(ev.eventKey || ev.id)) {
            await addToPlan(ev);
            await refresh();
          }
        });

        const whyBtn = document.createElement("button");
        whyBtn.type = "button";
        whyBtn.className = "lmx-btn lmx-btn--primary";
        whyBtn.textContent = "Why";
        whyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openDetailsSheetForEvent(ev);
        });

        const ticketBtn = document.createElement("button");
        ticketBtn.type = "button";
        ticketBtn.className = "lmx-btn";
        ticketBtn.textContent = "Tickets";
        ticketBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (ev.url) window.open(ev.url, "_blank", "noopener,noreferrer");
        });

        actions.appendChild(planBtn);
        actions.appendChild(whyBtn);
        actions.appendChild(ticketBtn);

        row.appendChild(left);
        row.appendChild(actions);
        dates.appendChild(row);
      });

      head.addEventListener("click", () => {
        radarExpandedGroupKey = radarExpandedGroupKey === group.key ? "" : group.key;
        render(lastEvents, lastMeta);
      });

      shell.appendChild(head);
      shell.appendChild(dates);
      wrap.appendChild(shell);
    });

    return wrap;
  }

  function buildGoing(events) {
    const wrap = document.createElement("div");
    wrap.className = "lmx-going-list";

    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "lmx-empty";
      empty.textContent = "Nothing planned yet. Swipe right on Discover to build your live calendar.";
      wrap.appendChild(empty);
      return wrap;
    }

    events.forEach((ev) => {
      const card = document.createElement("div");
      card.className = "lmx-itinerary";

      const dateBadge = document.createElement("div");
      dateBadge.className = "lmx-date-badge";

      const d = document.createElement("div");
      d.className = "lmx-date-badge-day";
      d.textContent = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", day: "numeric" }).format(ev.start);

      const m = document.createElement("div");
      m.className = "lmx-date-badge-month";
      m.textContent = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", month: "short" }).format(ev.start);

      dateBadge.appendChild(d);
      dateBadge.appendChild(m);

      const main = document.createElement("div");
      main.className = "lmx-itinerary-main";

      const title = document.createElement("h3");
      title.className = "lmx-itinerary-title";
      title.textContent = titleCaseArtist(normalizeArtistForLookup(ev.artist));

      const sub1 = document.createElement("p");
      sub1.className = "lmx-itinerary-sub";
      sub1.textContent = [safeStr(ev.venue), safeStr(ev.city)].filter(Boolean).join(" • ");

      const sub2 = document.createElement("p");
      sub2.className = "lmx-itinerary-sub";
      sub2.textContent = [formatLongDate(ev.start), formatTimeHM(ev.start)].filter(Boolean).join(" • ");

      const actions = document.createElement("div");
      actions.className = "lmx-itinerary-actions";

      const whyBtn = document.createElement("button");
      whyBtn.type = "button";
      whyBtn.className = "lmx-btn lmx-btn--primary";
      whyBtn.textContent = "Why";
      whyBtn.addEventListener("click", () => openDetailsSheetForEvent(ev));

      const ticketBtn = document.createElement("button");
      ticketBtn.type = "button";
      ticketBtn.className = "lmx-btn";
      ticketBtn.textContent = "Tickets";
      ticketBtn.addEventListener("click", () => {
        if (ev.url) window.open(ev.url, "_blank", "noopener,noreferrer");
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "lmx-btn lmx-btn--danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", async () => {
        await removeFromPlan(ev.eventKey || ev.id);
        await refresh();
      });

      actions.appendChild(whyBtn);
      actions.appendChild(ticketBtn);
      actions.appendChild(removeBtn);

      main.appendChild(title);
      main.appendChild(sub1);
      main.appendChild(sub2);
      main.appendChild(actions);

      card.appendChild(dateBadge);
      card.appendChild(main);
      wrap.appendChild(card);
    });

    return wrap;
  }

  function buildHidden(events) {
    const wrap = document.createElement("div");
    wrap.className = "lmx-hidden-list";

    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "lmx-empty";
      empty.textContent = "You haven't hidden anything yet.";
      wrap.appendChild(empty);
      return wrap;
    }

    events.forEach((ev) => {
      const card = document.createElement("div");
      card.className = "lmx-itinerary";

      const dateBadge = document.createElement("div");
      dateBadge.className = "lmx-date-badge";
      dateBadge.innerHTML = `
        <div class="lmx-date-badge-day">×</div>
        <div class="lmx-date-badge-month">HIDDEN</div>
      `;

      const main = document.createElement("div");
      main.className = "lmx-itinerary-main";

      const title = document.createElement("h3");
      title.className = "lmx-itinerary-title";
      title.textContent = titleCaseArtist(normalizeArtistForLookup(ev.artist));

      const sub1 = document.createElement("p");
      sub1.className = "lmx-itinerary-sub";
      sub1.textContent = [safeStr(ev.venue), safeStr(ev.city), formatShortDayDate(ev.start)].filter(Boolean).join(" • ");

      const actions = document.createElement("div");
      actions.className = "lmx-itinerary-actions";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "lmx-btn lmx-btn--primary";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", async () => {
        await undismiss(ev.id);
        render(lastEvents, lastMeta);
      });

      const whyBtn = document.createElement("button");
      whyBtn.type = "button";
      whyBtn.className = "lmx-btn";
      whyBtn.textContent = "Why";
      whyBtn.addEventListener("click", () => openDetailsSheetForEvent(ev));

      actions.appendChild(restoreBtn);
      actions.appendChild(whyBtn);

      main.appendChild(title);
      main.appendChild(sub1);
      main.appendChild(actions);

      card.appendChild(dateBadge);
      card.appendChild(main);
      wrap.appendChild(card);
    });

    return wrap;
  }

  function buildDetailsSheet(ev) {
    if (!ev) return null;

    const overlay = document.createElement("div");
    overlay.className = "lmx-sheet";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDetailsSheet();
    });

    const panel = document.createElement("div");
    panel.className = "lmx-sheet-panel";

    const cover = document.createElement("div");
    cover.className = "lmx-sheet-cover";
    cover.style.backgroundImage = buildCoverStyle(ev);

    const body = document.createElement("div");
    body.className = "lmx-sheet-body";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lmx-btn lmx-sheet-close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", closeDetailsSheet);

    const title = document.createElement("h3");
    title.className = "lmx-sheet-title";
    title.textContent = titleCaseArtist(normalizeArtistForLookup(ev.artist));

    const meta = document.createElement("p");
    meta.className = "lmx-sheet-text";
    meta.textContent = [safeStr(ev.venue), safeStr(ev.city), formatLongDate(ev.start), formatTimeHM(ev.start)].filter(Boolean).join(" • ");

    const why = document.createElement("p");
    why.className = "lmx-sheet-text";
    why.textContent = `Why this: ${safeStr(ev.reason || "Listening-linked recommendation")}`;

    const score = document.createElement("p");
    score.className = "lmx-sheet-text";
    score.textContent = [
      ev.tier === "strong" ? "Strong match" : "Suggested match",
      ev.score ? `Score ${Math.round(ev.score)}` : "",
      ev.matchedBy ? `Matched by ${ev.matchedBy}` : ""
    ].filter(Boolean).join(" • ");

    const row = document.createElement("div");
    row.className = "lmx-sheet-row";

    const planBtn = document.createElement("button");
    planBtn.type = "button";
    planBtn.className = `lmx-btn${isPlanned(ev.eventKey || ev.id) ? "" : " lmx-btn--plan"}`;
    planBtn.textContent = isPlanned(ev.eventKey || ev.id) ? "Planned" : "Plan";
    planBtn.addEventListener("click", async () => {
      if (!isPlanned(ev.eventKey || ev.id)) {
        await addToPlan(ev);
        await refresh();
      }
    });

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "lmx-btn lmx-btn--danger";
    hideBtn.textContent = "Hide";
    hideBtn.addEventListener("click", async () => {
      await dismiss(ev.id);
      closeDetailsSheet();
      render(lastEvents, lastMeta);
    });

    const ticketBtn = document.createElement("button");
    ticketBtn.type = "button";
    ticketBtn.className = "lmx-btn lmx-btn--primary";
    ticketBtn.textContent = "Tickets";
    ticketBtn.addEventListener("click", () => {
      if (ev.url) window.open(ev.url, "_blank", "noopener,noreferrer");
    });

    row.appendChild(planBtn);
    row.appendChild(hideBtn);
    row.appendChild(ticketBtn);

    body.appendChild(closeBtn);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(why);
    body.appendChild(score);
    body.appendChild(row);

    panel.appendChild(cover);
    panel.appendChild(body);
    overlay.appendChild(panel);
    return overlay;
  }

  function render(events, meta) {
    lastEvents = Array.isArray(events) ? events : [];
    lastMeta = meta || null;

    const split = splitVisibleEventsByState(lastEvents);
    const top = buildTopShell(lastEvents);

    listEl.innerHTML = "";
    listEl.appendChild(top);

    if (store.activeMode === "discover") {
      listEl.appendChild(buildDiscover(split.announced));
    } else if (store.activeMode === "radar") {
      listEl.appendChild(buildRadar(split.announced));
    } else if (store.activeMode === "going") {
      listEl.appendChild(buildGoing(split.planned));
    } else {
      listEl.appendChild(buildHidden(split.hidden));
    }

    const sheet = buildDetailsSheet(detailsSheetEvent);
    if (sheet) document.body.appendChild(sheet);
  }

  async function refresh() {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    const existingSheet = document.querySelector(".lmx-sheet");
    if (existingSheet) existingSheet.remove();

    setEmpty("Refreshing concert radar…");

    const [recommendedPayload, plannedDbEvents] = await Promise.all([
      fetchJson(getRecommendedUrl()),
      loadPlannedConcerts()
    ]);

    const mapped = extractWorkerEvents(recommendedPayload);
    const merged = mergeRecommendedWithPlanned(mapped, plannedDbEvents);
    const enriched = await enrichEventsWithImages(merged);

    pendingPromptBusy = false;
    if (store.deckIndex >= getDeck(splitVisibleEventsByState(enriched).announced).length) {
      store.deckIndex = 0;
      saveStore(store);
    }

    render(enriched, recommendedPayload?.meta || null);
    updatePendingPromptState();
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

  injectStylesOnce();
  wireConcertsTabRefresh();

  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    get plannedItems() { return plannedItems; },
    get pendingPromptItem() { return pendingPromptItem; },
    forceRefresh() { refresh().catch(() => {}); }
  };

  refresh().catch((e) => {
    setEmpty(`Failed to refresh. ${safeStr(e?.message || "")}`.trim());
  });
})();