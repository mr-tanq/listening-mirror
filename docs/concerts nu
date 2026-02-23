/* econcerts.js (FULL FILE REPLACE) — SINGLE PART ✅
   ✅ NL-wide (no city input): queries multiple Dutch cities and merges results
   ✅ Uses LIVE2 worker: https://live2.errtanq9.workers.dev/econcerts
   ✅ Shows ONLY matches by default (scoreMin=10)
   ✅ Optional: small recommendations bucket (low-score) based on your taste list
   ✅ Keeps UI tabs: Announced / Plan / Dismissed
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
  const STORE_KEY = "lm_econcerts_ui_v11_live2_nlwide";

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
          sortMode: "date",       // date | city
          onlyMatches: true,      // ✅ new: only matches vs matches+recs
        };
      }
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        baseApi: String(obj.baseApi || ""),
        activeTab: ["announced", "plan", "dismissed"].includes(String(obj.activeTab))
          ? String(obj.activeTab)
          : "announced",
        sortMode: (String(obj.sortMode) === "city" || String(obj.sortMode) === "date")
          ? String(obj.sortMode)
          : "date",
        onlyMatches: (typeof obj.onlyMatches === "boolean") ? obj.onlyMatches : true,
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        baseApi: "",
        activeTab: "announced",
        sortMode: "date",
        onlyMatches: true,
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();

  // ---------- LIVE2 Worker base ----------
  const FALLBACK_BASE_API = "https://live2.errtanq9.workers.dev";

  function getBaseApi() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.LIVE2_BASE_API === "string" ? w.LIVE2_BASE_API
      : (typeof w.BASE_API === "string" ? w.BASE_API : "");
    const fromStore = (store && typeof store.baseApi === "string") ? store.baseApi : "";
    const base = (fromWindow || fromStore || FALLBACK_BASE_API).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- NL city list ----------
  // You can add/remove cities any time. Keep it sane to stay fast.
  // These are MetalAgenda slugs (lowercase).
  const NL_CITIES = [
    "amsterdam",
    "utrecht",
    "rotterdam",
    "tilburg",
    "eindhoven",
    "nijmegen",
    "groningen",
    "denhaag",
    "haarlem",
    "zwolle",
    "arnhem",
    "maastricht",
    "breda",
    "leiden",
    "amersfoort",
    "enschede",
  ];

  // ---------- LIVE2 query defaults ----------
  const LIVE2_DEFAULTS = {
    sizePerCity: 60,
    tasteArtists: 25, // ✅ user asked fast path
    scoreMinMatches: 10, // only matches
    scoreMinRecs: 1,     // show a few suggestions above 0 if available
    recMax: 10,          // cap recommendations bucket size
    concurrency: 5,      // be polite
  };

  // ---------- Networking ----------
  async function fetchJson(url) {
    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function parseIsoToDate(s) {
    const t = safeStr(s);
    if (!t) return null;
    const d = new Date(t);
    return isValidDate(d) ? d : null;
  }

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

    return {
      id,
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
    };
  }

  function buildLive2Url(citySlug, opts) {
    const base = getBaseApi();
    const u = new URL(base + "/econcerts");
    u.searchParams.set("city", citySlug);
    u.searchParams.set("tasteArtists", String(opts.tasteArtists));
    u.searchParams.set("size", String(opts.sizePerCity));
    u.searchParams.set("scoreMin", String(opts.scoreMin));
    return u.toString();
  }

  async function poolMap(items, concurrency, fn) {
    const out = [];
    let i = 0;

    const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx], idx);
        } catch (e) {
          out[idx] = { __error: e };
        }
      }
    });

    await Promise.all(workers);
    return out;
  }

  async function fetchNlWideConcerts() {
    const cfg = { ...LIVE2_DEFAULTS };
    const onlyMatches = !!store.onlyMatches;

    // If onlyMatches => scoreMin=10
    // Else => pull scoreMin=1 and split into matches+recs client-side
    const scoreMin = onlyMatches ? cfg.scoreMinMatches : cfg.scoreMinRecs;

    const opts = {
      sizePerCity: cfg.sizePerCity,
      tasteArtists: cfg.tasteArtists,
      scoreMin,
    };

    const results = await poolMap(NL_CITIES, cfg.concurrency, async (citySlug) => {
      const url = buildLive2Url(citySlug, opts);
      const payload = await fetchJson(url);

      const arr = Array.isArray(payload?.events) ? payload.events : [];
      const mapped = arr.map(normalizeLive2Event).filter(Boolean);

      return {
        city: citySlug,
        events: mapped,
        meta: payload?.meta || null,
      };
    });

    const allEvents = [];
    const errors = [];
    const metaByCity = [];

    for (const r of results) {
      if (!r) continue;
      if (r.__error) {
        errors.push(String(r.__error?.message || r.__error));
        continue;
      }
      if (Array.isArray(r.events)) allEvents.push(...r.events);
      if (r.meta) metaByCity.push({ city: r.city, meta: r.meta });
    }

    // dedupe across cities
    const byId = new Map();
    for (const ev of allEvents) {
      const prev = byId.get(ev.id);
      if (!prev) byId.set(ev.id, ev);
      else {
        // keep higher score; if tie keep earlier date
        if ((ev.score || 0) > (prev.score || 0)) byId.set(ev.id, ev);
        else if ((ev.score || 0) === (prev.score || 0) && (ev.startTs || 0) < (prev.startTs || 0)) byId.set(ev.id, ev);
      }
    }

    const merged = Array.from(byId.values());

    // If onlyMatches: keep score>=10
    // Else: allow score>=1 but we’ll render recs separately
    const matches = merged.filter(ev => Number(ev.score || 0) >= cfg.scoreMinMatches);
    const recs = merged
      .filter(ev => Number(ev.score || 0) >= cfg.scoreMinRecs && Number(ev.score || 0) < cfg.scoreMinMatches)
      .sort((a, b) => (b.score - a.score) || (a.startTs - b.startTs))
      .slice(0, cfg.recMax);

    return {
      onlyMatches,
      matches,
      recs,
      meta: {
        citiesTried: NL_CITIES.slice(),
        errors,
        metaByCity,
        tasteArtists: cfg.tasteArtists,
        scoreMinMatches: cfg.scoreMinMatches,
      }
    };
  }

  // ---------- Dedupe helpers (soft) ----------
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

  // ---------- UI nodes ----------
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

  const tabsWrapId = "econcertsInnerTabs";
  let tabsWrap = document.getElementById(tabsWrapId);

  if (!tabsWrap) {
    tabsWrap = document.createElement("div");
    tabsWrap.id = tabsWrapId;
    tabsWrap.style.display = "flex";
    tabsWrap.style.flexWrap = "wrap";
    tabsWrap.style.gap = "10px";
    tabsWrap.style.alignItems = "center";
    tabsWrap.style.justifyContent = "flex-end";
    tabsWrap.style.margin = "10px 0 14px";

    listEl.parentElement?.insertBefore(tabsWrap, listEl);
  } else {
    tabsWrap.innerHTML = "";
  }

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
      render(lastEvents, lastMeta);
    });

    return btn;
  }

  const tabAnnounced = makeTabBtn("Announced", "announced");
  const tabPlan = makeTabBtn("Plan", "plan");
  const tabDismissed = makeTabBtn("Dismissed", "dismissed");

  tabsWrap.appendChild(tabAnnounced);
  tabsWrap.appendChild(tabPlan);
  tabsWrap.appendChild(tabDismissed);

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
    render(lastEvents, lastMeta);
  });

  tabsWrap.appendChild(sortBtn);

  // ✅ Toggle: Only matches vs Matches + recs
  const matchToggle = document.createElement("button");
  matchToggle.type = "button";
  matchToggle.className = "eBtn ghost";
  matchToggle.style.borderRadius = "999px";

  function updateMatchToggle() {
    const on = !!store.onlyMatches;
    matchToggle.textContent = on ? "Only Matches" : "Matches + Recs";
    matchToggle.setAttribute("aria-pressed", on ? "true" : "false");
  }
  updateMatchToggle();

  matchToggle.addEventListener("click", () => {
    store.onlyMatches = !store.onlyMatches;
    saveStore(store);
    updateMatchToggle();
    refresh().catch(() => {});
  });

  tabsWrap.appendChild(matchToggle);

  function updateTabsUI() {
    const active = store.activeTab || "announced";
    for (const btn of [tabAnnounced, tabPlan, tabDismissed]) {
      const on = btn.dataset.tab === active;
      btn.className = on ? "eBtn" : "eBtn ghost";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    updateSortBtn();
    updateMatchToggle();
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
    pills.appendChild(pill(`Plays: ${Number(event.plays || 0)}`));

    const sRounded = Math.max(0, Math.min(100, Math.round(Number(event.score || 0))));
    pills.appendChild(pill(`${scoreIcon(sRounded)}`, {
      title: `Score: ${sRounded}${event.matched ? ` (matched: ${event.matched})` : ""}`
    }));

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
    const tab = store.activeTab || "announced";

    if (tab === "announced") {
      const btnDismiss = document.createElement("button");
      btnDismiss.className = "eBtn ghost";
      btnDismiss.type = "button";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents, lastMeta);
      });

      const btnPlan = document.createElement("button");
      btnPlan.className = "eBtn";
      btnPlan.type = "button";
      btnPlan.textContent = planned ? "Remove from plan" : "Add to plan";
      btnPlan.addEventListener("click", async () => {
        if (planned) await removeFromPlan(event.id);
        else await addToPlan(event.id);
        render(lastEvents, lastMeta);
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
        render(lastEvents, lastMeta);
      });

      const btnDismiss = document.createElement("button");
      btnDismiss.className = "eBtn ghost";
      btnDismiss.type = "button";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents, lastMeta);
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
        render(lastEvents, lastMeta);
      });

      const btnBack = document.createElement("button");
      btnBack.className = "eBtn";
      btnBack.type = "button";
      btnBack.textContent = "Undo dismiss";
      btnBack.addEventListener("click", async () => {
        await undismiss(event.id);
        render(lastEvents, lastMeta);
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

  function render(events, meta) {
    updateTabsUI();

    const tab = store.activeTab || "announced";

    const plannedIds = new Set(store.planIds);
    const dismissedIds = new Set(store.dismissedIds);

    const planned = [];
    const dismissed = [];
    const announced = [];

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
      announced.push(ev);
    }

    const mode = store.sortMode || "date";
    const sorter = (mode === "city") ? sortCityThenTimeAsc : sortChronoAsc;

    planned.sort(sorter);
    dismissed.sort(sorter);
    announced.sort(sorter);

    tabAnnounced.textContent = `Announced (${announced.length})`;
    tabPlan.textContent = `Plan (${planned.length})`;
    tabDismissed.textContent = `Dismissed (${dismissed.length})`;

    let visible = announced;
    let title = store.onlyMatches ? "Matches (NL)" : "Matches + Recs (NL)";
    let subtitle = mode === "city"
      ? "Netherlands-wide, sorted by city then date."
      : "Netherlands-wide, chronological.";

    if (tab === "plan") {
      visible = planned;
      title = "Plan";
      subtitle = mode === "city"
        ? "Saved shows (sorted by city then date)."
        : "Saved shows (chronological).";
    } else if (tab === "dismissed") {
      visible = dismissed;
      title = "Dismissed";
      subtitle = mode === "city"
        ? "Dismissed shows (sorted by city then date)."
        : "Dismissed shows (chronological).";
    }

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

    if (meta && meta.__recs && Array.isArray(meta.__recs) && meta.__recs.length && tab === "announced" && !store.onlyMatches) {
      const recHead = document.createElement("div");
      recHead.className = "ePill";
      recHead.textContent = `Recommendations (${meta.__recs.length})`;
      recHead.style.marginTop = "10px";
      listEl.appendChild(recHead);

      for (const ev of meta.__recs) {
        listEl.appendChild(buildCard(ev));
      }

      const sep = document.createElement("div");
      sep.className = "eEmpty";
      sep.textContent = "Matches";
      sep.style.marginTop = "10px";
      listEl.appendChild(sep);
    }

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "eEmpty";
      empty.textContent = "Empty";
      listEl.appendChild(empty);
      return;
    }

    for (const ev of visible) {
      listEl.appendChild(buildCard(ev));
    }
  }

  async function refresh() {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing NL…");

    try {
      const r = await fetchNlWideConcerts();

      // Build final list:
      // - if onlyMatches => use matches
      // - else => show matches in main list and pass recs in meta
      const merged = r.onlyMatches ? r.matches : r.matches;
      const events = dedupeEvents(merged);

      lastEvents = events;
      lastMeta = { ...r.meta, __recs: r.onlyMatches ? [] : dedupeEvents(r.recs) };

      render(events, lastMeta);
    } catch (err) {
      console.warn("[eConcerts] NL-wide fetch failed:", err);
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
  refresh().catch(() => setEmpty("Failed to refresh."));
})();
