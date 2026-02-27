/* econcerts.js (FULL FILE REPLACE) — SINGLE PART ✅
   ✅ Default: LIVE2 NL-wide matches (/econcerts, omit city)
   ✅ Adds mode toggle: Matches (LIVE2) / All (AICON)
   ✅ AICON view: dropdown city + loads /events?city=...
   ✅ Keeps UI tabs: Announced / Plan / Dismissed
   ✅ Sort: Date / City (persisted)
   ✅ Title Case artist display
   ✅ Button: "Refresh NL (AICON)" to pre-index cities in AICON
   ✅ NL_CITIES includes: haarlem, zoetermeer, leeuwarden
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
  const STORE_KEY = "lm_econcerts_ui_v13_live2_aicon_modes";

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
          onlyMatches: true,
          mode: "live2",          // live2 | aicon
          aiconCity: "utrecht",   // default city
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
        mode: (String(obj.mode) === "aicon" || String(obj.mode) === "live2")
          ? String(obj.mode)
          : "live2",
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
        onlyMatches: true,
        mode: "live2",
        aiconCity: "utrecht",
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();

  // ---------- LIVE2 Worker base ----------
  const FALLBACK_LIVE2_BASE = "https://live2.errtanq9.workers.dev";

  function getLive2Base() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.LIVE2_BASE_API === "string" ? w.LIVE2_BASE_API
      : (typeof w.BASE_API === "string" ? w.BASE_API : "");
    const fromStore = (store && typeof store.baseApi === "string") ? store.baseApi : "";
    const base = (fromWindow || fromStore || FALLBACK_LIVE2_BASE).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- AICON base ----------
  const FALLBACK_AICON_BASE = "https://aicon.errtanq9.workers.dev";
  function getAiconBase() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.AICON_BASE_API === "string" ? w.AICON_BASE_API : "";
    const base = (fromWindow || FALLBACK_AICON_BASE).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- NL city list for AICON refresh ----------
  // Keep them lowercase (MetalAgenda slugs). (You requested: haarlem, zoetermeer, leeuwarden)
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
    // Metalagenda uses Title Case in URL path, with spaces as-is.
    const title = citySlug.split(" ").map(p => p ? (p[0].toUpperCase() + p.slice(1)) : p).join(" ");
    return `https://www.metalagenda.nl/p/${encodeURI(title)}`;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (data && data.ok === false) {
      const msg = (data.error || data.message) ? String(data.error || data.message) : "Unknown error";
      throw new Error(msg);
    }
    return data;
  }

  // ---------- LIVE2 fetch (NL mode = omit city) ----------
  const LIVE2_DEFAULTS = {
    size: 400,
    tasteArtists: 2000,
    scoreMin: 10,
    reco: false,
  };

  function buildLive2NlUrl() {
    const base = getLive2Base();
    const u = new URL(base + "/econcerts");
    // NL mode: do NOT set city
    u.searchParams.set("size", String(LIVE2_DEFAULTS.size));
    u.searchParams.set("tasteArtists", String(LIVE2_DEFAULTS.tasteArtists));
    u.searchParams.set("scoreMin", String(LIVE2_DEFAULTS.scoreMin));
    return u.toString();
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
      mode: "live2",
    };
  }

  // ---------- AICON fetch ----------
  function buildAiconCityUrl(city) {
    const base = getAiconBase();
    const u = new URL(base + "/events");
    u.searchParams.set("city", String(city || "").trim().toLowerCase());
    return u.toString();
  }

  function normalizeAiconEvent(ev, fallbackCity) {
    // AICON schema can vary; best-effort mapping:
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

    // Stable-ish id:
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
      mode: "aicon",
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
    // include venue too to reduce collisions in big cities
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

  // ---------- UI nodes ----------
  let lastEvents = [];
  let lastMeta = null;

  const listEl = $("#econcertsList");
  const legacyRefreshBtn = $("#econcertsRefresh");
  const legacyGroupBtn = $("#econcertsToggleGroup");

  if (!listEl) return;

  if (legacyRefreshBtn) legacyRefreshBtn.style.display = "none";
  if (legacyGroupBtn) legacyGroupBtn.style.display = "none";

  // Remove old buttons if present
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

  // ----- Mode toggle (LIVE2 / AICON) -----
  const modeLive2Btn = document.createElement("button");
  modeLive2Btn.type = "button";
  modeLive2Btn.style.borderRadius = "999px";
  modeLive2Btn.className = "eBtn";
  modeLive2Btn.textContent = "Matches (LIVE2)";

  const modeAiconBtn = document.createElement("button");
  modeAiconBtn.type = "button";
  modeAiconBtn.style.borderRadius = "999px";
  modeAiconBtn.className = "eBtn ghost";
  modeAiconBtn.textContent = "All (AICON)";

  function setMode(nextMode) {
    store.mode = (nextMode === "aicon") ? "aicon" : "live2";
    saveStore(store);
    updateModeUI();
    refresh().catch(() => setEmpty("Failed to refresh."));
  }

  modeLive2Btn.addEventListener("click", () => setMode("live2"));
  modeAiconBtn.addEventListener("click", () => setMode("aicon"));

  // City dropdown (only for AICON mode)
  const aiconCitySelect = document.createElement("select");
  aiconCitySelect.className = "eBtn ghost";
  aiconCitySelect.style.borderRadius = "999px";
  aiconCitySelect.style.padding = "10px 12px";
  aiconCitySelect.style.background = "transparent";
  aiconCitySelect.style.color = "inherit";
  aiconCitySelect.style.border = "1px solid rgba(255,255,255,.12)";

  function rebuildCityOptions() {
    aiconCitySelect.innerHTML = "";
    const cities = Array.from(new Set(NL_CITIES.concat([store.aiconCity || "utrecht"])))
      .map(c => String(c || "").trim().toLowerCase())
      .filter(Boolean)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    for (const c of cities) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      aiconCitySelect.appendChild(opt);
    }
    aiconCitySelect.value = (store.aiconCity || "utrecht").toLowerCase();
  }
  rebuildCityOptions();

  aiconCitySelect.addEventListener("change", () => {
    store.aiconCity = String(aiconCitySelect.value || "utrecht").trim().toLowerCase();
    saveStore(store);
    if (store.mode === "aicon") refresh().catch(() => setEmpty("Failed to refresh."));
  });

  // Main tabs
  const tabAnnounced = makeTabBtn("Announced", "announced");
  const tabPlan = makeTabBtn("Plan", "plan");
  const tabDismissed = makeTabBtn("Dismissed", "dismissed");

  // Render controls (top row)
  tabsWrap.appendChild(modeLive2Btn);
  tabsWrap.appendChild(modeAiconBtn);
  tabsWrap.appendChild(aiconCitySelect);

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

  // ✅ One button: refresh NL (AICON)
  const refreshAiconBtn = document.createElement("button");
  refreshAiconBtn.type = "button";
  refreshAiconBtn.className = "eBtn";
  refreshAiconBtn.style.borderRadius = "999px";
  refreshAiconBtn.textContent = "Refresh NL (AICON)";
  tabsWrap.appendChild(refreshAiconBtn);

  // Status pill (progress)
  const statusPill = document.createElement("div");
  statusPill.className = "ePill";
  statusPill.style.display = "none";
  statusPill.style.marginLeft = "auto";
  statusPill.style.maxWidth = "100%";
  statusPill.style.whiteSpace = "nowrap";
  statusPill.style.overflow = "hidden";
  statusPill.style.textOverflow = "ellipsis";
  tabsWrap.appendChild(statusPill);

  function setStatus(txt, show = true) {
    statusPill.textContent = String(txt || "");
    statusPill.style.display = show ? "flex" : "none";
  }

  function updateModeUI() {
    const mode = store.mode || "live2";
    const live2On = mode === "live2";
    modeLive2Btn.className = live2On ? "eBtn" : "eBtn ghost";
    modeLive2Btn.setAttribute("aria-pressed", live2On ? "true" : "false");
    modeAiconBtn.className = !live2On ? "eBtn" : "eBtn ghost";
    modeAiconBtn.setAttribute("aria-pressed", !live2On ? "true" : "false");

    // Show city dropdown only for AICON
    aiconCitySelect.style.display = live2On ? "none" : "inline-flex";
  }

  function updateTabsUI() {
    updateModeUI();
    const active = store.activeTab || "announced";
    for (const btn of [tabAnnounced, tabPlan, tabDismissed]) {
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
    forceRefresh() {
      refresh().catch(() => {});
    }
  };

  // ---------- Plan/Dismiss ----------
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
    const cityPart = event.city ? event.city : "";
    meta.textContent = `${formatDateTime(event.start)} • ${cityPart}${venuePart}`;

    const pills = document.createElement("div");
    pills.className = "ePills";

    pills.appendChild(pill(`Plays: ${Number(event.plays || 0)}`));

    if (event.mode === "live2") {
      const sRounded = Math.max(0, Math.min(100, Math.round(Number(event.score || 0))));
      pills.appendChild(pill(`${scoreIcon(sRounded)}`, {
        title: `Score: ${sRounded}${event.matched ? ` (matched: ${event.matched})` : ""}`
      }));
    } else {
      pills.appendChild(pill(`🧾`, { title: `Source: ${safeStr(event.source || "aicon")}` }));
    }

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

  function render(events) {
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

    const uiMode = store.mode || "live2";
    const headline = uiMode === "live2"
      ? "Netherlands (LIVE2 matches)"
      : `AICON (All events) — ${store.aiconCity || ""}`;

    let visible = announced;
    let subtitle = (uiMode === "live2")
      ? (mode === "city" ? "NL-wide matches, sorted by city then date." : "NL-wide matches, chronological.")
      : (mode === "city" ? "AICON city feed, sorted by city then date." : "AICON city feed, chronological.");

    if (tab === "plan") {
      visible = planned;
      subtitle = (mode === "city")
        ? "Saved shows (sorted by city then date)."
        : "Saved shows (chronological).";
    } else if (tab === "dismissed") {
      visible = dismissed;
      subtitle = (mode === "city")
        ? "Dismissed shows (sorted by city then date)."
        : "Dismissed shows (chronological).";
    }

    listEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "ePill";
    header.textContent = headline;
    header.style.justifyContent = "center";
    header.style.fontWeight = "800";
    header.style.opacity = ".95";
    listEl.appendChild(header);

    const sub = document.createElement("div");
    sub.className = "eEmpty";
    sub.textContent = subtitle;
    listEl.appendChild(sub);

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

  // ---------- AICON refresh button logic ----------
  async function aiconRefreshCity(citySlug) {
    const base = getAiconBase();
    const u = new URL(base + "/refresh");
    u.searchParams.set("source", "metalagenda");
    u.searchParams.set("city", citySlug);
    u.searchParams.set("url", metalAgendaUrlForCity(citySlug));
    return fetchJson(u.toString());
  }

  async function refreshNlInAicon() {
    refreshAiconBtn.disabled = true;
    refreshAiconBtn.classList.add("ghost");
    const startedAt = Date.now();

    try {
      setStatus(`AICON refresh: starting (${NL_CITIES.length} cities)…`, true);

      let ok = 0;
      let fail = 0;

      // Sequential on purpose: safer and avoids “too many subrequests”
      for (let i = 0; i < NL_CITIES.length; i++) {
        const c = NL_CITIES[i];
        setStatus(`AICON refresh: ${i + 1}/${NL_CITIES.length} — ${c}…`, true);

        try {
          const r = await aiconRefreshCity(c);
          if (r && r.ok !== false) ok++;
          else fail++;
        } catch {
          fail++;
        }
      }

      const secs = Math.round((Date.now() - startedAt) / 1000);
      setStatus(`AICON refresh done ✅ ok=${ok} fail=${fail} (${secs}s). Reloading…`, true);

      // After refresh, reload current mode
      await refresh();

      setStatus(`Ready ✅ (AICON ok=${ok} fail=${fail})`, true);
      setTimeout(() => setStatus("", false), 4000);
    } finally {
      refreshAiconBtn.disabled = false;
      refreshAiconBtn.classList.remove("ghost");
    }
  }

  refreshAiconBtn.addEventListener("click", () => {
    refreshNlInAicon().catch((e) => {
      setStatus(`AICON refresh failed: ${String(e?.message || e)}`, true);
      setTimeout(() => setStatus("", false), 6000);
      refreshAiconBtn.disabled = false;
    });
  });

  // ---------- Main refresh (LIVE2 NL or AICON city) ----------
  async function refresh() {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    const uiMode = store.mode || "live2";

    if (uiMode === "aicon") {
      const c = (store.aiconCity || "utrecht").trim().toLowerCase();
      setEmpty(`Refreshing AICON: ${c}…`);

      const url = buildAiconCityUrl(c);
      const payload = await fetchJson(url);

      // AICON payload typically: { ok:true, city:"...", events:[...] }
      const arr = Array.isArray(payload?.events) ? payload.events : (Array.isArray(payload) ? payload : []);
      const mapped = arr.map(ev => normalizeAiconEvent(ev, c)).filter(Boolean);
      const events = dedupeEvents(mapped);

      lastEvents = events;
      lastMeta = payload?.meta || null;

      render(events);
      return;
    }

    // LIVE2 mode
    setEmpty("Refreshing NL (LIVE2)…");

    const url = buildLive2NlUrl();
    const payload = await fetchJson(url);

    const arr = Array.isArray(payload?.events) ? payload.events : [];
    const mapped = arr.map(normalizeLive2Event).filter(Boolean);
    const events = dedupeEvents(mapped);

    lastEvents = events;
    lastMeta = payload?.meta || null;

    render(events);
  }

  function wireMainTabAutoRefresh() {
    const tabBtn = document.querySelector('.tabBtn[data-tab="econcerts"]');
    if (!tabBtn) return;

    tabBtn.addEventListener("click", () => {
      refresh().catch(() => {});
    }, { passive: true });
  }

  wireMainTabAutoRefresh();

  // Ensure city dropdown matches stored value
  try {
    rebuildCityOptions();
    aiconCitySelect.value = (store.aiconCity || "utrecht").toLowerCase();
  } catch {}

  // Initial load
  refresh().catch(() => setEmpty("Failed to refresh."));
})();
