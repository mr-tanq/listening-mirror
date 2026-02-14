/* econcerts.js (FULL FILE REPLACE) — PART 1/4
   Premium/minimal + venue star + source label
*/
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel)); // kept for future
  const pad2 = (n) => String(n).padStart(2, "0");

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatDateTime(d) {
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${y}-${m}-${dd} • ${hh}:${mm}`;
  }

  function lowerKey(s) {
    return String(s || "").trim().toLowerCase();
  }
  function safeStr(s) {
    return String(s || "").trim();
  }

  // ---------- Your preferred venues (star only) ----------
  // Keep names as they appear; matching is "soft" (lowercase contains).
  const PREFERRED_VENUES = [
    "tivolivredenburg",
    "paradiso",
    "melkweg",
    "013",
    "patronaat",
    "paard",
    "de heiling",
    "doornroosje",
    "neushoorn",
    "fluor",
    "db's",
    "muziekgieterij",
    "ekko",
    "zonnehuis",
    "carré",
    "concertgebouw",
    "musicon",
    "afas",
    "ziggo dome",
  ].map(lowerKey);

  function isPreferredVenue(venueName) {
    const v = lowerKey(venueName);
    if (!v) return false;
    // contains match so "AFAS Live" will match "afas", etc.
    return PREFERRED_VENUES.some((p) => p && v.includes(p));
  }

  function formatSource(src) {
    const s = lowerKey(src);
    if (s === "bandsintown" || s === "bit") return "BIT";
    if (s === "ticketmaster" || s === "tm") return "TM";
    return (src || "").toUpperCase();
  }

  // ---------- Storage ----------
  const STORE_KEY = "lm_econcerts_v4";
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { planIds: [], dismissedIds: [], lastRefreshAt: 0, groupByCity: true, baseApi: "" };
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        groupByCity: Boolean(obj.groupByCity ?? true),
        baseApi: String(obj.baseApi || ""),
      };
    } catch {
      return { planIds: [], dismissedIds: [], lastRefreshAt: 0, groupByCity: true, baseApi: "" };
    }
  }
  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }
  let store = loadStore();

  // ---------- Cloudflare Worker base ----------
  const FALLBACK_BASE_API = "https://live.errtanq9.workers.dev";
  function getBaseApi() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.BASE_API === "string" ? w.BASE_API : "";
    const fromStore = (store && typeof store.baseApi === "string") ? store.baseApi : "";
    const base = (fromWindow || fromStore || FALLBACK_BASE_API).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- Defaults (NL-wide) ----------
  const ECONCERTS_DEFAULTS = {
    size: 200,
    radiusKm: 30,
    scoreMin: 50,
    tasteArtists: 1000,
    bitArtists: 60,     // how many Last.fm artists to query on Bandsintown
    city: "",           // empty => whole NL
    countryCode: "NL",
    sources: "tm,bit",  // both
  };

  async function fetchConcertsFromWorker(overrides = {}) {
    const cfg = { ...ECONCERTS_DEFAULTS, ...overrides };
    const base = getBaseApi();

    const u = new URL(base + "/econcerts");
    u.searchParams.set("size", String(cfg.size));
    u.searchParams.set("scoreMin", String(cfg.scoreMin));
    u.searchParams.set("tasteArtists", String(cfg.tasteArtists));
    u.searchParams.set("countryCode", String(cfg.countryCode || "NL"));
    u.searchParams.set("sources", String(cfg.sources || "tm,bit"));
    u.searchParams.set("bitArtists", String(cfg.bitArtists || 60));

    const city = safeStr(cfg.city);
    if (city) {
      u.searchParams.set("city", city);
      u.searchParams.set("radiusKm", String(cfg.radiusKm));
    }

    const res = await fetch(u.toString(), { method: "GET" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data || data.ok !== true) {
      const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const events = Array.isArray(data.events) ? data.events : [];
    return events.map(ev => ({
      id: safeStr(ev.id),
      artist: safeStr(ev.artist),
      attractions: Array.isArray(ev.attractions) ? ev.attractions : [],
      city: safeStr(ev.city),
      venue: safeStr(ev.venue),
      start: new Date(safeStr(ev.start)),
      url: safeStr(ev.url),
      country: "NL",

      plays: Number(ev.plays || 0),
      tier: safeStr(ev.tier || "discovery"),
      score: Number(ev.score || 0),
      level: safeStr(ev.level || ""),
      startTs: Number(ev.startTs || 0),
      source: safeStr(ev.source || ""),
    })).filter(x => x.id && x.artist && x.start instanceof Date && !Number.isNaN(x.start.getTime()));
  }

  // ---------- Tier fallback ----------
  function tierFromPlays(plays) {
    if (plays >= 120) return "core";
    if (plays >= 40) return "known";
    if (plays >= 10) return "maybe";
    return "discovery";
  }
  function baseScoreFromTier(tier) {
    if (tier === "core") return 72;
    if (tier === "known") return 58;
    if (tier === "maybe") return 45;
    return 32;
  }
/* econcerts.js (FULL FILE REPLACE) — PART 2/4 */

  // ---------- Shift cycle rules ----------
  const REF_LOCAL = new Date(2025, 9, 18, 0, 0, 0, 0);
  const SHIFT_BY_DAY = [
    { code: "OFF1", label: "Off (Day 1)", type: "off" },
    { code: "OFF2", label: "Off (Day 2)", type: "off" },
    { code: "OFF3", label: "Off (Day 3)", type: "off" },
    { code: "OFF4", label: "Off (Day 4)", type: "off", lastDayOff: true },
    { code: "M1", label: "Morning (1st) 07:00–15:00", type: "morning" },
    { code: "M2", label: "Morning (2nd) 07:00–15:00", type: "morning", secondMorning: true },
    { code: "A1", label: "Afternoon (1st) 15:00–23:00", type: "afternoon" },
    { code: "A2", label: "Afternoon (2nd) 15:00–23:00", type: "afternoon" },
    { code: "N1", label: "Night (1st) 23:00–07:00", type: "night" },
    { code: "N2", label: "Night (2nd) 23:00–07:00", type: "night" },
  ];

  function dayIndexInCycle(dateLocalMidnight) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const d0 = new Date(dateLocalMidnight.getFullYear(), dateLocalMidnight.getMonth(), dateLocalMidnight.getDate(), 0, 0, 0, 0);
    const r0 = new Date(REF_LOCAL.getFullYear(), REF_LOCAL.getMonth(), REF_LOCAL.getDate(), 0, 0, 0, 0);
    const diffDays = Math.floor((d0.getTime() - r0.getTime()) / msPerDay);
    return ((diffDays % 10) + 10) % 10;
  }

  function shiftForDate(dateLocal) {
    const d0 = new Date(dateLocal.getFullYear(), dateLocal.getMonth(), dateLocal.getDate(), 0, 0, 0, 0);
    return SHIFT_BY_DAY[dayIndexInCycle(d0)];
  }

  function availabilityBadgeForEvent(eventStart) {
    const shift = shiftForDate(eventStart);
    const hour = eventStart.getHours();

    let badge = "FREE";
    let why = "Looks doable";

    if (shift.type === "night") {
      if (hour >= 0 && hour <= 22) { badge = "CONFLICT"; why = "Night shift starts 23:00 today"; }
    } else if (shift.type === "afternoon") {
      if (hour >= 15) { badge = "CONFLICT"; why = "Afternoon shift ends 23:00"; }
    } else if (shift.type === "morning") {
      badge = "OK"; why = "Morning shift — evening is free";
    } else if (shift.type === "off") {
      badge = "FREE"; why = "Off day";
    }

    if (shift.lastDayOff && badge === "FREE") {
      badge = "HARD";
      why = "Last day off — early wake-up next day";
    }

    // Your rule: 2nd morning => MEDIUM (not easy)
    if (shift.secondMorning) {
      if (badge === "FREE" || badge === "OK") {
        badge = "MEDIUM";
        why = "2nd morning — doable but not easy";
      }
    }

    return { badge, why, shift };
  }

  // ---------- Dedupe (client-side safety) ----------
  function isVipUrl(url) {
    const u = lowerKey(url);
    return u.includes("vip") || u.includes("package") || u.includes("packages");
  }
  function softKey(ev) {
    const ts = Number(ev.startTs || 0) || ev.start.getTime();
    return [lowerKey(ev.artist), String(ts), lowerKey(ev.city), lowerKey(ev.venue)].join("|");
  }
  function pickBetterEvent(a, b) {
    const aVip = isVipUrl(a.url);
    const bVip = isVipUrl(b.url);
    if (aVip !== bVip) return aVip ? b : a;

    const aMeta = (a.venue ? 1 : 0) + (a.city ? 1 : 0) + (a.attractions?.length ? 1 : 0);
    const bMeta = (b.venue ? 1 : 0) + (b.city ? 1 : 0) + (b.attractions?.length ? 1 : 0);
    if (aMeta !== bMeta) return bMeta > aMeta ? b : a;

    const aScore = Number(a.score || 0);
    const bScore = Number(b.score || 0);
    if (aScore !== bScore) return bScore > aScore ? b : a;

    // prefer TM if everything else equal
    if (a.source !== b.source) {
      if (lowerKey(a.source) === "ticketmaster") return a;
      if (lowerKey(b.source) === "ticketmaster") return b;
    }
    return a;
  }
  function dedupeEvents(events) {
    const byId = new Map();
    for (const ev of events) {
      if (!ev?.id) continue;
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
/* econcerts.js (FULL FILE REPLACE) — PART 3/4 */

  // state
  let lastEvents = [];

  // UI nodes
  const listEl = $("#econcertsList");
  const refreshBtn = $("#econcertsRefresh");
  const groupBtn = $("#econcertsToggleGroup");
  if (!listEl || !refreshBtn || !groupBtn) return;

  // init group button
  groupBtn.setAttribute("aria-pressed", store.groupByCity ? "true" : "false");
  groupBtn.textContent = store.groupByCity ? "Group by city" : "Ungroup";

  // Reset dismissed
  const resetBtn = document.createElement("button");
  resetBtn.className = "eBtn ghost";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset dismissed";
  resetBtn.title = "Bring back events you dismissed (does not affect My Plan)";
  if (refreshBtn?.parentElement) refreshBtn.parentElement.appendChild(resetBtn);

  resetBtn.addEventListener("click", () => {
    store.dismissedIds = [];
    saveStore(store);
    render(lastEvents);
  });

  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    setBaseApi(next) { store.baseApi = safeStr(next); saveStore(store); },
    fetchNearUtrecht() { return refresh({ city: "Utrecht", radiusKm: 30 }); },
  };

  const isPlanned = (id) => store.planIds.includes(id);
  const isDismissed = (id) => store.dismissedIds.includes(id);

  async function addToPlan(id) {
    if (!store.planIds.includes(id)) store.planIds.push(id);
    store.dismissedIds = store.dismissedIds.filter(x => x !== id);
    saveStore(store);
  }
  async function dismiss(id) {
    if (!store.dismissedIds.includes(id)) store.dismissedIds.push(id);
    store.planIds = store.planIds.filter(x => x !== id);
    saveStore(store);
  }
  async function removeFromPlan(id) {
    store.planIds = store.planIds.filter(x => x !== id);
    saveStore(store);
  }

  function setEmpty(msg) {
    listEl.innerHTML = `<div class="eEmpty">${msg}</div>`;
  }

  function pill(text) {
    const div = document.createElement("div");
    div.className = "ePill";
    div.textContent = text;
    return div;
  }

  function computePriority(event) {
    const plays = Number(event.plays || 0);
    const tier = event.tier || tierFromPlays(plays);

    let score = Number.isFinite(event.score) ? Number(event.score) : baseScoreFromTier(tier);

    const av = availabilityBadgeForEvent(event.start);
    if (av.badge === "CONFLICT") score -= 18;
    if (av.badge === "HARD") score -= 8;
    if (av.badge === "MEDIUM") score += 2;

    // Only Utrecht gets +
    if (lowerKey(event.city) === "utrecht") score += 4;

    score = Math.max(0, Math.min(100, Math.round(score)));
    return { score, tier, plays, availability: av };
  }

  function buildCard(event, computed) {
    const { score, tier, plays, availability } = computed;
    const { badge, why, shift } = availability;

    const card = document.createElement("div");
    card.className = "eCard";
    card.dataset.id = event.id;

    const main = document.createElement("div");
    main.className = "eMain";

    const artist = document.createElement("div");
    artist.className = "eArtist";
    artist.textContent = event.artist;

    // ★ only for preferred venues (no extra text)
    const venueStar = isPreferredVenue(event.venue) ? " ★" : "";

    const meta = document.createElement("div");
    meta.className = "eMeta";
    meta.textContent = `${formatDateTime(event.start)}  •  ${event.city}  •  ${event.venue}${venueStar}`;

    const meta2 = document.createElement("div");
    meta2.className = "eMeta2";
    meta2.textContent = `Shift: ${shift.label} • ${why}`;

    const pills = document.createElement("div");
    pills.className = "ePills";
    pills.appendChild(pill(`Tier: ${tier}`));
    pills.appendChild(pill(`Plays: ${plays}`));
    pills.appendChild(pill(`Src: ${formatSource(event.source)}`));

    main.appendChild(artist);
    main.appendChild(meta);
    main.appendChild(meta2);
    main.appendChild(pills);

    const right = document.createElement("div");
    right.className = "eRight";

    const scoreEl = document.createElement("div");
    scoreEl.className = "eScore";
    scoreEl.textContent = `${score}/100`;

    const badgeEl = document.createElement("div");
    badgeEl.className = "eBadge";
    badgeEl.textContent = badge;

    const actions = document.createElement("div");
    actions.className = "eActions";

    const btnPrimary = document.createElement("button");
    btnPrimary.className = "eBtn";
    btnPrimary.type = "button";

    const btnSecondary = document.createElement("button");
    btnSecondary.className = "eBtn ghost";
    btnSecondary.type = "button";

    const planned = isPlanned(event.id);

    if (!planned) {
      btnPrimary.textContent = "Add to plan";
      btnSecondary.textContent = "Dismiss";
      btnPrimary.addEventListener("click", async () => { await addToPlan(event.id); render(lastEvents); });
      btnSecondary.addEventListener("click", async () => { await dismiss(event.id); render(lastEvents); });
    } else {
      btnPrimary.textContent = "Remove";
      btnSecondary.textContent = "Dismiss";
      btnPrimary.addEventListener("click", async () => { await removeFromPlan(event.id); render(lastEvents); });
      btnSecondary.addEventListener("click", async () => { await dismiss(event.id); render(lastEvents); });
    }

    if (event.url) {
      const btnLink = document.createElement("button");
      btnLink.className = "eBtn ghost";
      btnLink.type = "button";
      btnLink.textContent = "Link";
      btnLink.addEventListener("click", () => window.open(event.url, "_blank", "noopener,noreferrer"));
      actions.appendChild(btnLink);
    }

    actions.appendChild(btnSecondary);
    actions.appendChild(btnPrimary);

    right.appendChild(scoreEl);
    right.appendChild(badgeEl);
    right.appendChild(actions);

    card.appendChild(main);
    card.appendChild(right);

    return card;
  }

  function groupByCity(events) {
    const map = new Map();
    for (const ev of events) {
      const key = ev.city || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }
/* econcerts.js (FULL FILE REPLACE) — PART 4/4 */

  function render(events) {
    const visible = events.filter(ev => (isPlanned(ev.id) ? true : !isDismissed(ev.id)));

    const computedMap = new Map();
    for (const ev of visible) computedMap.set(ev.id, computePriority(ev));

    visible.sort((a, b) => {
      const ca = computedMap.get(a.id).score;
      const cb = computedMap.get(b.id).score;
      if (cb !== ca) return cb - ca;
      return a.start.getTime() - b.start.getTime();
    });

    if (!visible.length) {
      setEmpty("No events yet. Tap Refresh.");
      return;
    }

    const planned = visible.filter(ev => isPlanned(ev.id));
    const suggested = visible.filter(ev => !isPlanned(ev.id));

    listEl.innerHTML = "";

    const addSection = (title, arr) => {
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gap = "10px";

      const h = document.createElement("div");
      h.className = "ePill";
      h.textContent = title;
      h.style.justifyContent = "center";
      h.style.fontWeight = "800";
      h.style.opacity = ".95";

      wrap.appendChild(h);

      if (!arr.length) {
        const empty = document.createElement("div");
        empty.className = "eEmpty";
        empty.textContent = "Empty";
        wrap.appendChild(empty);
      } else if (!store.groupByCity) {
        for (const ev of arr) wrap.appendChild(buildCard(ev, computedMap.get(ev.id)));
      } else {
        const grouped = groupByCity(arr);
        for (const [city, items] of grouped) {
          const cityPill = document.createElement("div");
          cityPill.className = "ePill";
          cityPill.textContent = `${city} • ${items.length} event(s)`;
          cityPill.style.opacity = ".85";
          wrap.appendChild(cityPill);

          items.sort((a, b) => a.start.getTime() - b.start.getTime());
          for (const ev of items) wrap.appendChild(buildCard(ev, computedMap.get(ev.id)));
        }
      }
      listEl.appendChild(wrap);
    };

    addSection("My Plan", planned);
    addSection("Upcoming", suggested);
  }

  async function refresh(overrides = {}) {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing…");

    try {
      const raw = await fetchConcertsFromWorker(overrides);
      const events = dedupeEvents(raw);
      lastEvents = events;
      render(events);
    } catch (err) {
      console.warn("[eConcerts] worker fetch failed:", err);
      lastEvents = [];
      setEmpty(`Worker error: ${String(err && err.message ? err.message : err)}`);
    }
  }

  // Group toggle
  groupBtn.addEventListener("click", async () => {
    store.groupByCity = !store.groupByCity;
    saveStore(store);

    groupBtn.setAttribute("aria-pressed", store.groupByCity ? "true" : "false");
    groupBtn.textContent = store.groupByCity ? "Group by city" : "Ungroup";

    render(lastEvents);
  });

  // Refresh
  refreshBtn.addEventListener("click", async () => {
    await refresh(); // NL-wide default
  });

  refresh().catch(() => setEmpty("Failed to refresh."));

  function wireTabAutoRefresh() {
    const tabBtn = document.querySelector('.tabBtn[data-tab="econcerts"]');
    if (!tabBtn) return;

    tabBtn.addEventListener("click", () => {
      const hasCards = listEl.querySelector(".eCard");
      if (!hasCards) refresh().catch(() => {});
    }, { passive: true });
  }
  wireTabAutoRefresh();

  function debugShiftForNextDays() {
    const out = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 0, 0, 0, 0);
      const sh = shiftForDate(d);
      out.push(`${toISODate(d)} -> ${sh.code}`);
    }
    // console.log("[eConcerts] shift preview:", out);
  }
  debugShiftForNextDays();
})();