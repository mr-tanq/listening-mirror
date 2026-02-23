/* econcerts.js (FULL FILE REPLACE) — 3 PARTS (copy/paste in order)
   ✅ Uses LIVE2 taste worker (/econcerts) which pulls from AICON + scores by Last.fm
   ✅ Shows ONLY: Matches (score>=scoreMin) + Recommendations (0<score<scoreMin)
   ✅ Keeps Plan / Dismissed workflow
   ✅ Controls: City / scoreMin / tasteArtists (persisted)
   ✅ Sort: Date / City (persisted)
   ✅ Title Case artist display
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  function isValidDate(d) {
    return d instanceof Date && !Number.isNaN(d.getTime());
  }

  // DD.MM.YYYY • HH:mm in Europe/Amsterdam
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

  const lowerKey = (s) => String(s || "").trim().toLowerCase();
  const safeStr = (s) => String(s || "").trim();

  // Score icon (no numeric score shown; numeric only in tooltip)
  function scoreIcon(score) {
    const s = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
    if (s >= 85) return "🔥";
    if (s >= 70) return "✨";
    if (s >= 55) return "👍";
    if (s >= 40) return "👀";
    return "·";
  }

  // -------- Title Case (strict) for artist display ----------
  function titleCaseArtist(input) {
    const s0 = safeStr(input);
    if (!s0) return "";

    const KEEP_UPPER = new Set([
      "DJ","MC","II","III","IV","V","VI","VII","VIII","IX","X",
      "USA","UK","EU","EP","LP","TV","DJ'S"
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

  // ---------- Storage ----------
  const STORE_KEY = "lm_econcerts_ui_v11_live2_matches_reco";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return {
          planIds: [],
          dismissedIds: [],
          lastRefreshAt: 0,
          baseApi: "",
          activeTab: "matches",    // matches | reco | plan | dismissed
          sortMode: "date",        // date | city
          city: "Utrecht",         // default
          scoreMin: 10,            // matches threshold
          tasteArtists: 2000,      // Last.fm top artists fetch size
          size: 400,               // how many events to request (server limits apply)
        };
      }
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        baseApi: String(obj.baseApi || ""),
        activeTab: ["matches", "reco", "plan", "dismissed"].includes(String(obj.activeTab))
          ? String(obj.activeTab)
          : "matches",
        sortMode: (String(obj.sortMode) === "city" || String(obj.sortMode) === "date")
          ? String(obj.sortMode)
          : "date",
        city: String(obj.city || "Utrecht"),
        scoreMin: clampInt(obj.scoreMin, 10, 0, 100),
        tasteArtists: clampInt(obj.tasteArtists, 2000, 50, 3000),
        size: clampInt(obj.size, 400, 50, 2000),
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        baseApi: "",
        activeTab: "matches",
        sortMode: "date",
        city: "Utrecht",
        scoreMin: 10,
        tasteArtists: 2000,
        size: 400,
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();

  // ---------- LIVE2 Worker base ----------
  // Prefer window.LIVE2_BASE_API, else window.BASE_API, else fallback.
  // Example: https://live2.errtanq9.workers.dev
  const FALLBACK_BASE_API = "https://live2.errtanq9.workers.dev";

  function getBaseApi() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow =
      (typeof w.LIVE2_BASE_API === "string" ? w.LIVE2_BASE_API : "") ||
      (typeof w.BASE_API === "string" ? w.BASE_API : "");
    const fromStore = (store && typeof store.baseApi === "string") ? store.baseApi : "";
    const base = (fromWindow || fromStore || FALLBACK_BASE_API).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- LIVE2 fetch ----------
  async function fetchJson(url) {
    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && (data.error || data.message))
        ? String(data.error || data.message)
        : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function extractEventsArray(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.events)) return payload.events;
    if (payload.data && Array.isArray(payload.data.events)) return payload.data.events;
    return [];
  }

  function parseEventStart(ev) {
    // LIVE2 typically returns start (ISO) + startTs
    const ts = Number(ev?.startTs || 0);
    if (Number.isFinite(ts) && ts > 0) return new Date(ts);
    const iso = safeStr(ev?.start);
    const d = iso ? new Date(iso) : null;
    if (d && isValidDate(d)) return d;
    const ymd = safeStr(ev?.date);
    const d2 = ymd ? new Date(ymd) : null;
    return (d2 && isValidDate(d2)) ? d2 : new Date(0);
  }

  async function fetchConcertsFromWorker(overrides = {}) {
    const base = getBaseApi();

    const city = safeStr(overrides.city ?? store.city ?? "Utrecht") || "Utrecht";
    const scoreMin = clampInt(overrides.scoreMin ?? store.scoreMin, 10, 0, 100);
    const tasteArtists = clampInt(overrides.tasteArtists ?? store.tasteArtists, 2000, 50, 3000);
    const size = clampInt(overrides.size ?? store.size, 400, 50, 2000);

    const u = new URL(base + "/econcerts");
    u.searchParams.set("city", city);
    u.searchParams.set("scoreMin", String(scoreMin));
    u.searchParams.set("tasteArtists", String(tasteArtists));
    u.searchParams.set("size", String(size));

    const data = await fetchJson(u.toString());
    if (!data || data.ok !== true) {
      throw new Error("LIVE2 returned invalid payload");
    }

    const arr = extractEventsArray(data);

    const mapped = (Array.isArray(arr) ? arr : []).map((ev) => {
      const artist = safeStr(ev?.artist);
      const venue = safeStr(ev?.venue);
      const cityOut = safeStr(ev?.city || city);
      const urlStr = safeStr(ev?.url);
      const start = parseEventStart(ev);

      const id = safeStr(ev?.id) || ("live2_" + hashId([artist, venue, cityOut, String(start.getTime()), urlStr].join("|")));

      return {
        id,
        artist,
        attractions: Array.isArray(ev?.attractions) ? ev.attractions : [],
        city: cityOut,
        venue,
        start,
        url: urlStr,

        plays: Number(ev?.plays || 0) || 0,
        score: Number(ev?.score || 0) || 0,
        matched: safeStr(ev?.matched || ""),   // LIVE2 may return "matched"
        startTs: isValidDate(start) ? start.getTime() : 0,
        source: safeStr(ev?.source || "live2"),
        star: !!ev?.star,
      };
    }).filter(x => x.id && x.artist && isValidDate(x.start));

    // persist controls
    store.city = city;
    store.scoreMin = scoreMin;
    store.tasteArtists = tasteArtists;
    store.size = size;
    saveStore(store);

    return { events: mapped, meta: data?.meta || { city, endpoint: u.toString() } };
  }

  // -------------------------
  // Dedupe (kept)
  // -------------------------
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
    return [lowerKey(ev.artist), String(timeBucket(ts)), lowerKey(ev.city)].join("|");
  }
  function pickBetterEvent(a, b) {
    const aVip = isVipUrl(a.url);
    const bVip = isVipUrl(b.url);
    if (aVip !== bVip) return aVip ? b : a;

    const aSub = venueLooksLikeSubRoom(a.venue);
    const bSub = venueLooksLikeSubRoom(b.venue);
    if (aSub !== bSub) return aSub ? b : a;

    const aMeta = (a.venue ? 1 : 0) + (a.city ? 1 : 0) + (a.attractions?.length ? 1 : 0);
    const bMeta = (b.venue ? 1 : 0) + (b.city ? 1 : 0) + (b.attractions?.length ? 1 : 0);
    if (aMeta !== bMeta) return bMeta > aMeta ? b : a;

    const aScore = Number(a.score || 0);
    const bScore = Number(b.score || 0);
    if (aScore !== bScore) return bScore > aScore ? b : a;

    const aPlays = Number(a.plays || 0);
    const bPlays = Number(b.plays || 0);
    if (aPlays !== bPlays) return bPlays > aPlays ? b : a;

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

  // ---------- State + UI nodes ----------
  let lastEvents = [];
  let lastMeta = null;

  const listEl = $("#econcertsList");
  const legacyRefreshBtn = $("#econcertsRefresh");
  const legacyGroupBtn = $("#econcertsToggleGroup");

  if (!listEl) return;

  if (legacyRefreshBtn) legacyRefreshBtn.style.display = "none";
  if (legacyGroupBtn) legacyGroupBtn.style.display = "none";

  try {
    const root = listEl.closest(".tabPanel") || document;
    const allBtns = Array.from(root.querySelectorAll("button"));
    for (const b of allBtns) {
      const t = safeStr(b.textContent).toLowerCase();
      if (t === "reset dismissed" || t === "ma venues: only whitelist" || t === "ma venues: all") {
        b.style.display = "none";
      }
    }
  } catch {}

  // ---------- Top bar (tabs + controls) ----------
  const tabsWrapId = "econcertsInnerTabs";
  let tabsWrap = document.getElementById(tabsWrapId);

  if (!tabsWrap) {
    tabsWrap = document.createElement("div");
    tabsWrap.id = tabsWrapId;
    tabsWrap.style.display = "flex";
    tabsWrap.style.gap = "10px";
    tabsWrap.style.alignItems = "center";
    tabsWrap.style.justifyContent = "space-between";
    tabsWrap.style.flexWrap = "wrap";
    tabsWrap.style.margin = "10px 0 14px";

    listEl.parentElement?.insertBefore(tabsWrap, listEl);
  } else {
    tabsWrap.innerHTML = "";
  }

  const leftTabs = document.createElement("div");
  leftTabs.style.display = "flex";
  leftTabs.style.gap = "10px";
  leftTabs.style.alignItems = "center";
  leftTabs.style.flexWrap = "wrap";

  const rightControls = document.createElement("div");
  rightControls.style.display = "flex";
  rightControls.style.gap = "10px";
  rightControls.style.alignItems = "center";
  rightControls.style.flexWrap = "wrap";
  rightControls.style.justifyContent = "flex-end";

  tabsWrap.appendChild(leftTabs);
  tabsWrap.appendChild(rightControls);

  function makeTabBtn(label, tabKey) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "eBtn ghost";
    btn.textContent = label;
    btn.dataset.tab = tabKey;
    btn.style.borderRadius = "999px";

    btn.addEventListener("click", () => {
      store.activeTab = tabKey;
      saveStore(store);
      updateTabsUI();
      render(lastEvents);
    });

    return btn;
  }

  const tabMatches = makeTabBtn("Matches", "matches");
  const tabReco = makeTabBtn("Recommendations", "reco");
  const tabPlan = makeTabBtn("Plan", "plan");
  const tabDismissed = makeTabBtn("Dismissed", "dismissed");

  leftTabs.appendChild(tabMatches);
  leftTabs.appendChild(tabReco);
  leftTabs.appendChild(tabPlan);
  leftTabs.appendChild(tabDismissed);

  const sortBtn = document.createElement("button");
  sortBtn.type = "button";
  sortBtn.className = "eBtn ghost";
  sortBtn.style.borderRadius = "999px";

  function updateSortBtn() {
    const mode = store.sortMode || "date";
    sortBtn.textContent = mode === "city" ? "Sort: City" : "Sort: Date";
    sortBtn.setAttribute("aria-pressed", mode === "city" ? "true" : "false");
  }
  updateSortBtn();

  sortBtn.addEventListener("click", () => {
    store.sortMode = (store.sortMode === "city") ? "date" : "city";
    saveStore(store);
    updateSortBtn();
    render(lastEvents);
  });

  leftTabs.appendChild(sortBtn);

  // ---------- Controls (City / scoreMin / tasteArtists) ----------
  function makeMiniInput(placeholder, value, widthPx = 110) {
    const inp = document.createElement("input");
    inp.placeholder = placeholder;
    inp.value = String(value ?? "");
    inp.className = "eInput";
    inp.style.width = widthPx + "px";
    inp.style.maxWidth = "52vw";
    inp.style.borderRadius = "999px";
    inp.style.padding = "10px 12px";
    inp.style.border = "1px solid var(--line, #242830)";
    inp.style.background = "var(--pill2, #101216)";
    inp.style.color = "var(--text, #e9e9ea)";
    return inp;
  }

  const cityInput = makeMiniInput("City", store.city || "Utrecht", 130);
  const scoreMinInput = makeMiniInput("scoreMin", store.scoreMin ?? 10, 90);
  const tasteArtistsInput = makeMiniInput("tasteArtists", store.tasteArtists ?? 2000, 120);

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "eBtn";
  applyBtn.style.borderRadius = "999px";
  applyBtn.textContent = "Apply";

  applyBtn.addEventListener("click", () => {
    const nextCity = safeStr(cityInput.value) || store.city || "Utrecht";
    const nextScoreMin = clampInt(scoreMinInput.value, store.scoreMin ?? 10, 0, 100);
    const nextTasteArtists = clampInt(tasteArtistsInput.value, store.tasteArtists ?? 2000, 50, 3000);

    store.city = nextCity;
    store.scoreMin = nextScoreMin;
    store.tasteArtists = nextTasteArtists;
    saveStore(store);

    refresh({ city: nextCity, scoreMin: nextScoreMin, tasteArtists: nextTasteArtists }).catch(() => {});
  });

  rightControls.appendChild(cityInput);
  rightControls.appendChild(scoreMinInput);
  rightControls.appendChild(tasteArtistsInput);
  rightControls.appendChild(applyBtn);

  function updateTabsUI() {
    const active = store.activeTab || "matches";
    for (const btn of [tabMatches, tabReco, tabPlan, tabDismissed]) {
      const on = btn.dataset.tab === active;
      btn.className = on ? "eBtn" : "eBtn ghost";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    updateSortBtn();
  }

  updateTabsUI();

  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    get lastMeta() { return lastMeta; },
    setBaseApi(next) {
      store.baseApi = String(next || "").trim();
      saveStore(store);
    },
    setCity(nextCity) {
      store.city = String(nextCity || "").trim();
      saveStore(store);
      cityInput.value = store.city;
    },
    forceRefresh() {
      refresh().catch(() => {});
    }
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

  async function undismiss(id) {
    store.dismissedIds = store.dismissedIds.filter(x => x !== id);
    saveStore(store);
  }

  function setEmpty(msg) {
    listEl.innerHTML = `<div class="eEmpty">${msg}</div>`;
  }

  function pill(text, opts = {}) {
    const div = document.createElement("div");
    div.className = "ePill";
    div.textContent = text;
    if (opts.title) div.title = String(opts.title);
    return div;
  }

  function buildCard(event) {
    const card = document.createElement("div");
    card.className = "eCard";
    card.dataset.id = event.id;

    const main = document.createElement("div");
    main.className = "eMain";

    const artist = document.createElement("div");
    artist.className = "eArtist";
    artist.textContent = titleCaseArtist(event.artist);

    const meta = document.createElement("div");
    meta.className = "eMeta";
    const venuePart = event.venue ? ` • ${event.venue}` : "";
    meta.textContent = `${formatDateTime(event.start)} • ${event.city}${venuePart}`;

    const pills = document.createElement("div");
    pills.className = "ePills";

    const plays = Number(event.plays || 0);
    const score = Math.max(0, Math.min(100, Math.round(Number(event.score || 0))));
    pills.appendChild(pill(`Plays: ${plays}`));
    pills.appendChild(pill(`${scoreIcon(score)}`, { title: `Score: ${score}` }));

    if (event.star) pills.appendChild(pill("⭐", { title: "Star (very high plays)" }));
    if (event.matched) pills.appendChild(pill(`Matched: ${event.matched}`, { title: "Best matched artist name" }));

    main.appendChild(artist);
    main.appendChild(meta);
    main.appendChild(pills);

    const right = document.createElement("div");
    right.className = "eRight";

    const actions = document.createElement("div");
    actions.className = "eActions";

    if (event.url) {
      const btnLink = document.createElement("button");
      btnLink.className = "eBtn ghost";
      btnLink.type = "button";
      btnLink.textContent = "Link";
      btnLink.addEventListener("click", () => {
        window.open(event.url, "_blank", "noopener,noreferrer");
      });
      actions.appendChild(btnLink);
    }

    const planned = isPlanned(event.id);
    const tab = store.activeTab || "matches";

    // For Matches/Reco tabs: same controls as "Announced" had
    if (tab === "matches" || tab === "reco") {
      const btnDismiss = document.createElement("button");
      btnDismiss.className = "eBtn ghost";
      btnDismiss.type = "button";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents);
      });

      const btnPlan = document.createElement("button");
      btnPlan.className = "eBtn";
      btnPlan.type = "button";
      btnPlan.textContent = planned ? "Remove from plan" : "Add to plan";
      btnPlan.addEventListener("click", async () => {
        if (planned) await removeFromPlan(event.id);
        else await addToPlan(event.id);
        render(lastEvents);
      });

      actions.appendChild(btnDismiss);
      actions.appendChild(btnPlan);
    }

    if (tab === "plan") {
      const btnRemove = document.createElement("button");
      btnRemove.className = "eBtn";
      btnRemove.type = "button";
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", async () => {
        await removeFromPlan(event.id);
        render(lastEvents);
      });

      const btnDismiss = document.createElement("button");
      btnDismiss.className = "eBtn ghost";
      btnDismiss.type = "button";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents);
      });

      actions.appendChild(btnDismiss);
      actions.appendChild(btnRemove);
    }

    if (tab === "dismissed") {
      const btnPlan = document.createElement("button");
      btnPlan.className = "eBtn ghost";
      btnPlan.type = "button";
      btnPlan.textContent = planned ? "Remove from plan" : "Add to plan";
      btnPlan.addEventListener("click", async () => {
        if (planned) await removeFromPlan(event.id);
        else await addToPlan(event.id);
        render(lastEvents);
      });

      const btnBack = document.createElement("button");
      btnBack.className = "eBtn";
      btnBack.type = "button";
      btnBack.textContent = "Undo dismiss";
      btnBack.addEventListener("click", async () => {
        await undismiss(event.id);
        render(lastEvents);
      });

      actions.appendChild(btnPlan);
      actions.appendChild(btnBack);
    }

    right.appendChild(actions);

    card.appendChild(main);
    card.appendChild(right);

    return card;
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

  function classifyVisible(events) {
    const plannedIds = new Set(store.planIds);
    const dismissedIds = new Set(store.dismissedIds);

    const planned = [];
    const dismissed = [];
    const pool = [];

    for (const ev of events) {
      const id = ev.id;
      if (dismissedIds.has(id)) {
        dismissed.push(ev);
        continue;
      }
      if (plannedIds.has(id)) {
        planned.push(ev);
        continue;
      }
      pool.push(ev);
    }

    const scoreMin = clampInt(store.scoreMin, 10, 0, 100);

    const matches = [];
    const reco = [];

    for (const ev of pool) {
      const score = Number(ev.score || 0) || 0;
      if (score >= scoreMin) matches.push(ev);
      else if (score > 0 && score < scoreMin) reco.push(ev);
    }

    return { matches, reco, planned, dismissed };
  }

  function render(events) {
    updateTabsUI();

    const tab = store.activeTab || "matches";
    const mode = store.sortMode || "date";
    const sorter = (mode === "city") ? sortCityThenTimeAsc : sortChronoAsc;

    const { matches, reco, planned, dismissed } = classifyVisible(events);

    matches.sort(sorter);
    reco.sort(sorter);
    planned.sort(sorter);
    dismissed.sort(sorter);

    tabMatches.textContent = `Matches (${matches.length})`;
    tabReco.textContent = `Recommendations (${reco.length})`;
    tabPlan.textContent = `Plan (${planned.length})`;
    tabDismissed.textContent = `Dismissed (${dismissed.length})`;

    let visible = matches;
    let title = "Matches";
    let subtitle = `Only shows that match your listening (score ≥ ${clampInt(store.scoreMin, 10, 0, 100)}).`;

    if (tab === "reco") {
      visible = reco;
      title = "Recommendations";
      subtitle = `Near matches (0 < score < ${clampInt(store.scoreMin, 10, 0, 100)}).`;
    } else if (tab === "plan") {
      visible = planned;
      title = "Plan";
      subtitle = "Shows you saved.";
    } else if (tab === "dismissed") {
      visible = dismissed;
      title = "Dismissed";
      subtitle = "Shows you dismissed.";
    }

    // Sort subtitle hint
    subtitle += (mode === "city")
      ? " (Sorted by city, then date.)"
      : " (Sorted by date.)";

    listEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "ePill";
    header.textContent = title;
    header.style.justifyContent = "center";
    header.style.fontWeight = "800";
    header.style.opacity = ".95";
    listEl.appendChild(header);

    const sub = document.createElement("div");
    sub.className = "eEmpty";
    sub.textContent = subtitle;
    listEl.appendChild(sub);

    // Helpful empty messages for Matches/Reco
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "eEmpty";

      if (tab === "matches") {
        empty.textContent = "No matches found for your taste in this city (try lowering scoreMin or changing city).";
      } else if (tab === "reco") {
        empty.textContent = "No recommendations found (this tab only shows near-misses).";
      } else {
        empty.textContent = "Empty";
      }

      listEl.appendChild(empty);
      return;
    }

    for (const ev of visible) {
      listEl.appendChild(buildCard(ev));
    }
  }

  async function refresh(overrides = {}) {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing…");

    try {
      const { events: rawEvents, meta } = await fetchConcertsFromWorker(overrides);
      const events = dedupeEvents(rawEvents);

      lastEvents = events;
      lastMeta = meta;

      render(events);
    } catch (err) {
      console.warn("[eConcerts] LIVE2 fetch failed:", err);
      lastEvents = [];
      lastMeta = null;
      setEmpty(`Worker error: ${String(err && err.message ? err.message : err)}`);
    }
  }

  function wireMainTabAutoRefresh() {
    const tabBtn = document.querySelector('.tabBtn[data-tab="econcerts"]');
    if (!tabBtn) return;

    tabBtn.addEventListener("click", () => {
      refresh().catch(() => {});
    }, { passive: true });
  }

  wireMainTabAutoRefresh();

  // initial refresh
  refresh().catch(() => setEmpty("Failed to refresh."));
   // -------------------------
  // Utilities
  // -------------------------
  function clampInt(v, def, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    const i = Math.trunc(n);
    return Math.max(min, Math.min(max, i));
  }

  function hashId(str) {
    const s = String(str || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

})();
