/* econcerts.js (FULL FILE REPLACE) — SINGLE PART
   ✅ eConcerts UI rework:
   - Tabs INSIDE eConcerts:
       1) Announced
       2) Plan
       3) Dismissed
   - Chronological order (no group-by-city)
   - Removed "MA Venues: Only whitelist" + all whitelist logic
   - Dismissed + Plan persist with snapshots (so they still show even if not in latest refresh)
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

  function lowerKey(s) {
    return String(s || "").trim().toLowerCase();
  }

  function safeStr(s) {
    return String(s || "").trim();
  }

  function clampInt(n, a, b, fallback) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    return Math.max(a, Math.min(b, Math.trunc(x)));
  }

  // ---------- Storage ----------
  // v10 (tabs + snapshots)
  const STORE_KEY = "lm_econcerts_v10";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return {
          planIds: [],
          dismissedIds: [],
          planItems: {},       // id -> snapshot
          dismissedItems: {},  // id -> snapshot
          lastRefreshAt: 0,
          baseApi: "",
          activeTab: "announced", // announced | plan | dismissed
        };
      }
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        planItems: obj && typeof obj.planItems === "object" && obj.planItems ? obj.planItems : {},
        dismissedItems: obj && typeof obj.dismissedItems === "object" && obj.dismissedItems ? obj.dismissedItems : {},
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
        planItems: {},
        dismissedItems: {},
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
    const w = typeof window !== "undefined" ? window : {};
    const fromWindow = typeof w.BASE_API === "string" ? w.BASE_API : "";
    const fromStore = store && typeof store.baseApi === "string" ? store.baseApi : "";
    const base = (fromWindow || fromStore || FALLBACK_BASE_API).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- econcerts API defaults ----------
  const ECONCERTS_DEFAULTS = {
    size: 250,
    radiusKm: 30,
    scoreMin: 0,
    tasteArtists: 1000,
    city: "",
    countryCode: "NL",
    sources: "tm,ma,tv",
  };

  function normalizeSources(input) {
    const raw = safeStr(input) || "tm,ma,tv";
    const parts = raw.split(",").map((s) => lowerKey(s)).filter(Boolean);
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
    u.searchParams.set("size", String(clampInt(cfg.size, 1, 1000, 250)));
    u.searchParams.set("scoreMin", "0");
    u.searchParams.set("tasteArtists", "1000");
    u.searchParams.set("countryCode", String(cfg.countryCode || "NL"));

    const city = safeStr(cfg.city);
    if (city) {
      u.searchParams.set("city", city);
      u.searchParams.set("radiusKm", String(clampInt(cfg.radiusKm, 1, 500, 30)));
    }

    const res = await fetch(u.toString(), { method: "GET" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data || data.ok !== true) {
      const msg = data && (data.error || data.message) ? String(data.error || data.message) : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const events = Array.isArray(data.events) ? data.events : [];

    const mappedEvents = events
      .map((ev) => {
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
          tier: safeStr(ev.tier || "discovery"),
          score: Number(ev.score || 0),
          level: safeStr(ev.level || ""),
          startTs: startTs || (isValidDate(startDate) ? startDate.getTime() : 0),
          source: safeStr(ev.source || ev.src || ""),
          star: Boolean(ev.star),
          __kind: "event",
        };
      })
      .filter((x) => x.id && x.artist && isValidDate(x.start));

    return { events: mappedEvents };
  }

  // ---------- Snapshot helpers (persist Plan/Dismissed cleanly) ----------
  function toSnapshot(ev) {
    if (!ev || !ev.id) return null;
    return {
      id: safeStr(ev.id),
      artist: safeStr(ev.artist),
      city: safeStr(ev.city),
      venue: safeStr(ev.venue),
      startTs: Number(ev.startTs || (ev.start ? ev.start.getTime() : 0)) || 0,
      url: safeStr(ev.url),
      source: safeStr(ev.source),
      plays: Number(ev.plays || 0),
      score: Number(ev.score || 0),
      tier: safeStr(ev.tier || ""),
    };
  }

  function snapshotToEvent(snap) {
    const ts = Number(snap?.startTs || 0);
    const d = ts ? new Date(ts) : new Date(0);
    return {
      id: safeStr(snap?.id),
      artist: safeStr(snap?.artist),
      attractions: [],
      city: safeStr(snap?.city),
      venue: safeStr(snap?.venue),
      start: d,
      url: safeStr(snap?.url),
      plays: Number(snap?.plays || 0),
      tier: safeStr(snap?.tier || "discovery"),
      score: Number(snap?.score || 0),
      level: "",
      startTs: ts,
      source: safeStr(snap?.source || ""),
      star: false,
      __kind: "snapshot",
    };
  }

  // ---------- Dedupe (by id only; worker already dedupes well) ----------
  function dedupeById(events) {
    const map = new Map();
    for (const ev of events || []) {
      if (!ev || !ev.id) continue;
      if (!map.has(ev.id)) map.set(ev.id, ev);
      else {
        // keep the one with more metadata
        const a = map.get(ev.id);
        const aMeta = (a.city ? 1 : 0) + (a.venue ? 1 : 0) + (a.url ? 1 : 0);
        const bMeta = (ev.city ? 1 : 0) + (ev.venue ? 1 : 0) + (ev.url ? 1 : 0);
        map.set(ev.id, bMeta >= aMeta ? ev : a);
      }
    }
    return Array.from(map.values());
  }

  function sortChrono(a, b) {
    const ta = Number(a.startTs || (a.start ? a.start.getTime() : 0)) || 0;
    const tb = Number(b.startTs || (b.start ? b.start.getTime() : 0)) || 0;
    if (ta !== tb) return ta - tb;
    return safeStr(a.artist).localeCompare(safeStr(b.artist));
  }

  // ---------- State + UI nodes ----------
  let lastEvents = [];

  const listEl = $("#econcertsList");
  const refreshBtn = $("#econcertsRefresh");
  const groupBtn = $("#econcertsToggleGroup"); // will be hidden (chronological only)

  if (!listEl || !refreshBtn) return;

  if (groupBtn) {
    groupBtn.style.display = "none"; // 🔥 chronological only
  }

  // --- Controls area ---
  const controlsWrap = refreshBtn.parentElement || refreshBtn;

  const resetDismissedBtn = document.createElement("button");
  resetDismissedBtn.className = "eBtn ghost";
  resetDismissedBtn.type = "button";
  resetDismissedBtn.textContent = "Reset dismissed";
  resetDismissedBtn.title = "Clear your dismissed list";
  controlsWrap.appendChild(resetDismissedBtn);

  resetDismissedBtn.addEventListener("click", () => {
    store.dismissedIds = [];
    store.dismissedItems = {};
    saveStore(store);
    render();
  });

  // --- Tabs ---
  function makeTabBtn(id, label) {
    const btn = document.createElement("button");
    btn.className = "eBtn ghost";
    btn.type = "button";
    btn.dataset.tab = id;
    btn.textContent = label;
    btn.style.minWidth = "110px";
    return btn;
  }

  const tabsRow = document.createElement("div");
  tabsRow.style.display = "flex";
  tabsRow.style.gap = "10px";
  tabsRow.style.flexWrap = "wrap";
  tabsRow.style.marginTop = "10px";
  tabsRow.style.marginBottom = "10px";

  const tabAnnounced = makeTabBtn("announced", "Announced");
  const tabPlan = makeTabBtn("plan", "Plan");
  const tabDismissed = makeTabBtn("dismissed", "Dismissed");

  tabsRow.appendChild(tabAnnounced);
  tabsRow.appendChild(tabPlan);
  tabsRow.appendChild(tabDismissed);

  // Insert tabs under existing controls
  controlsWrap.appendChild(tabsRow);

  function setActiveTab(next) {
    store.activeTab = next;
    saveStore(store);
    syncTabs();
    render();
  }

  function syncTabs() {
    const active = store.activeTab || "announced";
    const all = [tabAnnounced, tabPlan, tabDismissed];
    for (const b of all) {
      const isOn = b.dataset.tab === active;
      b.className = isOn ? "eBtn" : "eBtn ghost";
      b.setAttribute("aria-pressed", isOn ? "true" : "false");
    }
  }

  tabAnnounced.addEventListener("click", () => setActiveTab("announced"));
  tabPlan.addEventListener("click", () => setActiveTab("plan"));
  tabDismissed.addEventListener("click", () => setActiveTab("dismissed"));

  syncTabs();

  // ---------- Debug helpers ----------
  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    setBaseApi(next) {
      store.baseApi = String(next || "").trim();
      saveStore(store);
    },
    setTab(next) {
      if (["announced", "plan", "dismissed"].includes(String(next))) setActiveTab(String(next));
    },
  };

  const isPlanned = (id) => store.planIds.includes(id);
  const isDismissed = (id) => store.dismissedIds.includes(id);

  function rememberPlan(ev) {
    const snap = toSnapshot(ev);
    if (!snap) return;
    store.planItems[snap.id] = snap;
  }
  function rememberDismissed(ev) {
    const snap = toSnapshot(ev);
    if (!snap) return;
    store.dismissedItems[snap.id] = snap;
  }

  async function addToPlan(ev) {
    if (!store.planIds.includes(ev.id)) store.planIds.push(ev.id);
    // if it was dismissed, undismiss it
    store.dismissedIds = store.dismissedIds.filter((x) => x !== ev.id);
    delete store.dismissedItems[ev.id];
    rememberPlan(ev);
    saveStore(store);
  }

  async function removeFromPlan(id) {
    store.planIds = store.planIds.filter((x) => x !== id);
    // keep snapshot around (optional); but cleaner to remove it too
    delete store.planItems[id];
    saveStore(store);
  }

  async function dismiss(ev) {
    if (!store.dismissedIds.includes(ev.id)) store.dismissedIds.push(ev.id);
    // remove from plan if present
    store.planIds = store.planIds.filter((x) => x !== ev.id);
    delete store.planItems[ev.id];
    rememberDismissed(ev);
    saveStore(store);
  }

  async function undismiss(id) {
    store.dismissedIds = store.dismissedIds.filter((x) => x !== id);
    delete store.dismissedItems[id];
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

  function buildCard(ev, mode) {
    const card = document.createElement("div");
    card.className = "eCard";
    card.dataset.id = ev.id;

    const main = document.createElement("div");
    main.className = "eMain";

    const artist = document.createElement("div");
    artist.className = "eArtist";
    artist.textContent = ev.artist;

    const meta = document.createElement("div");
    meta.className = "eMeta";
    const venuePart = ev.venue ? ` • ${ev.venue}` : "";
    meta.textContent = `${formatDateTime(ev.start)} • ${safeStr(ev.city)}${venuePart}`;

    const pills = document.createElement("div");
    pills.className = "ePills";
    pills.appendChild(pill(`Plays: ${Number(ev.plays || 0)}`));
    if (ev.source) pills.appendChild(pill(`Src: ${String(ev.source).toUpperCase()}`));
    if (Number.isFinite(Number(ev.score))) pills.appendChild(pill(`Score: ${Number(ev.score || 0)}`));

    main.appendChild(artist);
    main.appendChild(meta);
    main.appendChild(pills);

    const right = document.createElement("div");
    right.className = "eRight";

    const badgeEl = document.createElement("div");
    badgeEl.className = "eBadge";
    badgeEl.textContent = mode === "plan" ? "PLAN" : mode === "dismissed" ? "DISMISSED" : "ANNOUNCED";

    const actions = document.createElement("div");
    actions.className = "eActions";

    if (ev.url) {
      const btnLink = document.createElement("button");
      btnLink.className = "eBtn ghost";
      btnLink.type = "button";
      btnLink.textContent = "Link";
      btnLink.addEventListener("click", () => window.open(ev.url, "_blank", "noopener,noreferrer"));
      actions.appendChild(btnLink);
    }

    if (mode === "announced") {
      const btnDismiss = document.createElement("button");
      btnDismiss.className = "eBtn ghost";
      btnDismiss.type = "button";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(ev);
        render();
      });

      const btnPlan = document.createElement("button");
      btnPlan.className = "eBtn";
      btnPlan.type = "button";
      btnPlan.textContent = "Add to plan";
      btnPlan.addEventListener("click", async () => {
        await addToPlan(ev);
        render();
      });

      actions.appendChild(btnDismiss);
      actions.appendChild(btnPlan);
    }

    if (mode === "plan") {
      const btnDismiss = document.createElement("button");
      btnDismiss.className = "eBtn ghost";
      btnDismiss.type = "button";
      btnDismiss.textContent = "Dismiss";
      btnDismiss.addEventListener("click", async () => {
        await dismiss(ev);
        render();
      });

      const btnRemove = document.createElement("button");
      btnRemove.className = "eBtn";
      btnRemove.type = "button";
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", async () => {
        await removeFromPlan(ev.id);
        render();
      });

      actions.appendChild(btnDismiss);
      actions.appendChild(btnRemove);
    }

    if (mode === "dismissed") {
      const btnUndismiss = document.createElement("button");
      btnUndismiss.className = "eBtn";
      btnUndismiss.type = "button";
      btnUndismiss.textContent = "Undismiss";
      btnUndismiss.addEventListener("click", async () => {
        await undismiss(ev.id);
        render();
      });

      const btnPlan = document.createElement("button");
      btnPlan.className = "eBtn ghost";
      btnPlan.type = "button";
      btnPlan.textContent = "Add to plan";
      btnPlan.addEventListener("click", async () => {
        await addToPlan(ev);
        render();
      });

      actions.appendChild(btnPlan);
      actions.appendChild(btnUndismiss);
    }

    right.appendChild(badgeEl);
    right.appendChild(actions);

    card.appendChild(main);
    card.appendChild(right);

    return card;
  }

  function sectionHeader(title, subtitle) {
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "10px";

    const h = document.createElement("div");
    h.className = "ePill";
    h.textContent = title;
    h.style.justifyContent = "center";
    h.style.fontWeight = "900";
    h.style.opacity = ".95";
    wrap.appendChild(h);

    if (subtitle) {
      const sub = document.createElement("div");
      sub.className = "eEmpty";
      sub.textContent = subtitle;
      sub.style.opacity = ".9";
      wrap.appendChild(sub);
    }

    return wrap;
  }

  function render() {
    const active = store.activeTab || "announced";
    listEl.innerHTML = "";

    // Merge in snapshots so Plan/Dismissed show even if refresh doesn't include them
    const byId = new Map();
    for (const ev of lastEvents) byId.set(ev.id, ev);

    // build lists
    const planList = [];
    for (const id of store.planIds) {
      const ev = byId.get(id) || snapshotToEvent(store.planItems[id]);
      if (ev && ev.id) planList.push(ev);
    }

    const dismissedList = [];
    for (const id of store.dismissedIds) {
      const ev = byId.get(id) || snapshotToEvent(store.dismissedItems[id]);
      if (ev && ev.id) dismissedList.push(ev);
    }

    // Announced = everything upcoming EXCEPT planned and dismissed
    const announced = lastEvents.filter((ev) => !isPlanned(ev.id) && !isDismissed(ev.id));

    // sort all chrono
    announced.sort(sortChrono);
    planList.sort(sortChrono);
    dismissedList.sort(sortChrono);

    if (active === "announced") {
      const head = sectionHeader("Announced", "All upcoming shows (chronological).");
      listEl.appendChild(head);

      if (!announced.length) {
        const empty = document.createElement("div");
        empty.className = "eEmpty";
        empty.textContent = "No announced events right now. Tap Refresh.";
        head.appendChild(empty);
        return;
      }

      for (const ev of announced) head.appendChild(buildCard(ev, "announced"));
      return;
    }

    if (active === "plan") {
      const head = sectionHeader("Plan", "Shows you saved (chronological).");
      listEl.appendChild(head);

      if (!planList.length) {
        const empty = document.createElement("div");
        empty.className = "eEmpty";
        empty.textContent = "Your plan is empty.";
        head.appendChild(empty);
        return;
      }

      for (const ev of planList) head.appendChild(buildCard(ev, "plan"));
      return;
    }

    // dismissed
    const head = sectionHeader("Dismissed", "Shows you hid (chronological).");
    listEl.appendChild(head);

    if (!dismissedList.length) {
      const empty = document.createElement("div");
      empty.className = "eEmpty";
      empty.textContent = "Nothing dismissed.";
      head.appendChild(empty);
      return;
    }

    for (const ev of dismissedList) head.appendChild(buildCard(ev, "dismissed"));
  }

  async function refresh(overrides = {}) {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing…");

    try {
      const { events: rawEvents } = await fetchConcertsFromWorker(overrides);
      const events = dedupeById(rawEvents);

      // keep only upcoming-ish (allow small tolerance)
      const cutoff = Date.now() - 12 * 60 * 60 * 1000;
      lastEvents = events.filter((e) => Number(e.startTs || 0) >= cutoff);
      lastEvents.sort(sortChrono);

      // keep snapshots updated for planned/dismissed if we have the fresh event
      for (const ev of lastEvents) {
        if (isPlanned(ev.id)) rememberPlan(ev);
        if (isDismissed(ev.id)) rememberDismissed(ev);
      }
      saveStore(store);

      render();
    } catch (err) {
      console.warn("[eConcerts] worker fetch failed:", err);
      lastEvents = [];
      setEmpty(`Worker error: ${String(err && err.message ? err.message : err)}`);
    }
  }

  // Refresh button
  refreshBtn.addEventListener("click", async () => {
    await refresh();
  });

  // initial load
  refresh().catch(() => setEmpty("Failed to refresh."));

  // optional: refresh when tab becomes active
  function wireTabAutoRefresh() {
    const tabBtn = document.querySelector('.tabBtn[data-tab="econcerts"]');
    if (!tabBtn) return;

    tabBtn.addEventListener(
      "click",
      () => {
        const hasCards = listEl.querySelector(".eCard");
        if (!hasCards) refresh().catch(() => {});
      },
      { passive: true }
    );
  }

  wireTabAutoRefresh();
})();