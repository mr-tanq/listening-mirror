/* econcerts.js (FULL FILE REPLACE) — SINGLE PART
   TM + MetalAgenda + Tivoli • Premium/minimal • Better dedupe
   + SPLIT VIEW:
     - "Heard (Standard)" = plays >= heardPlaysMin
     - "Suggestions" = plays < heardPlaysMin AND finalScore >= uiScoreMin
   + IMPORTANT:
     - We always call worker with scoreMin=0
     - tasteArtists fixed to 1000
   + FIXES FOR TIVOLI:
     - allow sources: tm, ma, tv
     - use startTs for Date (avoid parsing Amsterdam-local string without timezone)
   + NEW (what you asked):
     - Stop “irrelevant Tivoli” suggestions (talks, specials, podcasts, etc.)
     - Rule: Tivoli items can appear in Suggestions ONLY if they look like MUSIC.
       (Heard/My Plan always show even if title looks non-music.)
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
  // v8 (tivoli non-music suggestion filter)
  const STORE_KEY = "lm_econcerts_v8";

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

          // ✅ New: hide non-music Tivoli in Suggestions
          hideNonMusicTvSuggestions: true,
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

        hideNonMusicTvSuggestions: Boolean(obj.hideNonMusicTvSuggestions ?? true),
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
        hideNonMusicTvSuggestions: true,
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
    size: 50,
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
    u.searchParams.set("scoreMin", "0");        // ✅ ALWAYS 0
    u.searchParams.set("tasteArtists", "1000"); // ✅ ALWAYS 1000
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
    const step = 10 * 60 * 1000;
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

  // ---------- UI-side score ----------
  function computeFinalScore(event) {
    let s = Number(event.score || 0);
    if (lowerKey(event.city) === "utrecht") s += 4;
    s = Math.max(0, Math.min(100, Math.round(s)));
    return s;
  }

  // ---------- Tivoli “music-only suggestions” filter ----------
  // Goal: stop suggesting talks/specials/etc from Tivoli when you have 0 plays.
  // This does NOT affect:
  // - My Plan
  // - Heard (plays >= heardPlaysMin)
  //
  // It ONLY gates “Suggestions” for source=tv.
  function tvLooksLikeMusic(ev) {
    const title = lowerKey(ev?.artist || "");
    const venue = lowerKey(ev?.venue || "");
    const url = lowerKey(ev?.url || "");
    const blob = `${title} ${venue} ${url}`.trim();

    // If it explicitly looks like a concert, let it through.
    const musicYes = [
      "concert", "live", "album release", "release show", "tour",
      "ft.", "feat", "featuring", "support", "special guest",
      "dj", "clubnight", "club night", "afterparty", "after party",
      "orchestra", "symphony", "ensemble", "quartet", "trio",
      "impro", "improvis", "jazz", "metal", "doom", "ambient",
      "electronic", "techno", "house", "dnb", "drum", "bass",
      "hiphop", "hip-hop", "rap", "indie", "rock", "pop",
      "folk", "classical",
    ];

    // If it looks like a talk/lecture/event (non-music), block it.
    const musicNo = [
      // English
      "talk", "lecture", "debate", "panel", "workshop", "masterclass", "conference", "symposium",
      "podcast", "q&a", "screening", "film", "theatre", "theater", "dance", "comedy", "cabaret",
      "kids", "children", "family", "expo", "exhibition",
      // Dutch
      "lezing", "debat", "workshop", "college", "congres", "symposium",
      "podcast", "film", "theater", "dans", "cabaret",
      "kind", "kinderen", "familie",
      // Specific “special” vibes that are often not concerts
      "how-to", "special", "olympics", "winter olympics", "tech bro", "tech bros", "hoe ",
    ];

    // Strong allow: Tivoli pages that clearly are music programs
    for (const k of musicYes) {
      if (blob.includes(k)) return true;
    }

    // Strong deny: looks like non-music program
    for (const k of musicNo) {
      if (blob.includes(k)) return false;
    }

    // Neutral fallback:
    // If we cannot tell, we assume NOT MUSIC for Suggestions
    // (because Tivoli has a lot of non-music programs).
    return false;
  }

  function isTvSource(ev) {
    const s = lowerKey(ev?.source || "");
    return s === "tv";
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

    // ✅ Toggle: if you ever want to see all Tivoli suggestions again
    setHideNonMusicTvSuggestions(on) {
      store.hideNonMusicTvSuggestions = Boolean(on);
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
    const venuePart = event.venue ? ` • ${event.venue}` : "";
    meta.textContent = `${formatDateTime(event.start)} • ${event.city}${venuePart}`;

    const meta2 = document.createElement("div");
    meta2.className = "eMeta2";
    if (sectionType === "heard") {
      meta2.textContent = `You have listened to this artist (plays ≥ ${store.heardPlaysMin}).`;
    } else {
      // For tv, clarify it is “music-only suggestions”
      if (isTvSource(event) && store.hideNonMusicTvSuggestions) {
        meta2.textContent = `Suggestion based on your taste (score ≥ ${store.uiScoreMin}) • Tivoli music-only.`;
      } else {
        meta2.textContent = `Suggestion based on your taste (score ≥ ${store.uiScoreMin}).`;
      }
    }

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
    const visible = events.filter(ev => (isPlanned(ev.id) ? true : !isDismissed(ev.id)));

    const heardMin = Number(store.heardPlaysMin || 5);
    const uiMin = Number(store.uiScoreMin || 40);

    const finalMap = new Map();
    for (const ev of visible) finalMap.set(ev.id, computeFinalScore(ev));

    const planned = visible.filter(ev => isPlanned(ev.id));
    const rest = visible.filter(ev => !isPlanned(ev.id));

    const heard = rest.filter(ev => Number(ev.plays || 0) >= heardMin);

    // ✅ Suggestions with Tivoli non-music filter
    const suggestions = rest.filter(ev => {
      const plays = Number(ev.plays || 0);
      if (plays >= heardMin) return false;

      const scoreOk = (finalMap.get(ev.id) >= uiMin);
      if (!scoreOk) return false;

      // If it's Tivoli and toggle is on, only show if title looks like MUSIC.
      if (store.hideNonMusicTvSuggestions && isTvSource(ev)) {
        return tvLooksLikeMusic(ev);
      }

      return true;
    });

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

    addSection("My Plan", planned, "heard");
    addSection(`Heard (Standard) • plays ≥ ${heardMin}`, heard, "heard");
    addSection(`Suggestions • score ≥ ${uiMin}`, suggestions, "suggest");

    if (!planned.length && !heard.length && !suggestions.length) {
      setEmpty("No events yet. Tap Refresh.");
    }
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