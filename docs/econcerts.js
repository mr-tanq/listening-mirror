/* econcerts.js (FULL FILE REPLACE) — SINGLE PART
   ✅ TM + MetalAgenda + Tivoli
   ✅ Venue whitelist affects ONLY MetalAgenda (+ Venue Watch), NOT TM/TV
   ✅ Keeps "Venue Watch" from dropped[] so you don't miss Patronaat etc
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

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function looksLikeMA(ev) {
    const src = lowerKey(ev?.source || ev?.src || "");
    if (src === "ma") return true;
    const id = safeStr(ev?.id);
    return id.startsWith("ma:");
  }

  // ---------- Storage ----------
  // v9 (TM+TV back + whitelist only for MA)
  const STORE_KEY = "lm_econcerts_v9";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return {
          planIds: [],
          dismissedIds: [],
          lastRefreshAt: 0,
          groupByCity: true,
          baseApi: "",
          uiScoreMin: 40,
          heardPlaysMin: 5,
          venueOnly: true, // only applies to MA + Venue Watch
        };
      }
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        groupByCity: Boolean(obj.groupByCity ?? true),
        baseApi: String(obj.baseApi || ""),
        uiScoreMin: Number.isFinite(Number(obj.uiScoreMin)) ? Number(obj.uiScoreMin) : 40,
        heardPlaysMin: Number.isFinite(Number(obj.heardPlaysMin)) ? Number(obj.heardPlaysMin) : 5,
        venueOnly: Boolean(obj.venueOnly ?? true),
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        groupByCity: true,
        baseApi: "",
        uiScoreMin: 40,
        heardPlaysMin: 5,
        venueOnly: true,
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

  // ---------- MA venue whitelist ----------
  const MA_VENUE_WHITELIST = uniq([
    "https://www.metalagenda.nl/venues/tivoli-vredenburg",
    "https://www.metalagenda.nl/venues/de-helling",
    "https://www.metalagenda.nl/venues/dbs",
    "https://www.metalagenda.nl/venues/patronaat",
    "https://www.metalagenda.nl/venues/doornroosje",
    "https://www.metalagenda.nl/venues/effenaar",
    "https://www.metalagenda.nl/venues/fluor",
    "https://www.metalagenda.nl/venues/neushoorn",
    "https://www.metalagenda.nl/venues/baroeg",
    "https://www.metalagenda.nl/venues/013",
    "https://www.metalagenda.nl/venues/dynamo",
    "https://www.metalagenda.nl/venues/vera",
    "https://www.metalagenda.nl/venues/rotown",
    "https://www.metalagenda.nl/venues/merleyn",
    "https://www.metalagenda.nl/venues/occii",
  ]);

  function isWhitelistedMAUrl(url) {
    const u = safeStr(url);
    if (!u) return false;
    return MA_VENUE_WHITELIST.some(v => u === v || u === (v + "/") || u.startsWith(v + "?") || u.startsWith(v + "/"));
  }

  // ---------- econcerts API defaults ----------
  const ECONCERTS_DEFAULTS = {
    size: 200,
    radiusKm: 30,
    scoreMin: 0,         // forced 0
    tasteArtists: 1000,  // forced 1000
    city: "",            // empty => whole NL
    countryCode: "NL",
    sources: "tm,ma,tv", // ✅ IMPORTANT: bring TM + TV back
  };

  function normalizeSources(input) {
    const raw = safeStr(input) || "tm,ma,tv";
    const parts = raw.split(",").map(s => lowerKey(s)).filter(Boolean);
    const allowed = new Set(["tm", "ma", "tv", "pi"]);
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
    const dropped = Array.isArray(data.dropped) ? data.dropped : [];

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
        tier: safeStr(ev.tier || "discovery"),
        score: Number(ev.score || 0),
        level: safeStr(ev.level || ""),
        startTs: startTs || (isValidDate(startDate) ? startDate.getTime() : 0),
        source: safeStr(ev.source || ev.src || ""),
        star: Boolean(ev.star),
        __kind: "event",
      };
    }).filter(x => x.id && x.artist && isValidDate(x.start));

    // Venue Watch from dropped (usually MA)
    const mappedDropped = dropped.map(d => ({
      id: safeStr(d.id),
      artist: safeStr(d.title || "Unknown"),
      attractions: [],
      city: "",
      venue: "",
      start: new Date(0),
      url: safeStr(d.url),
      plays: 0,
      tier: "venue_watch",
      score: 0,
      level: safeStr(d.reason || "dropped"),
      startTs: 0,
      source: safeStr(d.source || "ma"),
      star: false,
      __kind: "dropped",
    })).filter(x => x.id && x.artist && x.url);

    return { events: mappedEvents, dropped: mappedDropped };
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

  // ---------- UI-side final score ----------
  function computeFinalScore(event) {
    let s = Number(event.score || 0);
    if (lowerKey(event.city) === "utrecht") s += 4;
    s = Math.max(0, Math.min(100, Math.round(s)));
    return s;
  }

  // ---------- State + UI nodes ----------
  let lastEvents = [];
  let lastDropped = [];

  const listEl = $("#econcertsList");
  const refreshBtn = $("#econcertsRefresh");
  const groupBtn = $("#econcertsToggleGroup");

  if (!listEl || !refreshBtn || !groupBtn) return;

  groupBtn.setAttribute("aria-pressed", store.groupByCity ? "true" : "false");
  groupBtn.textContent = store.groupByCity ? "Group by city" : "Ungroup";

  // Add buttons next to Refresh
  const controlsWrap = refreshBtn.parentElement || refreshBtn;

  const resetBtn = document.createElement("button");
  resetBtn.className = "eBtn ghost";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset dismissed";
  resetBtn.title = "Bring back events you dismissed (does not affect My Plan)";
  controlsWrap.appendChild(resetBtn);

  const venueBtn = document.createElement("button");
  venueBtn.className = "eBtn ghost";
  venueBtn.type = "button";
  venueBtn.textContent = store.venueOnly ? "MA Venues: Only whitelist" : "MA Venues: All";
  venueBtn.title = "This filters ONLY MetalAgenda (+ Venue Watch). TM/TV always show.";
  controlsWrap.appendChild(venueBtn);

  resetBtn.addEventListener("click", () => {
    store.dismissedIds = [];
    saveStore(store);
    render(lastEvents, lastDropped);
  });

  venueBtn.addEventListener("click", () => {
    store.venueOnly = !store.venueOnly;
    saveStore(store);
    venueBtn.textContent = store.venueOnly ? "MA Venues: Only whitelist" : "MA Venues: All";
    render(lastEvents, lastDropped);
  });

  // Debug helpers
  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    get lastDropped() { return lastDropped; },
    setBaseApi(next) {
      store.baseApi = String(next || "").trim();
      saveStore(store);
    },
    setUiScoreMin(n) {
      store.uiScoreMin = Math.max(0, Math.min(100, Number(n) || 0));
      saveStore(store);
      render(lastEvents, lastDropped);
    },
    setHeardPlaysMin(n) {
      store.heardPlaysMin = Math.max(0, Math.min(999999, Number(n) || 0));
      saveStore(store);
      render(lastEvents, lastDropped);
    },
    setVenueOnly(v) {
      store.venueOnly = Boolean(v);
      saveStore(store);
      render(lastEvents, lastDropped);
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

  function setEmpty(msg) {
    listEl.innerHTML = `<div class="eEmpty">${msg}</div>`;
  }

  function pill(text) {
    const div = document.createElement("div");
    div.className = "ePill";
    div.textContent = text;
    return div;
  }

  function buildCard(event, finalScore, sectionType) {
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

    if (event.__kind === "dropped") {
      meta.textContent = `Venue Watch • Not matched to taste • Open venue page for details`;
    } else {
      const venuePart = event.venue ? ` • ${event.venue}` : "";
      meta.textContent = `${formatDateTime(event.start)} • ${event.city}${venuePart}`;
    }

    const meta2 = document.createElement("div");
    meta2.className = "eMeta2";
    if (event.__kind === "dropped") {
      meta2.textContent = `Reason: ${event.level || "no_match_to_taste_or_ecosystem"}`;
    } else if (sectionType === "heard") {
      meta2.textContent = `You have listened to this artist (plays ≥ ${store.heardPlaysMin}).`;
    } else if (sectionType === "plan") {
      meta2.textContent = `Saved in your plan.`;
    } else {
      meta2.textContent = `Suggestion based on your taste (score ≥ ${store.uiScoreMin}).`;
    }

    const pills = document.createElement("div");
    pills.className = "ePills";

    if (event.__kind !== "dropped") {
      pills.appendChild(pill(`Plays: ${Number(event.plays || 0)}`));
      if (event.source) pills.appendChild(pill(`Src: ${String(event.source).toUpperCase()}`));
    } else {
      pills.appendChild(pill(`Src: ${String(event.source || "MA").toUpperCase()}`));
      pills.appendChild(pill(`Watchlist`));
    }

    main.appendChild(artist);
    main.appendChild(meta);
    main.appendChild(meta2);
    main.appendChild(pills);

    const right = document.createElement("div");
    right.className = "eRight";

    const scoreEl = document.createElement("div");
    scoreEl.className = "eScore";
    scoreEl.textContent = event.__kind === "dropped" ? "—" : `${finalScore}/100`;

    const badgeEl = document.createElement("div");
    badgeEl.className = "eBadge";
    badgeEl.textContent =
      event.__kind === "dropped" ? "WATCH" :
      sectionType === "heard" ? "HEARD" :
      sectionType === "plan" ? "PLAN" :
      "SUGGEST";

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

    if (event.__kind !== "dropped") {
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

        btnPrimary.addEventListener("click", async () => {
          await addToPlan(event.id);
          render(lastEvents, lastDropped);
        });

        btnSecondary.addEventListener("click", async () => {
          await dismiss(event.id);
          render(lastEvents, lastDropped);
        });
      } else {
        btnPrimary.textContent = "Remove";
        btnSecondary.textContent = "Dismiss";

        btnPrimary.addEventListener("click", async () => {
          await removeFromPlan(event.id);
          render(lastEvents, lastDropped);
        });

        btnSecondary.addEventListener("click", async () => {
          await dismiss(event.id);
          render(lastEvents, lastDropped);
        });
      }

      actions.appendChild(btnSecondary);
      actions.appendChild(btnPrimary);
    }

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

  function render(events, dropped) {
    const venueOnly = Boolean(store.venueOnly);

    // ✅ Filter ONLY MA events when venueOnly = true.
    // TM/TV always pass through.
    let visibleBase = events.slice();
    if (venueOnly) {
      visibleBase = visibleBase.filter(ev => {
        if (!looksLikeMA(ev)) return true; // keep TM/TV always
        return isWhitelistedMAUrl(ev.url);
      });
    }

    // Hide dismissed (unless planned)
    const visible = visibleBase.filter(ev => (isPlanned(ev.id) ? true : !isDismissed(ev.id)));

    const heardMin = Number(store.heardPlaysMin || 5);
    const uiMin = Number(store.uiScoreMin || 40);

    const finalMap = new Map();
    for (const ev of visible) finalMap.set(ev.id, computeFinalScore(ev));

    const planned = visible.filter(ev => isPlanned(ev.id));
    const rest = visible.filter(ev => !isPlanned(ev.id));

    const heard = rest.filter(ev => Number(ev.plays || 0) >= heardMin);
    const suggestions = rest.filter(ev => Number(ev.plays || 0) < heardMin && finalMap.get(ev.id) >= uiMin);

    // Venue Watch (dropped) — filter whitelist only if venueOnly
    let watch = Array.isArray(dropped) ? dropped.slice() : [];
    if (venueOnly) watch = watch.filter(ev => isWhitelistedMAUrl(ev.url));
    watch = watch.filter(ev => !isDismissed(ev.id));

    function sortByScoreThenDate(a, b) {
      const sa = finalMap.get(a.id);
      const sb = finalMap.get(b.id);
      if (sb !== sa) return sb - sa;
      return a.start.getTime() - b.start.getTime();
    }

    planned.sort(sortByScoreThenDate);

    heard.sort((a, b) => {
      const pa = Number(a.plays || 0);
      const pb = Number(b.plays || 0);
      if (pb !== pa) return pb - pa;
      return sortByScoreThenDate(a, b);
    });

    suggestions.sort(sortByScoreThenDate);

    listEl.innerHTML = "";

    const addSection = (title, arr, typeForCards) => {
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
        listEl.appendChild(wrap);
        return;
      }

      if (typeForCards === "watch") {
        for (const ev of arr) wrap.appendChild(buildCard(ev, 0, "watch"));
        listEl.appendChild(wrap);
        return;
      }

      if (!store.groupByCity) {
        for (const ev of arr) wrap.appendChild(buildCard(ev, finalMap.get(ev.id), typeForCards));
      } else {
        const grouped = groupByCity(arr);
        for (const [city, items] of grouped) {
          const cityPill = document.createElement("div");
          cityPill.className = "ePill";
          cityPill.textContent = `${city} • ${items.length} event(s)`;
          cityPill.style.opacity = ".85";
          wrap.appendChild(cityPill);

          items.sort((a, b) => a.start.getTime() - b.start.getTime());
          for (const ev of items) wrap.appendChild(buildCard(ev, finalMap.get(ev.id), typeForCards));
        }
      }

      listEl.appendChild(wrap);
    };

    addSection("My Plan", planned, "plan");
    addSection(`Heard (Standard) • plays ≥ ${heardMin}`, heard, "heard");
    addSection(`Suggestions • score ≥ ${uiMin}`, suggestions, "suggest");
    addSection("Venue Watch • on your venues but not matched to taste", watch, "watch");

    if (!planned.length && !heard.length && !suggestions.length && !watch.length) {
      setEmpty("No events yet. Tap Refresh.");
    }
  }

  async function refresh(overrides = {}) {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing…");

    try {
      const { events: rawEvents, dropped: rawDropped } = await fetchConcertsFromWorker(overrides);
      const events = dedupeEvents(rawEvents);

      lastEvents = events;
      lastDropped = rawDropped;

      render(events, rawDropped);
    } catch (err) {
      console.warn("[eConcerts] worker fetch failed:", err);
      lastEvents = [];
      lastDropped = [];
      setEmpty(`Worker error: ${String(err && err.message ? err.message : err)}`);
    }
  }

  // Group toggle
  groupBtn.addEventListener("click", async () => {
    store.groupByCity = !store.groupByCity;
    saveStore(store);

    groupBtn.setAttribute("aria-pressed", store.groupByCity ? "true" : "false");
    groupBtn.textContent = store.groupByCity ? "Group by city" : "Ungroup";

    render(lastEvents, lastDropped);
  });

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

    tabBtn.addEventListener("click", () => {
      const hasCards = listEl.querySelector(".eCard");
      if (!hasCards) refresh().catch(() => {});
    }, { passive: true });
  }

  wireTabAutoRefresh();
})();