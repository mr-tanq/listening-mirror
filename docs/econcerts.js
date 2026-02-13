/* ============================
   econcerts.js  (PART 1/4)
   Full file - delete & paste all parts in order.
   ============================ */

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function toISODate(d) {
    // YYYY-MM-DD in local time
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseLocalDateTime(isoLike) {
    // expects "YYYY-MM-DDTHH:mm"
    // (no timezone) -> local time Date
    const [datePart, timePart] = isoLike.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const [hh, mm] = timePart.split(":").map(Number);
    return new Date(y, (m - 1), d, hh, mm, 0, 0);
  }

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

  // ---------- Storage (memory) ----------
  const STORE_KEY = "lm_econcerts_v1";

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { planIds: [], dismissedIds: [], lastRefreshAt: 0, groupByCity: true };
      const obj = JSON.parse(raw);
      return {
        planIds: Array.isArray(obj.planIds) ? obj.planIds : [],
        dismissedIds: Array.isArray(obj.dismissedIds) ? obj.dismissedIds : [],
        lastRefreshAt: Number(obj.lastRefreshAt || 0),
        groupByCity: Boolean(obj.groupByCity ?? true),
      };
    } catch {
      return { planIds: [], dismissedIds: [], lastRefreshAt: 0, groupByCity: true };
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  // ---------- Mock "Listening Profile" (replace later with Last.fm) ----------
  // plays map is used to compute score tiers
  const mockProfile = {
    plays: {
      metallica: 200,
      amenra: 150,
      mono: 90,
      "sólstafir": 60,
      solstafir: 60,
      opeth: 80,
      "queens of the stone age": 55,
    },
  };

  function getPlaysForArtist(artistName) {
    const k = lowerKey(artistName);
    return Number(mockProfile.plays[k] || 0);
  }

  function tierFromPlays(plays) {
    if (plays >= 120) return "core";
    if (plays >= 40) return "known";
    if (plays >= 10) return "maybe";
    return "discovery";
  }

  function baseScoreFromTier(tier) {
    if (tier === "core") return 72;
    if (tier === "known") return 58;
    if (tier === "maybe") return 45;
    return 32;
  }

  // ---------- Your shift cycle rules ----------
  // You told me: 10-day cycle starting reference:
  // 18 Oct 2025 = Day 1 Off
  // Pattern (10 days):
  // Day 1-4: Off
  // Day 5: Morning 1 (07-15)
  // Day 6: Morning 2 (07-15)
  // Day 7: Afternoon 1 (15-23)
  // Day 8: Afternoon 2 (15-23)
  // Day 9: Night 1 (23-07)  <-- starts at 23:00 of that day
  // Day10: Night 2 (23-07)  <-- starts at 23:00 of that day
  const REF_LOCAL = new Date(2025, 9, 18, 0, 0, 0, 0); // months are 0-based: 9=Oct
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
    const mod = ((diffDays % 10) + 10) % 10; // 0..9
    return mod; // 0=Day1 Off
  }

  function shiftForDate(dateLocal) {
    const d0 = new Date(dateLocal.getFullYear(), dateLocal.getMonth(), dateLocal.getDate(), 0, 0, 0, 0);
    const idx = dayIndexInCycle(d0);
    return SHIFT_BY_DAY[idx];
  }

  function availabilityBadgeForEvent(eventStart) {
    // eventStart is Date local
    // Rule you stated:
    // If you have a night shift that starts 23:00 on the same calendar day,
    // then a concert at 21:00 same day is NOT feasible -> conflict.
    const shift = shiftForDate(eventStart);
    const hour = eventStart.getHours();

    // Base: off / work
    let badge = "FREE";
    let why = "Looks doable";

    if (shift.type === "night") {
      // event is same day as night shift start
      // if event starts before 23:00, it's still conflict in real life for you.
      if (hour >= 0 && hour <= 22) {
        badge = "CONFLICT";
        why = "Night shift starts 23:00 today";
      }
    } else if (shift.type === "afternoon") {
      // If concert is evening (>=19) and you work until 23, conflict
      if (hour >= 15) {
        badge = "CONFLICT";
        why = "Afternoon shift ends 23:00";
      }
    } else if (shift.type === "morning") {
      // Morning shift: evening is free (good), but still fatigue.
      badge = "OK";
      why = "Morning shift — evening is free";
    } else if (shift.type === "off") {
      badge = "FREE";
      why = "Off day";
    }

    // Difficulty modifiers you told me:
    if (shift.lastDayOff) {
      // last day off is harder because next day you wake 06:00 (for morning shift day)
      badge = badge === "FREE" ? "HARD" : badge;
      why = "Last day off — early wake-up next day";
    }
    if (shift.secondMorning) {
      // 2nd morning: easier to go out because next day is afternoon (starts 15:00)
      badge = badge === "OK" ? "EASY" : badge;
      if (badge === "FREE") badge = "EASY";
      why = "2nd morning — free evening and late start next day";
    }

    return { badge, why, shift };
  }

  // ---------- Mock events (replace later with real concert API / Sonic Kick) ----------
  function mockFetchConcertsNL() {
    // Use future dates so it always shows something.
    // You can edit these any time.
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-based

    const mk = (id, artist, city, venue, dateStr, url) => ({
      id,
      artist,
      city,
      venue,
      start: parseLocalDateTime(dateStr),
      url: url || "",
      country: "NL",
    });

    // Keep date strings stable but future-ish:
    const d1 = new Date(y, m, Math.min(28, now.getDate() + 7), 21, 0);
    const d2 = new Date(y, m, Math.min(28, now.getDate() + 14), 20, 30);
    const d3 = new Date(y, m, Math.min(28, now.getDate() + 21), 19, 30);
    const d4 = new Date(y, m, Math.min(28, now.getDate() + 25), 21, 30);

    const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    return Promise.resolve([
      mk("ev_metallica_utrecht", "Metallica", "Utrecht", "TivoliVredenburg (example)", iso(d1), "https://example.com/metallica"),
      mk("ev_amenra_amsterdam", "Amenra", "Amsterdam", "AFAS Live (example)", iso(d2), "https://example.com/amenra"),
      mk("ev_mono_rotterdam", "Mono", "Rotterdam", "Rotown (example)", iso(d3), "https://example.com/mono"),
      mk("ev_solstafir_denhaag", "Sólstafir", "The Hague", "Paard (example)", iso(d4), "https://example.com/solstafir"),
    ]);
  }

  // We'll keep state in memory (and persist plan/dismiss).
  let store = loadStore();
  let lastEvents = [];

  // UI nodes
  const listEl = $("#econcertsList");
  const refreshBtn = $("#econcertsRefresh");
  const groupBtn = $("#econcertsToggleGroup");

  if (!listEl || !refreshBtn || !groupBtn) {
    // This script is safe: if the panel doesn't exist, do nothing.
    return;
  }

  // init group button state from store
  groupBtn.setAttribute("aria-pressed", store.groupByCity ? "true" : "false");
  groupBtn.textContent = store.groupByCity ? "Group by city" : "Ungroup";

  // Expose small debug in console
  window.__LM_ECONCERTS__ = {
    get store() { return store; },
    get lastEvents() { return lastEvents; },
  };
/* ============================
   econcerts.js  (PART 2/4)
   ============================ */

  function computePriority(event) {
    const plays = getPlaysForArtist(event.artist);
    const tier = tierFromPlays(plays);
    let score = baseScoreFromTier(tier);

    // proximity boost (so closer shows feel more urgent)
    const daysAway = Math.max(0, Math.round((event.start.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    const proximityBoost = clamp01(1 - (daysAway / 60)); // within ~60 days
    score += Math.round(proximityBoost * 18); // +0..18

    // small city preference boost: Utrecht (you live nearby) – keep minimal and factual
    if (lowerKey(event.city) === "utrecht") score += 4;

    // availability affects score:
    const av = availabilityBadgeForEvent(event.start);
    if (av.badge === "CONFLICT") score -= 18;
    if (av.badge === "HARD") score -= 8;
    if (av.badge === "EASY") score += 6;

    score = Math.max(0, Math.min(100, score));
    return { score, tier, plays, availability: av };
  }

  function isPlanned(id) {
    return store.planIds.includes(id);
  }
  function isDismissed(id) {
    return store.dismissedIds.includes(id);
  }

  async function addToPlan(id) {
    if (!store.planIds.includes(id)) store.planIds.push(id);
    // if it was dismissed, un-dismiss it
    store.dismissedIds = store.dismissedIds.filter(x => x !== id);
    saveStore(store);
  }

  async function dismiss(id) {
    if (!store.dismissedIds.includes(id)) store.dismissedIds.push(id);
    // if it was planned, remove from plan
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

  function buildCard(event, computed) {
    const { score, tier, plays, availability } = computed;
    const { badge, why, shift } = availability;

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
    meta.textContent = `${formatDateTime(event.start)}  •  ${event.city}  •  ${event.venue}`;

    const meta2 = document.createElement("div");
    meta2.className = "eMeta2";
    meta2.textContent = `Shift: ${shift.label} • ${why}`;

    const pills = document.createElement("div");
    pills.className = "ePills";
    pills.appendChild(pill(`Score: ${score}/100`));
    pills.appendChild(pill(`Tier: ${tier}`));
    pills.appendChild(pill(`Plays: ${plays}`));
    pills.appendChild(pill(`Badge: ${badge}`));

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
        render(lastEvents); // re-render
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

    // Link (optional)
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
    // sort cities
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function render(events) {
    // Filter dismissed from suggestions view, but keep planned visible.
    const visible = events.filter(ev => {
      if (isPlanned(ev.id)) return true;
      return !isDismissed(ev.id);
    });

    // Sort by priority score desc, then date asc
    const computedMap = new Map();
    for (const ev of visible) computedMap.set(ev.id, computePriority(ev));

    visible.sort((a, b) => {
      const ca = computedMap.get(a.id).score;
      const cb = computedMap.get(b.id).score;
      if (cb !== ca) return cb - ca;
      return a.start.getTime() - b.start.getTime();
    });

    if (!visible.length) {
      setEmpty("No events yet. Tap Refresh.");
      return;
    }

    // split planned vs suggested (so you see your plan first)
    const planned = visible.filter(ev => isPlanned(ev.id));
    const suggested = visible.filter(ev => !isPlanned(ev.id));

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
        for (const ev of arr) {
          wrap.appendChild(buildCard(ev, computedMap.get(ev.id)));
        }
      } else {
        const grouped = groupByCity(arr);
        for (const [city, items] of grouped) {
          const cityPill = document.createElement("div");
          cityPill.className = "ePill";
          cityPill.textContent = `${city} • ${items.length} event(s)`;
          cityPill.style.opacity = ".85";
          wrap.appendChild(cityPill);

          // inside city: sort by date
          items.sort((a, b) => a.start.getTime() - b.start.getTime());
          for (const ev of items) {
            wrap.appendChild(buildCard(ev, computedMap.get(ev.id)));
          }
        }
      }

      listEl.appendChild(wrap);
    };

    addSection("My Plan", planned);
    addSection("Upcoming", suggested);
  }
/* ============================
   econcerts.js  (PART 3/4)
   ============================ */

  async function refresh() {
    // "Memory": keep lastRefreshAt
    store.lastRefreshAt = Date.now();
    saveStore(store);

    setEmpty("Refreshing…");
    const events = await mockFetchConcertsNL();
    lastEvents = events;
    render(events);
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

  // Optional: refresh once on first load of the page
  // (we won't auto-switch tabs; we just populate when available)
  if (!store.lastRefreshAt) {
    refresh().catch(() => setEmpty("Failed to refresh."));
  } else {
    // If you already refreshed before, render from fresh mock fetch anyway (simple)
    refresh().catch(() => setEmpty("Failed to refresh."));
  }

  // If you want: small hook to auto-refresh when the eConcerts tab becomes active.
  // This is safe and won't break your existing tab logic.
  function wireTabAutoRefresh() {
    const tabBtn = document.querySelector('.tabBtn[data-tab="econcerts"]');
    if (!tabBtn) return;

    tabBtn.addEventListener("click", () => {
      // If list is empty, fetch. Otherwise do nothing.
      const hasCards = listEl.querySelector(".eCard");
      if (!hasCards) refresh().catch(() => {});
    }, { passive: true });
  }

  wireTabAutoRefresh();
/* ============================
   econcerts.js  (PART 4/4)
   ============================ */

  // ---------- Tiny sanity diagnostics ----------
  // This helps you quickly see if the shift logic is aligned with your expectation.
  function debugShiftForNextDays() {
    // prints 12 days from today with shift code
    const out = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 0, 0, 0, 0);
      const sh = shiftForDate(d);
      out.push(`${toISODate(d)} -> ${sh.code}`);
    }
    // comment out if you don't want console noise:
    // console.log("[eConcerts] shift preview:", out);
  }

  debugShiftForNextDays();

})();