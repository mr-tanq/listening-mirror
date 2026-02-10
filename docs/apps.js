/* Listening Mirror UI (fits your Cloudflare Worker contract)
  - /api/now -> { ok, item|null }
  - /api/history?limit=10 -> { ok, items[] }
  - /api/top?type=tracks|artists|albums&period=today|week|year&limit=20 -> { ok, items[] }
  - /img?u=... is already returned as `image` paths by Worker (e.g. "/img?u=...") so we prefix baseUrl.
*/

const $ = (id) => document.getElementById(id);

const LS = {
  settings: "lm_settings_worker_v1",
  cache_now: "lm_cache_now_v1",
  cache_recent: "lm_cache_recent_v1",
  cache_top: "lm_cache_top_v1",
};

const DEFAULT = {
  baseUrl: "",
};

let state = {
  tab: "now",
  topType: "tracks",
  topPeriod: "today",
};

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function loadSettings() {
  const raw = localStorage.getItem(LS.settings);
  const parsed = raw ? safeJsonParse(raw, null) : null;
  const baseUrl = (parsed?.baseUrl || DEFAULT.baseUrl || "").trim().replace(/\/+$/, "");
  return { baseUrl };
}

function saveSettings(s) {
  localStorage.setItem(LS.settings, JSON.stringify(s));
}

function setStatus(text, ok = false) {
  const el = $("statusText");
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--muted2)";
}

function fmtErr(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  return e.message || String(e);
}

function withTimeout(ms, promise) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error("Request timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function fetchJson(url, timeoutMs = 12000) {
  const res = await withTimeout(
    timeoutMs,
    fetch(url, { method: "GET", headers: { "accept": "application/json" }, cache: "no-store" })
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt.slice(0, 180)}`);
  }

  const j = await res.json();
  if (j && j.ok === false) throw new Error(j.error || "API returned ok:false");
  return j;
}

function joinBase(baseUrl, maybePath) {
  if (!baseUrl) return "";
  if (!maybePath) return "";
  // Worker returns image paths like "/img?u=..."
  if (String(maybePath).startsWith("http")) return String(maybePath);
  if (String(maybePath).startsWith("/")) return baseUrl + String(maybePath);
  return baseUrl + "/" + String(maybePath);
}

/* ---------- UI helpers ---------- */

function setCover(imageUrl) {
  const box = $("npCover");
  box.innerHTML = "";
  if (!imageUrl) {
    const f = document.createElement("div");
    f.className = "coverFallback";
    f.textContent = "♪";
    box.appendChild(f);
    return;
  }
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "Cover";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.onerror = () => {
    box.innerHTML = "";
    const f = document.createElement("div");
    f.className = "coverFallback";
    f.textContent = "♪";
    box.appendChild(f);
  };
  box.appendChild(img);
}

function renderNow(item, baseUrl) {
  if (!item) {
    $("npTrack").textContent = "—";
    $("npArtist").textContent = "—";
    $("npAlbum").textContent = "—";
    $("npTime").textContent = "Not playing now";
    $("npPill").textContent = "OFF";
    setCover("");
    $("npMeta").textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    return;
  }

  $("npTrack").textContent = item.name || "—";
  $("npArtist").textContent = item.artist || "—";
  $("npAlbum").textContent = item.album ? `Album: ${item.album}` : "—";
  $("npTime").textContent = "Playing now";
  $("npPill").textContent = "LIVE";
  $("npMeta").textContent = `Updated: ${new Date().toLocaleTimeString()}`;

  setCover(joinBase(baseUrl, item.image));
}

function renderRecent(items, baseUrl) {
  const wrap = $("recentList");
  wrap.innerHTML = "";

  if (!items?.length) {
    const d = document.createElement("div");
    d.className = "note";
    d.textContent = "No recent history returned.";
    wrap.appendChild(d);
    return;
  }

  items.slice(0, 10).forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "rowItem";

    const main = document.createElement("div");
    main.className = "rowMain";

    const top = document.createElement("div");
    top.className = "rowTop";

    const title = document.createElement("div");
    title.className = "rowTitle";
    title.textContent = `${i + 1}. ${t.name || "—"}`;

    const right = document.createElement("div");
    right.className = "rowRight";
    right.textContent = "";

    top.appendChild(title);
    top.appendChild(right);

    const sub = document.createElement("div");
    sub.className = "rowSub";
    sub.textContent = t.artist || "—";

    main.appendChild(top);
    main.appendChild(sub);

    row.appendChild(main);

    // small cover on the left (optional, but looks nice)
    if (t.image) {
      const c = document.createElement("div");
      c.className = "cover";
      c.style.width = "44px";
      c.style.height = "44px";
      c.style.borderRadius = "12px";
      const img = document.createElement("img");
      img.src = joinBase(baseUrl, t.image);
      img.alt = "art";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      c.appendChild(img);
      row.prepend(c);
    }

    wrap.appendChild(row);
  });
}

function renderTop(items, baseUrl, type) {
  const wrap = $("topList");
  wrap.innerHTML = "";

  if (!items?.length) {
    const d = document.createElement("div");
    d.className = "note";
    d.textContent = "No top data returned.";
    wrap.appendChild(d);
    return;
  }

  items.slice(0, 50).forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "rowItem";

    if (it.image) {
      const c = document.createElement("div");
      c.className = "cover";
      c.style.width = "44px";
      c.style.height = "44px";
      c.style.borderRadius = "12px";
      const img = document.createElement("img");
      img.src = joinBase(baseUrl, it.image);
      img.alt = "art";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      c.appendChild(img);
      row.appendChild(c);
    }

    const main = document.createElement("div");
    main.className = "rowMain";

    const top = document.createElement("div");
    top.className = "rowTop";

    const title = document.createElement("div");
    title.className = "rowTitle";
    title.textContent =
      type === "artists"
        ? `${idx + 1}. ${it.name || "—"}`
        : `${idx + 1}. ${it.name || "—"}`;

    const right = document.createElement("div");
    right.className = "rowRight";
    right.textContent = it.playcount != null ? `${it.playcount} plays` : "";

    top.appendChild(title);
    top.appendChild(right);

    const sub = document.createElement("div");
    sub.className = "rowSub";
    if (type === "tracks") sub.textContent = it.artist || " ";
    else if (type === "albums") sub.textContent = it.artist || " ";
    else sub.textContent = " ";

    main.appendChild(top);
    main.appendChild(sub);

    row.appendChild(main);
    wrap.appendChild(row);
  });
}

/* ---------- Tabs ---------- */

function setMainTab(tab) {
  state.tab = tab;

  const map = [
    ["now", "tabNow", "panelNow"],
    ["top", "tabTop", "panelTop"],
    ["recent", "tabRecent", "panelRecent"],
  ];

  for (const [key, tabId, panelId] of map) {
    const isOn = key === tab;
    $(tabId).setAttribute("aria-selected", isOn ? "true" : "false");
    $(panelId).classList.toggle("hidden", !isOn);
  }

  if (tab === "now") loadNow();
  if (tab === "top") loadTop();
  if (tab === "recent") loadRecent();
}

function setTopType(type) {
  state.topType = type;
  document.querySelectorAll("[data-top-type]").forEach(btn => {
    btn.setAttribute("aria-selected", btn.dataset.topType === type ? "true" : "false");
  });
  loadTop();
}

function setTopPeriod(period) {
  state.topPeriod = period;
  document.querySelectorAll("[data-top-period]").forEach(btn => {
    btn.setAttribute("aria-selected", btn.dataset.topPeriod === period ? "true" : "false");
  });
  loadTop();
}

/* ---------- Loaders ---------- */

async function loadNow() {
  const { baseUrl } = loadSettings();

  if (!baseUrl) {
    setStatus("Set Worker URL in Settings", false);
    const cached = safeJsonParse(localStorage.getItem(LS.cache_now) || "", null);
    renderNow(cached?.item ?? null, baseUrl);
    return;
  }

  const url = baseUrl + "/api/now";
  setStatus("Loading…", true);

  try {
    const j = await fetchJson(url);
    localStorage.setItem(LS.cache_now, JSON.stringify(j));
    renderNow(j.item ?? null, baseUrl);
    setStatus("Online", true);
  } catch (e) {
    setStatus(`Error: ${fmtErr(e)}`, false);
    const cached = safeJsonParse(localStorage.getItem(LS.cache_now) || "", null);
    renderNow(cached?.item ?? null, baseUrl);
  }
}

async function loadRecent() {
  const { baseUrl } = loadSettings();

  if (!baseUrl) {
    $("recentMeta").textContent = "Set Worker URL in Settings";
    const cached = safeJsonParse(localStorage.getItem(LS.cache_recent) || "", null);
    renderRecent(cached?.items ?? [], baseUrl);
    return;
  }

  const url = baseUrl + "/api/history?limit=10";
  $("recentMeta").textContent = "Loading…";
  setStatus("Loading…", true);

  try {
    const j = await fetchJson(url);
    localStorage.setItem(LS.cache_recent, JSON.stringify(j));
    renderRecent(j.items ?? [], baseUrl);
    $("recentMeta").textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    setStatus("Online", true);
  } catch (e) {
    $("recentMeta").textContent = `Error: ${fmtErr(e)}`;
    setStatus(`Error: ${fmtErr(e)}`, false);
    const cached = safeJsonParse(localStorage.getItem(LS.cache_recent) || "", null);
    renderRecent(cached?.items ?? [], baseUrl);
  }
}

async function loadTop() {
  const { baseUrl } = loadSettings();
  const type = state.topType;
  const period = state.topPeriod;

  $("topPill").textContent = `${type} • ${period}`;

  if (!baseUrl) {
    $("topMeta").textContent = "Set Worker URL in Settings";
    const cached = safeJsonParse(localStorage.getItem(LS.cache_top) || "", null);
    renderTop(cached?.items ?? [], baseUrl, type);
    return;
  }

  const url = `${baseUrl}/api/top?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}&limit=20`;
  $("topMeta").textContent = "Loading…";
  setStatus("Loading…", true);

  try {
    const j = await fetchJson(url);
    localStorage.setItem(LS.cache_top, JSON.stringify(j));
    renderTop(j.items ?? [], baseUrl, type);
    $("topMeta").textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    setStatus("Online", true);
  } catch (e) {
    $("topMeta").textContent = `Error: ${fmtErr(e)}`;
    setStatus(`Error: ${fmtErr(e)}`, false);
    const cached = safeJsonParse(localStorage.getItem(LS.cache_top) || "", null);
    renderTop(cached?.items ?? [], baseUrl, type);
  }
}

/* ---------- Settings ---------- */

function openSettings() {
  const s = loadSettings();
  $("baseUrlInput").value = s.baseUrl || "";
  $("settingsModal").showModal();
}

/* ---------- Wire ---------- */

function wire() {
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => setMainTab(btn.dataset.tab));
  });

  document.querySelectorAll("[data-top-type]").forEach(btn => {
    btn.addEventListener("click", () => setTopType(btn.dataset.topType));
  });

  document.querySelectorAll("[data-top-period]").forEach(btn => {
    btn.addEventListener("click", () => setTopPeriod(btn.dataset.topPeriod));
  });

  $("refreshBtn").addEventListener("click", () => {
    if (state.tab === "now") loadNow();
    if (state.tab === "top") loadTop();
    if (state.tab === "recent") loadRecent();
  });

  $("settingsBtn").addEventListener("click", openSettings);

  $("settingsForm").addEventListener("submit", () => {
    const baseUrl = ($("baseUrlInput").value || "").trim().replace(/\/+$/, "");
    saveSettings({ baseUrl });

    if (state.tab === "now") loadNow();
    if (state.tab === "top") loadTop();
    if (state.tab === "recent") loadRecent();
  });

  $("resetBtn").addEventListener("click", () => {
    saveSettings({ baseUrl: "" });
    $("baseUrlInput").value = "";
  });
}

wire();
setMainTab("now");
