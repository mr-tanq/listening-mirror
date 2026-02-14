/* econcerts.js (FULL FILE REPLACE) — PART 1/4
   Listening Mirror • eConcerts UI
   Works with Cloudflare Worker: GET {BASE}/econcerts
   Scoring v2:
     Heard (plays>=1) +55
     Serious (plays>=10) +15
     TasteMatch (0..25) from tier
     Utrecht +5
   Lists:
     - Heard (never filtered by uiScoreMin)
     - Proposals (filtered by uiScoreMin)
*/
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const pad2 = (n) => String(n).padStart(2, "0");

  function lowerKey(s) {
    return String(s || "").trim().toLowerCase();
  }
  function safeStr(s) {
    return String(s || "").trim();
  }
  function isValidDate(d) {
    return d instanceof Date && !Number.isNaN(d.getTime());
  }
  function formatDateTime(d) {
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${y}-${m}-${dd} • ${hh}:${mm}`;
  }

  // ---------- Time window: 16:00–22:09 ----------
  function minutesSinceMidnight(d) {
    return d.getHours() * 60 + d.getMinutes();
  }
  function isWithinShowWindow(startDate) {
    const m = minutesSinceMidnight(startDate);
    const min = 16 * 60;      // 16:00
    const max = 22 * 60 + 9;  // 22:09
    return m >= min && m <= max;
  }

  // ---------- Storage ----------
  // v7: added uiScoreMin + heardPlaysMin + new scoring + heard/proposals split
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
          uiScoreMin: 55,       // cuts only Proposals
          heardPlaysMin: 1,     // Heard threshold
        };
      }
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        groupByCity: Boolean(obj.groupByCity ?? true),
        baseApi: String(obj.baseApi || ""),
        uiScoreMin: Number.isFinite(Number(obj.uiScoreMin)) ? Number(obj.uiScoreMin) : 55,
        heardPlaysMin: Number.isFinite(Number(obj.heardPlaysMin)) ? Number(obj.heardPlaysMin) : 1,
      };
    } catch {
      return {
        planIds: [],
        dismissedIds: [],
        lastRefreshAt: 0,
        groupByCity: true,
        baseApi: "",
        uiScoreMin: 55,
        heardPlaysMin: 1,
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
    size: 200,
    radiusKm: 30,       // only used if city is set
    scoreMin: 0,        // IMPORTANT: worker scoreMin is NOT used for UI filtering
    tasteArtists: 2000,
    city: "",
    countryCode: "NL",
    sources: "tm,ma",
  };

  function normalizeSources(input) {
    const raw = safeStr(input) || "tm,ma";
    const parts = raw.split(",").map((s) => lowerKey(s)).filter(Boolean);
    const allowed = new Set(["tm", "ma"]);
    const out = [];
    for (const p of parts) if (allowed.has(p) && !out.includes(p)) out.push(p);
    return out.length ? out.join(",") : "tm,ma";
  }

  async function fetchConcertsFromWorker(overrides = {}) {
    const cfg = { ...ECONCERTS_DEFAULTS, ...overrides };
    const base = getBaseApi();

    const u = new URL(base + "/econcerts");
    u.searchParams.set("sources", normalizeSources(cfg.sources));
    u.searchParams.set("size", String(cfg.size));
    u.searchParams.set("scoreMin", String(cfg.scoreMin)); // worker filter; keep 0 for maximum data
    u.searchParams.set("tasteArtists", String(cfg.tasteArtists));
    u.searchParams.set("countryCode", String(cfg.countryCode || "NL"));

    const city = safeStr(cfg.city);
    if (city) {
      u.searchParams.set("city", city);
      u.searchParams.set("radiusKm", String(cfg.radiusKm));
    }

    const res = await fetch(u.toString(), { method: "GET" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data || data.ok !== true) {
      const msg =
        data && (data.error || data.message)
          ? String(data.error || data.message)
          : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const events = Array.isArray(data.events) ? data.events : [];

    return events
      .map((ev) => {
        const startStr = safeStr(ev.start);
        const startDate = new Date(startStr);

        const plays = Number(ev.plays || 0);
        const tier = safeStr(ev.tier || "");
        const score = Number(ev.score || 0);

        return {
          id: safeStr(ev.id),
          artist: safeStr(ev.artist),
          attractions: Array.isArray(ev.attractions) ? ev.attractions : [],
          city: safeStr(ev.city),
          venue: safeStr(ev.venue),
          start: startDate,
          url: safeStr(ev.url),
          country: "NL",

          plays: Number.isFinite(plays) ? plays : 0,
          tier,
          score: Number.isFinite(score) ? score : 0,
          level: safeStr(ev.level || ""),
          startTs: Number(ev.startTs || 0) || (isValidDate(startDate) ? startDate.getTime() : 0),
          source: safeStr(ev.source || ev.src || "tm"),
        };
      })
      .filter((x) => x.id && x.artist && isValidDate(x.start))
      .filter((x) => isWithinShowWindow(x.start));
  }
/* econcerts.js (FULL FILE REPLACE) — PART 2/4 */

  // ---------- Shift cycle rules ----------
  // 18 Oct 2025 = Day 1 Off
  // Pattern (10 days): OFF1,OFF2,OFF3,OFF4, M1,M2, A1,A2, N1,N2
  const REF_LOCAL = new Date(2025, 9, 18, 0, 0, 0, 0); // 9=Oct
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
      if (hour >= 0 && hour <= 22) {
        badge = "CONFLICT";
        why = "Night shift starts 23:00 today";
      }
    } else if (shift.type === "afternoon") {
      if (hour >= 15) {
        badge = "CONFLICT";
        why = "Afternoon shift ends 23:00";
      }
    } else if (shift.type === "morning") {
      badge = "OK";
      why = "Morning shift — evening is free";
    } else if (shift.type === "off") {
      badge = "FREE";
      why = "Off day";
    }

    if (shift.lastDayOff && badge === "FREE") {
      badge = "HARD";
      why = "Last day off — early wake-up next day";
    }

    if (shift.secondMorning) {
      if (badge === "FREE" || badge === "OK") {
        badge = "MEDIUM";
        why = "2nd morning — doable but not easy";
      }
    }

    return { badge, why, shift };
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

    // prefer TM over MA if equal
    const aSrc = a.source === "tm" ? 1 : 0;
    const bSrc = b.source === "tm" ? 1 : 0;
    if (aSrc !== bSrc) return bSrc > aSrc ? b : a;

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
/* econcerts.js (FULL FILE REPLACE) — PART 3/4 */

  // ---------- ★ rule (ONLY Tivoli + plays>=100) ----------
  function isTivoli(venueName) {
    const v = lowerKey(venueName);
    return v.includes("tivoli vredenburg") || v.includes("tivolivredenburg");
  }
  function shouldStarEvent(ev) {
    return isTivoli(ev.venue) && Number(ev.plays || 0) >= 100;
  }

  // ---------- Scoring v2 (your rules) ----------
  function tierFromPlays(plays) {
    if (plays >= 120) return "core";
    if (plays >= 40) return "known";
    if (plays >= 10) return "maybe";
    return "discovery";
  }

  // TasteMatch (0..25) — this is “do I like this kind of music?”
  // Since we don't have genre data, we treat your actual listening (plays) as the best signal.
  function tasteMatchPoints(plays) {
    const t = tierFromPlays(plays);
    if (t === "core") return 25;
    if (t === "known") return 18;
    if (t === "maybe") return 10;
    return 0;
  }

  function computeIndexScore(ev) {
    const plays = Number(ev.plays || 0);
    const heard = plays >= Number(store.heardPlaysMin || 1);

    let score = 0;

    // Heard = big base
    if (heard) score += 55;

    // Serious = extra if you have listened “properly”
    if (plays >= 10) score += 15;

    // TasteMatch 0..25
    score += tasteMatchPoints(plays);

    // Utrecht bonus
    if (lowerKey(ev.city) === "utrecht") score += 5;

    // cap to 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    return { score, heard };
  }

  function computePriority(event) {
    const plays = Number(event.plays || 0);
    const tier = event.tier ? event.tier : tierFromPlays(plays);

    // Score = your index score
    const idx = computeIndexScore(event);
    let score = idx.score;

    // availability adjustment (small, to avoid ruining your taste score)
    const av = availabilityBadgeForEvent(event.start);
    if (av.badge === "CONFLICT") score -= 15;
    if (av.badge === "HARD") score -= 6;
    if (av.badge === "MEDIUM") score -= 2;

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      score,
      tier,
      plays,
      availability: av,
      heard: idx.heard,
    };
  }

  // ---------- State ----------
  let lastEvents = [];

  // ---------- UI Nodes ----------
  const listEl = $("#econcertsList");
  const refreshBtn = $("#econcertsRefresh");
  const groupBtn = $("#econcertsToggleGroup");
  if (!listEl || !refreshBtn || !groupBtn) return;

  // Group button: show action text
  function syncGroupButton() {
    groupBtn.setAttribute("aria-pressed", store.groupByCity ? "true" : "false");
    groupBtn.textContent = store.groupByCity ? "Ungroup" : "Group by city";
  }
  syncGroupButton();

  // Add "Reset dismissed" button next to Refresh
  const resetBtn = document.createElement("button");
  resetBtn.className = "eBtn ghost";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset dismissed";
  resetBtn.title = "Bring back events you dismissed (does not affect My Plan)";
  if (refreshBtn.parentElement) refreshBtn.parentElement.appendChild(resetBtn);

  resetBtn.addEventListener("click", () => {
    store.dismissedIds = [];
    saveStore(store);
    render(lastEvents);
  });

  // ---------- Debug controls (safe, no internal error) ----------
  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },

    // Worker base
    setBaseApi(next) {
      store.baseApi = String(next || "").trim();
      saveStore(store);
    },

    // UI filters
    setUiScoreMin(n) {
      const v = Number(n);
      store.uiScoreMin = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : store.uiScoreMin;
      saveStore(store);
      render(lastEvents);
      return store.uiScoreMin;
    },
    setHeardPlaysMin(n) {
      const v = Number(n);
      store.heardPlaysMin = Number.isFinite(v) ? Math.max(1, Math.min(9999, Math.round(v))) : store.heardPlaysMin;
      saveStore(store);
      render(lastEvents);
      return store.heardPlaysMin;
    },

    // quick test
    refreshNearUtrecht() {
      return refresh({ city: "Utrecht", radiusKm: 30 });
    }
  };

  // ---------- Plan / Dismiss ----------
  const isPlanned = (id) => store.planIds.includes(id);
  const isDismissed = (id) => store.dismissedIds.includes(id);

  async function addToPlan(id) {
    if (!store.planIds.includes(id)) store.planIds.push(id);
    store.dismissedIds = store.dismissedIds.filter((x) => x !== id);
    saveStore(store);
  }
  async function dismiss(id) {
    if (!store.dismissedIds.includes(id)) store.dismissedIds.push(id);
    store.planIds = store.planIds.filter((x) => x !== id);
    saveStore(store);
  }
  async function removeFromPlan(id) {
    store.planIds = store.planIds.filter((x) => x !== id);
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
/* econcerts.js (FULL FILE REPLACE) — PART 4/4 */

  function buildCard(event, computed) {
    const { score, tier, plays, availability, heard } = computed;
    const { badge, why, shift } = availability;

    const card = document.createElement("div");
    card.className = "eCard";
    card.dataset.id = event.id;

    const main = document.createElement("div");
    main.className = "eMain";

    const artist = document.createElement("div");
    artist.className = "eArtist";
    artist.textContent = event.artist;

    const venueStar = shouldStarEvent(event) ? " ★" : "";
    const venueLabel = event.venue ? `${event.venue}${venueStar}` : (venueStar ? `★` : "");

    const meta = document.createElement("div");
    meta.className = "eMeta";
    meta.textContent = `${formatDateTime(event.start)}  •  ${event.city}${venueLabel ? "  •  " + venueLabel : ""}`;

    const meta2 = document.createElement("div");
    meta2.className = "eMeta2";
    meta2.textContent = `Shift: ${shift.label} • ${why}`;

    const pills = document.createElement("div");
    pills.className = "ePills";
    pills.appendChild(pill(`Tier: ${tier}`));
    pills.appendChild(pill(`Plays: ${plays}`));
    pills.appendChild(pill(heard ? "Heard: YES" : "Heard: NO"));

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
    const visible = events.filter((ev) => (isPlanned(ev.id) ? true : !isDismissed(ev.id)));

    const computedMap = new Map();
    for (const ev of visible) computedMap.set(ev.id, computePriority(ev));

    // split: Heard vs Proposals
    const heard = visible.filter((ev) => computedMap.get(ev.id).heard);
    const proposalsAll = visible.filter((ev) => !computedMap.get(ev.id).heard);

    // UI score min affects only proposals
    const uiMin = Number(store.uiScoreMin || 0);
    const proposals = proposalsAll.filter((ev) => computedMap.get(ev.id).score >= uiMin);

    // sort each group: score desc, then date asc
    const sorter = (a, b) => {
      const ca = computedMap.get(a.id).score;
      const cb = computedMap.get(b.id).score;
      if (cb !== ca) return cb - ca;
      return a.start.getTime() - b.start.getTime();
    };
    heard.sort(sorter);
    proposals.sort(sorter);

    if (!heard.length && !proposals.length) {
      setEmpty("No events yet. Tap Refresh.");
      return;
    }

    const planned = visible.filter((ev) => isPlanned(ev.id));
    // planned can include heard or proposals, but we show My Plan first always
    planned.sort(sorter);

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
    addSection(`Heard (plays ≥ ${store.heardPlaysMin})`, heard.filter((ev) => !isPlanned(ev.id)));
    addSection(`Proposals (score ≥ ${uiMin})`, proposals.filter((ev) => !isPlanned(ev.id)));
  }

  async function refresh(overrides = {}) {
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing…");

    try {
      const raw = await fetchConcertsFromWorker(overrides);

      // dedupe
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
    syncGroupButton();
    render(lastEvents);
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