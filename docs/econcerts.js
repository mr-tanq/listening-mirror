/* econcerts.js (FULL FILE REPLACE) — 3 PARTS (copy/paste in order)
   ✅ Uses AICON worker (aicon.errtanq9.workers.dev) instead of live.errtanq9.workers.dev
   ✅ Reads events: { artist, venue, city, date(YYYY-MM-DD), url }
   ✅ Keeps UI revamp tabs: Announced / Plan / Dismissed
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
  const STORE_KEY = "lm_econcerts_ui_v10_tabs_aicon";

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
          city: "",               // optional default city
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
        city: String(obj.city || ""),
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        baseApi: "",
        activeTab: "announced",
        sortMode: "date",
        city: "",
      };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  let store = loadStore();

  // ---------- AICON Worker base ----------
  const FALLBACK_BASE_API = "https://aicon.errtanq9.workers.dev";

  function getBaseApi() {
    const w = (typeof window !== "undefined") ? window : {};
    const fromWindow = typeof w.AICON_BASE_API === "string" ? w.AICON_BASE_API
      : (typeof w.BASE_API === "string" ? w.BASE_API : "");
    const fromStore = (store && typeof store.baseApi === "string") ? store.baseApi : "";
    const base = (fromWindow || fromStore || FALLBACK_BASE_API).trim();
    return base.replace(/\/+$/, "");
  }

  // ---------- AICON fetch ----------
  // We try a few common endpoint shapes to avoid “wrong path” issues.
  // Expected response (one of these):
  // 1) { ok:true, city:"utrecht", events:[...] }
  // 2) { ok:true, events:[...] }
  // 3) { ok:true, data:{ events:[...] } }
  const AICON_DEFAULTS = {
    city: "",
    // if UI doesn't pass a city, we default to stored city or Amsterdam
    fallbackCity: "Amsterdam",
  };

  function parseYmdToDate(ymd) {
    const s = safeStr(ymd);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    // set a stable time (20:00 local-ish) so UI has a time; keeps ordering stable
    // (we store as UTC Date object; formatter renders in Europe/Amsterdam)
    const dt = new Date(Date.UTC(y, mo - 1, d, 19, 0, 0)); // ~20:00 CET/CEST depending; good enough for display
    return isValidDate(dt) ? dt : null;
  }

  // simple stable hash for IDs
  function hashId(str) {
    const s = String(str || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // unsigned
    return (h >>> 0).toString(16);
  }

  async function fetchJson(url) {
    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
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

  async function fetchConcertsFromWorker(overrides = {}) {
    const cfg = { ...AICON_DEFAULTS, ...overrides };
    const base = getBaseApi();

    const cityCandidate =
      safeStr(cfg.city) ||
      safeStr(store.city) ||
      safeStr((typeof window !== "undefined" && window.DEFAULT_CITY) ? window.DEFAULT_CITY : "") ||
      AICON_DEFAULTS.fallbackCity;

    const city = cityCandidate || AICON_DEFAULTS.fallbackCity;

    // Try endpoints in order
    const tries = [];

    // Most likely: /events?city=Utrecht
    {
      const u = new URL(base + "/events");
      u.searchParams.set("city", city);
      tries.push(u.toString());
    }
    // Alternative: /city?city=Utrecht
    {
      const u = new URL(base + "/city");
      u.searchParams.set("city", city);
      tries.push(u.toString());
    }
    // Alternative: /events/Utrecht
    tries.push(base + "/events/" + encodeURIComponent(city));
    // Alternative: /city/Utrecht
    tries.push(base + "/city/" + encodeURIComponent(city));
    // If your aicon worker uses a single endpoint: /get?city=Utrecht
    {
      const u = new URL(base + "/get");
      u.searchParams.set("city", city);
      tries.push(u.toString());
    }

    let lastErr = null;
    for (const url of tries) {
      try {
        const data = await fetchJson(url);
        if (data && data.ok === true) {
          const arr = extractEventsArray(data);
          const mapped = (Array.isArray(arr) ? arr : []).map((ev) => {
            const artist = safeStr(ev.artist);
            const venue = safeStr(ev.venue);
            const evCity = safeStr(ev.city || city);
            const dateStr = safeStr(ev.date);
            const urlStr = safeStr(ev.url);

            const startDate = parseYmdToDate(dateStr) || new Date(dateStr);
            const start = isValidDate(startDate) ? startDate : new Date(0);

            const idBase = [artist, venue, evCity, dateStr, urlStr].join("|");
            const id = safeStr(ev.id) || ("aicon_" + hashId(idBase));

            return {
              id,
              artist,
              attractions: [],
              city: evCity,
              venue,
              start,
              url: urlStr,

              plays: 0,
              score: 0,
              startTs: isValidDate(start) ? start.getTime() : 0,
              source: "aicon",
              star: false,
            };
          }).filter(x => x.id && x.artist && isValidDate(x.start));

          // remember chosen city so next refresh is consistent
          store.city = city;
          saveStore(store);

          return { events: mapped, meta: { city, endpoint: url } };
        }
      } catch (e) {
        lastErr = e;
      }
    }

    const tried = tries.map(t => `- ${t}`).join("\n");
    const msg = lastErr && lastErr.message ? lastErr.message : String(lastErr || "Unknown error");
    throw new Error(`AICON fetch failed: ${msg}\nTried:\n${tried}`);
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

  tabsWrap.appendChild(sortBtn);

  function updateTabsUI() {
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
    setBaseApi(next) {
      store.baseApi = String(next || "").trim();
      saveStore(store);
    },
    setCity(nextCity) {
      store.city = String(nextCity || "").trim();
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
    pills.appendChild(pill(`${scoreIcon(sRounded)}`, { title: `Score: ${sRounded}` }));

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

    let visible = announced;
    let title = "Announced";
    let subtitle = mode === "city"
      ? "All upcoming shows (sorted by city, then date)."
      : "All upcoming shows (chronological).";

    if (tab === "plan") {
      visible = planned;
      title = "Plan";
      subtitle = mode === "city"
        ? "Shows you saved (sorted by city, then date)."
        : "Shows you saved (chronological).";
    } else if (tab === "dismissed") {
      visible = dismissed;
      title = "Dismissed";
      subtitle = mode === "city"
        ? "Shows you dismissed (sorted by city, then date)."
        : "Shows you dismissed (chronological).";
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
      console.warn("[eConcerts] AICON fetch failed:", err);
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