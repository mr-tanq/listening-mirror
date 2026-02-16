/* econcerts.js (FULL FILE REPLACE) — SINGLE PART
   UI revamp:
   ✅ Internal tabs: Announced / Plan / Dismissed
   ✅ Chronological order everywhere
   ✅ Auto-refresh when clicking main eConcerts tab
   ✅ Hide old controls: Refresh / Reset dismissed / Group by city (legacy)
   ✅ No "ANNOUNCED/PLAN" labels inside cards
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

  // ---------- Storage ----------
  const STORE_KEY = "lm_econcerts_ui_v10_tabs";

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
        baseApi: String(obj.baseApi || ""),
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

  // ---------- Cloudflare Worker base ----------
  const FALLBACK_BASE_API = "https://live.errtanq9.workers.dev";

  function getBaseApi() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.BASE_API === "string" ? w.BASE_API : "";
    const fromStore = (store && typeof store.baseApi === "string") ? store.baseApi : "";
    const base = (fromWindow || fromStore || FALLBACK_BASE_API).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- econcerts API defaults ----------
  const ECONCERTS_DEFAULTS = {
    size: 600,          // ✅ keep big
    radiusKm: 30,
    scoreMin: 0,
    tasteArtists: 1000,
    city: "",
    countryCode: "NL",
    sources: "tm,ma,tv",
  };

  function normalizeSources(input) {
    const raw = safeStr(input) || "tm,ma,tv";
    const parts = raw.split(",").map(s => lowerKey(s)).filter(Boolean);
    const allowed = new Set(["tm", "ma", "tv"]);
    const out = [];
    for (const p of parts) if (allowed.has(p) && !out.includes(p)) out.push(p);
    return out.length ? out.join(",") : "tm,ma,tv";
  }

  async function fetchConcertsFromWorker(overrides = {}) {
    const cfg = { ...ECONCERTS_DEFAULTS, ...overrides };
    const base = getBaseApi();
    const u = new URL(base + "/econcerts");

    u.searchParams.set("sources", normalizeSources(cfg.sources));
    u.searchParams.set("size", String(cfg.size));
    u.searchParams.set("scoreMin", "0");
    u.searchParams.set("tasteArtists", "1000");
    u.searchParams.set("countryCode", String(cfg.countryCode || "NL"));

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

    const mappedEvents = events.map(ev => {
      const startTs = Number(ev.startTs || 0);
      const startDate = startTs ? new Date(startTs) : new Date(safeStr(ev.start));
      return {
        id: safeStr(ev.id),
        artist: safeStr(ev.artist),
        attractions: Array.isArray(ev.attractions) ? ev.attractions : [],
        city: safeStr(ev.city),
        venue: safeStr(ev.venue),
        start: startDate,
        url: safeStr(ev.url),

        plays: Number(ev.plays || 0),
        score: Number(ev.score || 0),
        startTs: startTs || (isValidDate(startDate) ? startDate.getTime() : 0),
        source: safeStr(ev.source || ev.src || ""),
        star: Boolean(ev.star),
      };
    }).filter(x => x.id && x.artist && isValidDate(x.start));

    return { events: mappedEvents, meta: data.meta || null };
  }

  // ---------- Dedupe ----------
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

  // ---------- State + UI nodes ----------
  let lastEvents = [];
  let lastMeta = null;

  const listEl = $("#econcertsList");
  const legacyRefreshBtn = $("#econcertsRefresh");
  const legacyGroupBtn = $("#econcertsToggleGroup");

  if (!listEl) return;

  // Hide legacy controls if present
  if (legacyRefreshBtn) legacyRefreshBtn.style.display = "none";
  if (legacyGroupBtn) legacyGroupBtn.style.display = "none";

  // Also hide any legacy "Reset dismissed" button we previously injected (best-effort)
  // We look near the eConcerts header controls and hide by text match.
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

  // Insert our internal tabs ABOVE the list
  const tabsWrapId = "econcertsInnerTabs";
  let tabsWrap = document.getElementById(tabsWrapId);

  if (!tabsWrap) {
    tabsWrap = document.createElement("div");
    tabsWrap.id = tabsWrapId;
    tabsWrap.style.display = "flex";
    tabsWrap.style.gap = "10px";
    tabsWrap.style.alignItems = "center";
    tabsWrap.style.justifyContent = "flex-end";
    tabsWrap.style.margin = "10px 0 14px";

    // place it just before the list
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
      render(lastEvents);
    });

    return btn;
  }

  const tabAnnounced = makeTabBtn("Announced", "announced");
  const tabPlan = makeTabBtn("Plan", "plan");
  const tabDismissed = makeTabBtn("Dismissed", "dismissed");

  tabsWrap.appendChild(tabAnnounced);
  tabsWrap.appendChild(tabPlan);
  tabsWrap.appendChild(tabDismissed);

  function updateTabsUI() {
    const active = store.activeTab || "announced";
    for (const btn of [tabAnnounced, tabPlan, tabDismissed]) {
      const on = btn.dataset.tab === active;
      btn.className = on ? "eBtn" : "eBtn ghost";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  updateTabsUI();

  // Debug helpers (optional)
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

  function pill(text) {
    const div = document.createElement("div");
    div.className = "ePill";
    div.textContent = text;
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
    artist.textContent = event.artist;

    const meta = document.createElement("div");
    meta.className = "eMeta";
    const venuePart = event.venue ? ` • ${event.venue}` : "";
    meta.textContent = `${formatDateTime(event.start)} • ${event.city}${venuePart}`;

    const pills = document.createElement("div");
    pills.className = "ePills";
    pills.appendChild(pill(`Plays: ${Number(event.plays || 0)}`));
    if (event.source) pills.appendChild(pill(`Src: ${String(event.source).toUpperCase()}`));
    pills.appendChild(pill(`Score: ${Math.max(0, Math.min(100, Math.round(Number(event.score || 0))))}`));

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
    const dismissed = isDismissed(event.id);

    // Actions depend on active tab
    const tab = store.activeTab || "announced";

    if (tab === "announced") {
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
      const btnBack = document.createElement("button");
      btnBack.className = "eBtn";
      btnBack.type = "button";
      btnBack.textContent = "Undo dismiss";
      btnBack.addEventListener("click", async () => {
        await undismiss(event.id);
        render(lastEvents);
      });

      // optional: allow plan directly from dismissed
      const btnPlan = document.createElement("button");
      btnPlan.className = "eBtn ghost";
      btnPlan.type = "button";
      btnPlan.textContent = planned ? "Remove from plan" : "Add to plan";
      btnPlan.addEventListener("click", async () => {
        if (planned) await removeFromPlan(event.id);
        else await addToPlan(event.id);
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

  function render(events) {
    updateTabsUI();

    const tab = store.activeTab || "announced";

    // Split lists
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

    planned.sort(sortChronoAsc);
    dismissed.sort(sortChronoAsc);
    announced.sort(sortChronoAsc);

    let visible = announced;
    let title = "Announced";
    let subtitle = "All upcoming shows (chronological).";

    if (tab === "plan") {
      visible = planned;
      title = "Plan";
      subtitle = "Shows you saved.";
    } else if (tab === "dismissed") {
      visible = dismissed;
      title = "Dismissed";
      subtitle = "Shows you dismissed (chronological).";
    }

    listEl.innerHTML = "";

    // Header pill
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
      console.warn("[eConcerts] worker fetch failed:", err);
      lastEvents = [];
      lastMeta = null;
      setEmpty(`Worker error: ${String(err && err.message ? err.message : err)}`);
    }
  }

  // Auto-refresh when main eConcerts tab is clicked
  function wireMainTabAutoRefresh() {
    const tabBtn = document.querySelector('.tabBtn[data-tab="econcerts"]');
    if (!tabBtn) return;

    tabBtn.addEventListener("click", () => {
      refresh().catch(() => {});
    }, { passive: true });
  }

  wireMainTabAutoRefresh();

  // Initial load
  refresh().catch(() => setEmpty("Failed to refresh."));
})();