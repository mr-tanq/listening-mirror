/* econcerts.js — FULL FILE REPLACE
   Listening Mirror — Concerts tab
   UX: Discover / Radar / Going / Hidden
   Includes:
   - swipe deck
   - artist radar
   - city chip filtering
   - going itinerary
   - hidden list
   - details sheet
   - post-show check-in popup
   - toasts
   - skeleton loading
   - softer transitions
*/

(() => {
  "use strict";

  const listEl = document.querySelector("#econcertsList");
  if (!listEl) return;

  const STORE_KEY = "lm_econcerts_ui_v72_polish_pack";
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

    const KEEP_AS_IS = new Set([
      "dEUS", "MØ", "A$AP", "V.I.C.", "DJ", "MC", "II", "III", "IV", "UK", "USA", "EU"
    ]);

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

  function dayNum(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      day: "numeric"
    }).format(d);
  }

  function monthShort(d) {
    if (!isValidDate(d)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      month: "short"
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
          deckIndex: 0,
          selectedRadarCity: ""
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
        deckIndex: Math.max(0, Number(obj.deckIndex || 0)),
        selectedRadarCity: safeStr(obj.selectedRadarCity)
      };
    } catch {
      return {
        activeMode: "discover",
        dismissedIds: [],
        lastRefreshAt: 0,
        snoozedPendingEventKey: "",
        deckIndex: 0,
        selectedRadarCity: ""
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
  let isRefreshing = false;
  let currentLoadingMode = "";
  let optimisticPlannedKeys = new Set();

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
    return await Promise.all(
      events.map(async (ev) => {
        const imageUrl = await resolveImageForEvent(ev);
        return { ...ev, imageUrl: imageUrl || "" };
      })
    );
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

  async function apiAddToPlan(event) {
    const payload = buildPlannedPayload(event);

    await fetchJson(`${ARCHIVE_BASE}/planned-concerts/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  async function apiRemoveFromPlan(eventKey) {
    await fetchJson(`${ARCHIVE_BASE}/planned-concerts/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_key: safeStr(eventKey) })
    });
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

  function addOptimisticPlannedEvent(event) {
    const normalized = normalizePlannedEvent({
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
      image_url: safeStr(event?.imageUrl),
      status: "planned",
      notes: ""
    });

    if (!normalized) return;

    plannedMap.set(normalized.eventKey, normalized);

    const idx = plannedItems.findIndex((x) => x.eventKey === normalized.eventKey);
    if (idx >= 0) plannedItems[idx] = normalized;
    else plannedItems.push(normalized);

    plannedItems.sort((a, b) => a.startTs - b.startTs);
    optimisticPlannedKeys.add(normalized.eventKey);
  }

  function removeOptimisticPlannedEvent(eventKey) {
    const key = safeStr(eventKey);
    if (!key) return;

    plannedMap.delete(key);
    plannedItems = plannedItems.filter((x) => x.eventKey !== key);
    optimisticPlannedKeys.delete(key);
  }

  async function handlePlanEvent(event, opts = {}) {
    const key = safeStr(event?.eventKey || event?.id);
    if (!key) return;
    if (isPlanned(key)) return;

    addOptimisticPlannedEvent(event);
    showToast("Added to Plan");
    render(lastEvents, lastMeta);

    if (opts.advanceDeck) {
      store.deckIndex += 1;
      saveStore(store);
      render(lastEvents, lastMeta);
    }

    try {
      await apiAddToPlan(event);
      await refresh({ silent: true, keepSheet: true });
    } catch (e) {
      removeOptimisticPlannedEvent(key);
      render(lastEvents, lastMeta);
      showToast(`Could not add to Plan${safeStr(e?.message) ? ` · ${safeStr(e.message)}` : ""}`, true);
    }
  }

  async function handleRemovePlan(eventKey) {
    const key = safeStr(eventKey);
    if (!key) return;

    const backup = plannedMap.get(key) || null;
    removeOptimisticPlannedEvent(key);
    render(lastEvents, lastMeta);
    showToast("Removed from Plan");

    try {
      await apiRemoveFromPlan(key);
      await refresh({ silent: true, keepSheet: true });
    } catch (e) {
      if (backup) {
        plannedMap.set(backup.eventKey, backup);
        plannedItems.push(backup);
        plannedItems.sort((a, b) => a.startTs - b.startTs);
      }
      render(lastEvents, lastMeta);
      showToast(`Could not remove${safeStr(e?.message) ? ` · ${safeStr(e.message)}` : ""}`, true);
    }
  }

  const isPlanned = (eventKey) => plannedMap.has(safeStr(eventKey));

  async function dismiss(id) {
    if (!store.dismissedIds.includes(id)) {
      store.dismissedIds.push(id);
      saveStore(store);
    }
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
      if (dismissedIds.has(ev.id)) hidden.push(ev);
      else if (isPlanned(ev.eventKey || ev.id)) planned.push(ev);
      else announced.push(ev);
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
      showToast("Moved to Archive");
      await refresh({ silent: true });
    } catch (e) {
      pendingPromptBusy = false;
      renderPendingPrompt();
      showToast(`Could not move to Archive${safeStr(e?.message) ? ` · ${safeStr(e.message)}` : ""}`, true);
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
      showToast("Removed from planned concerts");
      await refresh({ silent: true });
    } catch (e) {
      pendingPromptBusy = false;
      renderPendingPrompt();
      showToast(`Could not mark as missed${safeStr(e?.message) ? ` · ${safeStr(e.message)}` : ""}`, true);
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
    title.textContent = `Did you go to ${titleCaseArtist(normalizeArtistForLookup(ev.artist))}?`;

    const sub = document.createElement("p");
    sub.className = "lmx-checkin-sub";
    sub.textContent = [
      formatLongDate(ev.start),
      formatTimeHM(ev.start),
      safeStr(ev.venue),
      safeStr(ev.city)
    ].filter(Boolean).join(" • ");

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

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);

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

  function scoreClass(score, tier) {
    if (tier === "strong" || Number(score || 0) >= 80) return "high";
    if (Number(score || 0) >= 45) return "mid";
    return "low";
  }

  function removeExistingDetailsSheet() {
    document.querySelectorAll(".lmx-sheet").forEach((el) => el.remove());
  }

  function removeExistingToast() {
    document.querySelectorAll(".lmx-toast").forEach((el) => el.remove());
  }

  function showToast(message, isError = false) {
    removeExistingToast();

    const el = document.createElement("div");
    el.className = `lmx-toast${isError ? " is-error" : ""}`;
    el.textContent = safeStr(message) || (isError ? "Something went wrong" : "Done");

    document.body.appendChild(el);

    window.setTimeout(() => {
      el.classList.add("is-out");
      window.setTimeout(() => el.remove(), 240);
    }, 2200);
  }

  function renderLoadingSkeleton(mode = "discover") {
    const shell = document.createElement("div");
    shell.className = "lmx-shell lmx-fade-in";

    const top = document.createElement("div");
    top.className = "lmx-top";
    top.innerHTML = `
      <div class="lmx-title-wrap">
        <div class="lmx-kicker"><span class="lmx-kicker-dot"></span><span>Refreshing radar</span></div>
        <h2 class="lmx-title">Concerts shaped by your listening</h2>
        <p class="lmx-sub">Loading live matches…</p>
      </div>
    `;
    shell.appendChild(top);

    const modebar = document.createElement("div");
    modebar.className = "lmx-modebar";
    ["Discover", "Radar", "Going", "Hidden"].forEach((label, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `lmx-mode${idx === 0 ? " is-on" : ""}`;
      btn.textContent = label;
      modebar.appendChild(btn);
    });
    shell.appendChild(modebar);

    if (mode === "discover") {
      const wrap = document.createElement("div");
      wrap.className = "lmx-deck-wrap";

      const progress = document.createElement("div");
      progress.className = "lmx-deck-progress";
      progress.innerHTML = `
        <div class="lmx-progress-text">Loading live matches…</div>
        <button type="button" class="lmx-btn" disabled>Loading</button>
      `;
      wrap.appendChild(progress);

      const stage = document.createElement("div");
      stage.className = "lmx-deck-stage";

      for (let i = 2; i >= 0; i -= 1) {
        const card = document.createElement("div");
        card.className = `lmx-card lmx-skeleton-card${i === 1 ? " is-back-1" : i === 2 ? " is-back-2" : ""}`;
        card.innerHTML = `
          <div class="lmx-skeleton-surface"></div>
          <div class="lmx-card-body">
            <div class="lmx-chip-row">
              <div class="lmx-skeleton-pill skeleton-shimmer"></div>
              <div class="lmx-skeleton-pill skeleton-shimmer short"></div>
            </div>
            <div class="lmx-card-bottom">
              <div class="lmx-skeleton-line skeleton-shimmer big"></div>
              <div class="lmx-skeleton-line skeleton-shimmer mid"></div>
              <div class="lmx-skeleton-line skeleton-shimmer small"></div>
              <div class="lmx-actions">
                <div class="lmx-skeleton-circle skeleton-shimmer"></div>
                <div class="lmx-skeleton-pill skeleton-shimmer midwide"></div>
                <div class="lmx-skeleton-circle skeleton-shimmer"></div>
              </div>
            </div>
          </div>
        `;
        stage.appendChild(card);
      }

      wrap.appendChild(stage);
      shell.appendChild(wrap);
    } else {
      const list = document.createElement("div");
      list.className = "lmx-skeleton-list";

      const count = mode === "radar" ? 5 : 4;
      for (let i = 0; i < count; i += 1) {
        const row = document.createElement("div");
        row.className = "lmx-skeleton-row";
        row.innerHTML = `
          <div class="lmx-skeleton-thumb skeleton-shimmer"></div>
          <div class="lmx-skeleton-col">
            <div class="lmx-skeleton-line skeleton-shimmer mid"></div>
            <div class="lmx-skeleton-line skeleton-shimmer small"></div>
            <div class="lmx-skeleton-line skeleton-shimmer xs"></div>
          </div>
        `;
        list.appendChild(row);
      }

      shell.appendChild(list);
    }

    listEl.innerHTML = "";
    listEl.appendChild(shell);
  }

  function openDetailsSheetForEvent(ev) {
    detailsSheetEvent = ev;
    removeExistingDetailsSheet();
    render(lastEvents, lastMeta);
  }

  function closeDetailsSheet() {
    detailsSheetEvent = null;
    removeExistingDetailsSheet();
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
    kicker.innerHTML = `<span class="lmx-kicker-dot"></span><span>${isRefreshing ? "Refreshing radar" : "Live radar active"}</span>`;

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
    const ev = item.type === "group" ? (item.group.nextEvent || item.group.events[0]) : item.event;
    const card = document.createElement("div");
    card.className = `lmx-card lmx-fade-in${positionIndex === 1 ? " is-back-1" : positionIndex === 2 ? " is-back-2" : ""}`;

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

    const score = document.createElement("div");
    score.className = `lmx-score-pill ${scoreClass(ev?.score, ev?.tier)}`;
    score.textContent = ev?.score ? Math.round(ev.score) : "•";
    top.appendChild(score);

    if (item.type === "event") {
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
        for (const x of item.group.events) await dismiss(x.id);
      } else {
        await dismiss(item.event.id);
      }
      showToast("Hidden from Discover");
      store.deckIndex += 1;
      saveStore(store);
      render(lastEvents, lastMeta);
    };

    const triggerPlan = async () => {
      if (item.type === "group") {
        const first = item.group.nextEvent || item.group.events[0];
        if (first && !isPlanned(first.eventKey || first.id)) {
          await handlePlanEvent(first, { advanceDeck: true });
          return;
        }
      } else {
        if (!isPlanned(item.event.eventKey || item.event.id)) {
          await handlePlanEvent(item.event, { advanceDeck: true });
          return;
        }
      }
      store.deckIndex += 1;
      saveStore(store);
      render(lastEvents, lastMeta);
    };

    hideBtn.addEventListener("click", triggerPass);
    planBtn.addEventListener("click", triggerPlan);
    infoBtn.addEventListener("click", () => {
      openDetailsSheetForEvent(ev);
    });

    attachSwipe(card, {
      onLeft: triggerPass,
      onRight: triggerPlan,
      onUp: () => openDetailsSheetForEvent(ev),
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

    const onPointerUp = () => {
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

    const safeIndex = Math.min(store.deckIndex, Math.max(deck.length - 1, 0));
    if (safeIndex !== store.deckIndex) {
      store.deckIndex = safeIndex;
      saveStore(store);
    }

    const visible = deck.slice(store.deckIndex, store.deckIndex + 3);

    const progress = document.createElement("div");
    progress.className = "lmx-deck-progress";

    const left = document.createElement("div");
    left.className = "lmx-progress-text";
    left.textContent = deck.length
      ? `${Math.min(store.deckIndex + 1, deck.length)} / ${deck.length} live matches`
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

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "lmx-empty";
      empty.textContent = "You’ve cleared the deck. Jump to Radar or restart the stack.";
      wrap.appendChild(empty);
      return wrap;
    }

    const stage = document.createElement("div");
    stage.className = "lmx-deck-stage";

    visible.slice().reverse().forEach((item, idxFromBack) => {
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

    const cityEntries = Array.from(cityMap.entries()).sort((a, b) => b[1] - a[1]);
    const cityBar = document.createElement("div");
    cityBar.className = "lmx-radar-citybar";

    if (cityEntries.length) {
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = `lmx-city-node${!store.selectedRadarCity ? " is-on" : ""}`;
      allBtn.innerHTML = `
        <p class="lmx-city-name">All cities</p>
        <p class="lmx-city-count">${events.length} matches</p>
      `;
      allBtn.addEventListener("click", () => {
        store.selectedRadarCity = "";
        saveStore(store);
        render(lastEvents, lastMeta);
      });
      cityBar.appendChild(allBtn);
    }

    cityEntries.slice(0, 8).forEach(([city, count]) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `lmx-city-node${store.selectedRadarCity === city ? " is-on" : ""}`;
      node.innerHTML = `
        <p class="lmx-city-name">${city}</p>
        <p class="lmx-city-count">${count} matches</p>
      `;
      node.addEventListener("click", () => {
        store.selectedRadarCity = store.selectedRadarCity === city ? "" : city;
        saveStore(store);
        render(lastEvents, lastMeta);
      });
      cityBar.appendChild(node);
    });

    wrap.appendChild(cityBar);

    const filteredEvents = store.selectedRadarCity
      ? events.filter((ev) => safeStr(ev.city) === store.selectedRadarCity)
      : events;

    const groups = groupEventsByArtist(filteredEvents);

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "lmx-empty";
      empty.textContent = store.selectedRadarCity
        ? `No matches in ${store.selectedRadarCity} right now.`
        : "No artist groups available right now.";
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
            await handlePlanEvent(ev);
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
      d.textContent = dayNum(ev.start);

      const m = document.createElement("div");
      m.className = "lmx-date-badge-month";
      m.textContent = monthShort(ev.start);

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
        await handleRemovePlan(ev.eventKey || ev.id);
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
        showToast("Restored to Discover");
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

    const panel = document.createElement("div");
    panel.className = "lmx-sheet-panel";

    overlay.addEventListener("click", (e) => {
      if (!panel.contains(e.target)) closeDetailsSheet();
    });

    const cover = document.createElement("div");
    cover.className = "lmx-sheet-cover";
    cover.style.backgroundImage = buildCoverStyle(ev);

    const body = document.createElement("div");
    body.className = "lmx-sheet-body";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lmx-btn lmx-sheet-close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDetailsSheet();
    });

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
      ev.tier === "strong" ? "Strong match" : ev.tier === "planned" ? "Planned" : "Suggested match",
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
        await handlePlanEvent(ev);
      }
    });

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "lmx-btn lmx-btn--danger";
    hideBtn.textContent = "Hide";
    hideBtn.addEventListener("click", async () => {
      await dismiss(ev.id);
      showToast("Hidden from Discover");
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
    removeExistingDetailsSheet();

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

    if (detailsSheetEvent) {
      const latestDetailsEvent =
        lastEvents.find((x) => x.id === detailsSheetEvent.id) || detailsSheetEvent;

      const sheet = buildDetailsSheet(latestDetailsEvent);
      if (sheet) document.body.appendChild(sheet);
    }

    updatePendingPromptState();
  }

  async function refresh(options = {}) {
    const { silent = false, keepSheet = false } = options;

    if (isRefreshing) return;
    isRefreshing = true;

    try {
      if (!silent) {
        currentLoadingMode = store.activeMode || "discover";
        renderLoadingSkeleton(currentLoadingMode);
      }

      const [recommendedPayload, plannedDbEvents] = await Promise.all([
        fetchJson(getRecommendedUrl()),
        loadPlannedConcerts()
      ]);

      let recommended = extractWorkerEvents(recommendedPayload);
      recommended = await enrichEventsWithImages(recommended);

      const merged = mergeRecommendedWithPlanned(recommended, plannedDbEvents);

      store.lastRefreshAt = Date.now();
      saveStore(store);

      if (!keepSheet) {
        detailsSheetEvent = null;
      }

      render(merged, {
        total: merged.length,
        refreshedAt: Date.now()
      });
    } catch (e) {
      console.error("[econcerts] refresh failed", e);

      listEl.innerHTML = "";

      const shell = document.createElement("div");
      shell.className = "lmx-shell";

      const empty = document.createElement("div");
      empty.className = "lmx-empty";
      empty.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:1rem;font-weight:900;color:#fff;">Couldn’t load concerts</div>
          <div style="color:rgba(255,255,255,.72);font-size:.92rem;">
            ${safeStr(e?.message) || "Something went wrong while loading the concert radar."}
          </div>
          <div>
            <button type="button" class="lmx-btn lmx-btn--primary" id="lmxRetryBtn">
              Try again
            </button>
          </div>
        </div>
      `;

      shell.appendChild(empty);
      listEl.appendChild(shell);

      const retryBtn = document.getElementById("lmxRetryBtn");
      if (retryBtn) {
        retryBtn.addEventListener("click", () => {
          refresh();
        });
      }

      showToast(`Refresh failed${safeStr(e?.message) ? ` · ${safeStr(e.message)}` : ""}`, true);
    } finally {
      isRefreshing = false;
      pendingPromptBusy = false;
    }
  }

  function wireConcertsTabRefresh() {
    const btn =
      document.querySelector("#tabConcerts") ||
      document.querySelector('[data-view="viewConcerts"]');

    if (!btn) return;

    btn.addEventListener("click", () => {
      refresh({ silent: false }).catch(() => {});
    }, { passive: true });
  }

  injectStylesOnce();
  wireConcertsTabRefresh();

  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    get plannedItems() { return plannedItems; },
    get pendingPromptItem() { return pendingPromptItem; },
    forceRefresh() { refresh({ silent: false }).catch(() => {}); }
  };

  renderLoadingSkeleton(store.activeMode || "discover");
  refresh({ silent: false }).catch(() => {});
})();
