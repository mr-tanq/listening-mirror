/* econcerts.js (FULL FILE REPLACE) — PART 1/3
   TM + MetalAgenda • Premium/minimal • Better dedupe
   + SPLIT VIEW:
     - "Heard (Standard)" = plays >= 5
     - "Suggestions" = plays < 5 AND score >= 40 (UI filter)
   + IMPORTANT:
     - We always call worker with scoreMin=0 (avoid worker-side scoreMin bugs)
     - tasteArtists fixed to 1000 (your rule)
*/
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel)); // kept for future

  const pad2 = (n) => String(n).padStart(2, "0");

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

  function isValidDate(d) {
    return d instanceof Date && !Number.isNaN(d.getTime());
  }

  // ---------- Storage ----------
  // v7 (split view + UI filters + worker scoreMin forced 0)
  const STORE_KEY = "lm_econcerts_v7";

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
          uiScoreMin: 40,       // only applies to Suggestions
          heardPlaysMin: 5,     // "heard standard" threshold
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
  // RULES:
  // - tasteArtists is ALWAYS 1000 (your rule)
  // - worker scoreMin forced to 0 to avoid worker-side bugs and let UI filter suggestions
  const ECONCERTS_DEFAULTS = {
    size: 50,
    radiusKm: 30,       // only used if city is set
    scoreMin: 0,        // forced 0 (worker-side)
    tasteArtists: 1000, // fixed
    city: "",           // empty => whole NL
    countryCode: "NL",
    sources: "tm,ma",
  };

  function normalizeSources(input) {
    const raw = safeStr(input) || "tm,ma";
    const parts = raw.split(",").map(s => lowerKey(s)).filter(Boolean);
    const allowed = new Set(["tm", "ma"]);
    const out = [];
    for (const p of parts) if (allowed.has(p) && !out.includes(p)) out.push(p);
    return out.length ? out.join(",") : "tm,ma";
  }

  async function fetchConcertsFromWorker(overrides = {}) {
    const cfg = { ...ECONCERTS_DEFAULTS, ...overrides };
    const base = getBaseApi();
    const u = new URL(base + "/econcerts");

    // worker params
    u.searchParams.set("sources", normalizeSources(cfg.sources));
    u.searchParams.set("size", String(cfg.size));
    u.searchParams.set("scoreMin", "0");                // ✅ ALWAYS 0
    u.searchParams.set("tasteArtists", "1000");         // ✅ ALWAYS 1000
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
    return events.map(ev => {
      const startStr = safeStr(ev.start);
      const startDate = new Date(startStr);

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
        score: Number(ev.score || 0),                   // ✅ from worker (after patch)
        level: safeStr(ev.level || ""),
        startTs: Number(ev.startTs || 0) || (isValidDate(startDate) ? startDate.getTime() : 0),
        source: safeStr(ev.source || ev.src || ""),
        star: Boolean(ev.star),
      };
    }).filter(x => x.id && x.artist && isValidDate(x.start));
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
    const step = 10 * 60 * 1000; // 10 min
    return Math.round(ts / step) * step;
  }
  function softKey(ev) {
    const ts = Number(ev.startTs || 0) || ev.start.getTime();
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

  // ---------- Simple scoring model (UI-side bonus only) ----------
  // We trust worker.score as the “music match” score.
  // UI final score = worker.score + Utrecht bonus (+4).
  function computeFinalScore(event) {
    let s = Number(event.score || 0);
    if (lowerKey(event.city) === "utrecht") s += 4; // ✅ your only extra factor
    s = Math.max(0, Math.min(100, Math.round(s)));
    return s;
  }

  // ---------- State + UI nodes ----------
  let lastEvents = [];

  const listEl = $("#econcertsList");
  const refreshBtn = $("#econcertsRefresh");
  const groupBtn = $("#econcertsToggleGroup");

  if (!listEl || !refreshBtn || !groupBtn) return;

  groupBtn.setAttribute("aria-pressed", store.groupByCity ? "true" : "false");
  groupBtn.textContent = store.groupByCity ? "Group by city" : "Ungroup";

  // Add "Reset dismissed" button next to Refresh
  const resetBtn = document.createElement("button");
  resetBtn.className = "eBtn ghost";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset dismissed";
  resetBtn.title = "Bring back events you dismissed (does not affect My Plan)";
  if (refreshBtn && refreshBtn.parentElement) refreshBtn.parentElement.appendChild(resetBtn);

  resetBtn.addEventListener("click", () => {
    store.dismissedIds = [];
    saveStore(store);
    render(lastEvents);
  });

  // Debug helpers (simple + safe)
  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
    setBaseApi(next) {
      store.baseApi = String(next || "").trim();
      saveStore(store);
    },
    // ✅ These are SIMPLE toggles (no code knowledge needed)
    setUiScoreMin(n) {
      store.uiScoreMin = Math.max(0, Math.min(100, Number(n) || 0));
      saveStore(store);
      render(lastEvents);
    },
    setHeardPlaysMin(n) {
      store.heardPlaysMin = Math.max(0, Math.min(999999, Number(n) || 0));
      saveStore(store);
      render(lastEvents);
    },
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
/* econcerts.js (FULL FILE REPLACE) — PART 2/3 */

  function buildCard(event, finalScore, sectionType) {
    const card = document.createElement("div");
    card.className = "eCard";
    card.dataset.id = event.id;

    const main = document.createElement("div");
    main.className = "eMain";

    const artist = document.createElement("div");
    artist.className = "eArtist";
    artist.textContent = event.artist;

    // Minimal meta line
    const meta = document.createElement("div");
    meta.className = "eMeta";
    const venuePart = event.venue ? ` • ${event.venue}` : "";
    meta.textContent = `${formatDateTime(event.start)} • ${event.city}${venuePart}`;

    const meta2 = document.createElement("div");
    meta2.className = "eMeta2";
    // Section label explanation (simple language)
    if (sectionType === "heard") {
      meta2.textContent = `You have listened to this artist (plays ≥ ${store.heardPlaysMin}).`;
    } else {
      meta2.textContent = `Suggestion based on your taste (score ≥ ${store.uiScoreMin}).`;
    }

    // Pills: plays + source (small info)
    const pills = document.createElement("div");
    pills.className = "ePills";
    pills.appendChild(pill(`Plays: ${Number(event.plays || 0)}`));
    if (event.source) pills.appendChild(pill(`Src: ${String(event.source).toUpperCase()}`));

    main.appendChild(artist);
    main.appendChild(meta);
    main.appendChild(meta2);
    main.appendChild(pills);

    const right = document.createElement("div");
    right.className = "eRight";

    const scoreEl = document.createElement("div");
    scoreEl.className = "eScore";
    scoreEl.textContent = `${finalScore}/100`;

    const badgeEl = document.createElement("div");
    badgeEl.className = "eBadge";
    // Simple badge only: HEARD / SUGGEST
    badgeEl.textContent = sectionType === "heard" ? "HEARD" : "SUGGEST";

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

      btnPrimary.addEventListener("click", async () => {
        await addToPlan(event.id);
        render(lastEvents);
      });

      btnSecondary.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents);
      });
    } else {
      btnPrimary.textContent = "Remove";
      btnSecondary.textContent = "Dismiss";

      btnPrimary.addEventListener("click", async () => {
        await removeFromPlan(event.id);
        render(lastEvents);
      });

      btnSecondary.addEventListener("click", async () => {
        await dismiss(event.id);
        render(lastEvents);
      });
    }

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

  function render(events) {
    // Show planned always; hide dismissed unless planned
    const visible = events.filter(ev => (isPlanned(ev.id) ? true : !isDismissed(ev.id)));

    // Split logic (your request)
    const heardMin = Number(store.heardPlaysMin || 5);
    const uiMin = Number(store.uiScoreMin || 40);

    // Compute final score map once
    const finalMap = new Map();
    for (const ev of visible) finalMap.set(ev.id, computeFinalScore(ev));

    // Planned first (keep behavior)
    const planned = visible.filter(ev => isPlanned(ev.id));

    // Non-planned:
    const rest = visible.filter(ev => !isPlanned(ev.id));

    // Heard (standard): plays >= heardMin
    const heard = rest.filter(ev => Number(ev.plays || 0) >= heardMin);

    // Suggestions: plays < heardMin and score >= uiMin
    // Note: use FINAL score for filtering (so Utrecht can push it over)
    const suggestions = rest.filter(ev => Number(ev.plays || 0) < heardMin && finalMap.get(ev.id) >= uiMin);

    // Sort within each section:
    // - Planned: by score desc, then date asc
    // - Heard: by plays desc, then score desc, then date asc
    // - Suggestions: by score desc, then date asc
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

    // Render
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

      if (!store.groupByCity) {
        for (const ev of arr) {
          wrap.appendChild(buildCard(ev, finalMap.get(ev.id), typeForCards));
        }
      } else {
        const grouped = groupByCity(arr);
        for (const [city, items] of grouped) {
          const cityPill = document.createElement("div");
          cityPill.className = "ePill";
          cityPill.textContent = `${city} • ${items.length} event(s)`;
          cityPill.style.opacity = ".85";
          wrap.appendChild(cityPill);

          items.sort((a, b) => a.start.getTime() - b.start.getTime());
          for (const ev of items) {
            wrap.appendChild(buildCard(ev, finalMap.get(ev.id), typeForCards));
          }
        }
      }

      listEl.appendChild(wrap);
    };

    addSection("My Plan", planned, "heard"); // plan is always “important”
    addSection(`Heard (Standard) • plays ≥ ${heardMin}`, heard, "heard");
    addSection(`Suggestions • score ≥ ${uiMin}`, suggestions, "suggest");

    // If EVERYTHING empty
    if (!planned.length && !heard.length && !suggestions.length) {
      setEmpty("No events yet. Tap Refresh.");
    }
  }
/* econcerts.js (FULL FILE REPLACE) — PART 3/3 */

  async function refresh(overrides = {}) {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing…");

    try {
      const raw = await fetchConcertsFromWorker(overrides);

      // ✅ dedupe to kill VIP/comfort spam etc.
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

  // Refresh button
  refreshBtn.addEventListener("click", async () => {
    await refresh(); // NL-wide default
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