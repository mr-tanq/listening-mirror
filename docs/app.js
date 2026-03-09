/* app.js (FULL FILE REPLACE) — PART 1/3
   Listening Mirror — Data bridge for new layout
   ✅ Loads Recent / Top from Worker
   ✅ Fills:
      - #recentList
      - #topList
      - #concertsList
      - #concertMatchesList
      - #archiveList
   ✅ Compatible with spotify-click-play.js row parsing
*/

(() => {
  "use strict";

  const API_BASE = "https://i.errtanq9.workers.dev";

  const TOP_LIMIT_DEFAULT = 10;
  const RECENT_LIMIT_DEFAULT = 20;

  const $ = (id) => document.getElementById(id);

  const topList = $("topList");
  const recentList = $("recentList");
  const concertsList = $("concertsList");
  const concertMatchesList = $("concertMatchesList");
  const archiveList = $("archiveList");

  const state = {
    topType: "tracks",
    topPeriod: "today",
    lastRecent: [],
    lastTop: []
  };

  function absApi(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith("/")) return API_BASE + urlOrPath;
    return API_BASE + "/" + urlOrPath;
  }

  async function apiGet(path) {
    const url = absApi(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderThumb(img) {
    const u = absApi(img || "");
    if (!u) return `<div class="thumbFallback">♪</div>`;
    return `<img src="${escapeHtml(u)}" alt="" loading="lazy" decoding="async" />`;
  }

  function rowHTML({ idx, title, sub, img, right = "", uri = "" }) {
    const safeTitle = escapeHtml(title || "—");
    const safeSub = escapeHtml(sub || "");
    const safeRight = escapeHtml(String(right || ""));
    const safeUri = escapeHtml(uri || "");

    return `
      <div
        class="row"
        role="listitem"
        aria-label="${idx}. ${safeTitle}"
        ${safeUri ? `data-spotify-uri="${safeUri}"` : ""}
      >
        <div class="thumb" aria-hidden="true">${renderThumb(img)}</div>
        <div class="mid">
          <div class="title">${escapeHtml(`${idx}. ${title || "—"}`)}</div>
          <div class="sub">${safeSub}</div>
        </div>
        <div class="right">${safeRight}</div>
      </div>
    `;
  }

  function cardMessageHTML(title, sub = "") {
    return `
      <div class="row" role="listitem">
        <div class="mid">
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
        </div>
      </div>
    `;
  }

  function setLoading(el, title, sub) {
    if (!el) return;
    el.innerHTML = cardMessageHTML(title, sub);
  }

  function setEmpty(el, title, sub) {
    if (!el) return;
    el.innerHTML = cardMessageHTML(title, sub);
  }

  function setError(el, title, sub) {
    if (!el) return;
    el.innerHTML = cardMessageHTML(title, sub);
  }

  function normalizeRecentPayload(j) {
    return (
      (j && j.ok && Array.isArray(j.items) && j.items) ||
      (j && j.ok && Array.isArray(j.history) && j.history) ||
      []
    );
  }

  function normalizeTopPayload(j) {
    return (
      (j && j.ok && Array.isArray(j.items) && j.items) ||
      []
    );
  }
   async function loadRecent() {
    if (!recentList) return false;

    try {
      setLoading(recentList, "Loading…", "Fetching recent listening…");

      const limit = RECENT_LIMIT_DEFAULT;
      const j = await apiGet(`/api/history?limit=${limit}`);
      const items = normalizeRecentPayload(j);

      state.lastRecent = items.slice();

      if (!items.length) {
        setEmpty(recentList, "No recent tracks", "Play something and refresh.");
        return true;
      }

      const html = items.map((it, i) => {
        const idx = i + 1;
        const title = it.name || "—";
        const artist = it.artist || "";
        const album = it.album || "";
        const sub = `${artist}${album ? " • " + album : ""}`.trim();
        const img = it.image || "";
        const right = it.time || it.date || "";
        const uri = it.uri || it.spotify_uri || "";

        return rowHTML({
          idx,
          title,
          sub,
          img,
          right,
          uri
        });
      }).join("");

      recentList.innerHTML = html;
      return true;
    } catch (e) {
      setError(recentList, "Couldn’t load Recent.", "Check connection / Worker.");
      return false;
    }
  }

  async function loadTop() {
    if (!topList) return false;

    try {
      setLoading(topList, "Loading…", "Fetching your top listening…");

      const type = state.topType;
      const period = state.topPeriod;
      const limit = TOP_LIMIT_DEFAULT;

      const j = await apiGet(`/api/top?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}&limit=${limit}`);
      const items = normalizeTopPayload(j);

      state.lastTop = items.slice();

      if (!items.length) {
        setEmpty(topList, "No data", "Try another period.");
        return true;
      }

      const html = items.map((it, i) => {
        const idx = i + 1;
        const title = it.name || "—";
        const sub = (type === "artists")
          ? ""
          : (it.artist || "");
        const img = it.image || "";
        const right = (it.playcount != null) ? it.playcount : "";
        const uri = it.uri || it.spotify_uri || "";

        return rowHTML({
          idx,
          title,
          sub,
          img,
          right,
          uri
        });
      }).join("");

      topList.innerHTML = html;
      return true;
    } catch (e) {
      setError(topList, "Couldn’t load Top.", "Check connection / Worker.");
      return false;
    }
  }

  function loadConcertPlaceholders() {
    if (concertsList && !concertsList.children.length) {
      concertsList.innerHTML = cardMessageHTML(
        "Concert feed not wired yet",
        "Your real concerts source can be connected next."
      );
    }

    if (concertMatchesList && !concertMatchesList.children.length) {
      concertMatchesList.innerHTML = cardMessageHTML(
        "No matches yet",
        "Matches will appear here when the concerts feed is connected."
      );
    }
  }

  function loadArchivePlaceholder() {
    if (archiveList && !archiveList.children.length) {
      archiveList.innerHTML = cardMessageHTML(
        "Archive ready",
        "Saved mirror states or history can render here later."
      );
    }
  }

  function bindTopPanelControls() {
    const identityView = $("viewIdentity");
    if (!identityView) return;

    let controls = $("topControlsBar");
    if (controls) return;

    const wrap = document.createElement("div");
    wrap.id = "topControlsBar";
    wrap.className = "card";
    wrap.style.marginBottom = "14px";
    wrap.innerHTML = `
      <div style="display:grid;gap:12px;">
        <div>
          <div style="font-size:12px;color:rgba(255,255,255,.62);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Top type</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="lmTopBtn" data-top-type="tracks">Tracks</button>
            <button type="button" class="lmTopBtn" data-top-type="artists">Artists</button>
          </div>
        </div>

        <div>
          <div style="font-size:12px;color:rgba(255,255,255,.62);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Period</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="lmPeriodBtn" data-top-period="today">Today</button>
            <button type="button" class="lmPeriodBtn" data-top-period="week">Week</button>
            <button type="button" class="lmPeriodBtn" data-top-period="month">Month</button>
            <button type="button" class="lmPeriodBtn" data-top-period="year">Year</button>
            <button type="button" class="lmPeriodBtn" data-top-period="overall">Overall</button>
          </div>
        </div>
      </div>
    `;

    const recentCard = recentList?.closest(".card");
    if (recentCard && recentCard.parentElement) {
      recentCard.parentElement.insertBefore(wrap, recentCard);
    } else {
      identityView.prepend(wrap);
    }

    const styleId = "lmTopControlsCss";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        .lmTopBtn,.lmPeriodBtn{
          border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.04);
          color:rgba(255,255,255,.88);
          border-radius:999px;
          padding:8px 12px;
          font:inherit;
          font-size:13px;
          cursor:pointer;
        }
        .lmTopBtn.is-active,.lmPeriodBtn.is-active{
          background:rgba(255,255,255,.12);
          border-color:rgba(255,255,255,.22);
          color:#fff;
        }
      `;
      document.head.appendChild(st);
    }
     function syncButtons() {
      document.querySelectorAll(".lmTopBtn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.topType === state.topType);
      });
      document.querySelectorAll(".lmPeriodBtn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.topPeriod === state.topPeriod);
      });
    }

    wrap.addEventListener("click", async (e) => {
      const typeBtn = e.target.closest(".lmTopBtn");
      const periodBtn = e.target.closest(".lmPeriodBtn");

      if (typeBtn) {
        state.topType = typeBtn.dataset.topType || "tracks";
        syncButtons();
        await loadTop();
        return;
      }

      if (periodBtn) {
        state.topPeriod = periodBtn.dataset.topPeriod || "today";
        syncButtons();
        await loadTop();
      }
    });

    syncButtons();
  }

  function bindTabPrefetch() {
    const tabConcerts = $("tabConcerts");
    const tabIdentity = $("tabIdentity");
    const tabArchive = $("tabArchive");

    tabIdentity?.addEventListener("click", async () => {
      if (!recentList?.children.length || recentList.textContent.includes("No data")) {
        await loadRecent();
      }
      if (!topList?.children.length || topList.textContent.includes("No data")) {
        await loadTop();
      }
    });

    tabConcerts?.addEventListener("click", () => {
      loadConcertPlaceholders();
    });

    tabArchive?.addEventListener("click", () => {
      loadArchivePlaceholder();
    });
  }

  async function boot() {
    bindTopPanelControls();
    bindTabPrefetch();

    loadConcertPlaceholders();
    loadArchivePlaceholder();

    await Promise.all([
      loadRecent(),
      loadTop()
    ]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
