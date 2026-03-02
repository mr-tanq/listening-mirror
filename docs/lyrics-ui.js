/* lyrics-ui.js
   Listening Mirror — Lyrics UI (inject-only)
   - Injects a Lyrics card under the Mirror card on the NOW panel
   - Fetches lyrics from your Cloudflare Worker
   - Shows ONLY lyric text (no timestamps)
   - Hidden when no lyrics found
*/

(() => {
  const LYRICS_ENDPOINT = "https://lyrics.errtanq9.workers.dev/lyrics";
  const POLL_MS = 2500;

  let lastKey = "";
  let aborter = null;

  function $(id) { return document.getElementById(id); }

  function safeText(el) {
    return (el?.textContent || "").trim();
  }

  // Light cleanup — keeps titles readable for matching
  function cleanTitle(s) {
    s = (s || "").toString().trim();
    if (!s) return "";
    return s
      .replace(/\s+/g, " ")
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/\s*[\(\[]\s*(feat\.?|ft\.?)\s+[^)\]]+[\)\]]\s*/gi, " ")
      .replace(/\s*[\(\[]\s*(remaster(ed)?|live|radio edit|edit|version|mix|demo|bonus track|deluxe|expanded|anniversary)\b[^)\]]*[\)\]]\s*/gi, " ")
      .replace(/\s*-\s*(remaster(ed)?|live|radio edit|edit|version|mix|demo|bonus track|deluxe|expanded|anniversary)\b.*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ensureCardInjected() {
    if ($("lyricsCard")) return;

    const nowPanel = document.querySelector('.panel[data-panel="now"]');
    if (!nowPanel) return;

    const mirrorCard = $("mirrorCard");
    if (!mirrorCard) return;

    const card = document.createElement("div");
    card.id = "lyricsCard";
    card.className = "card";
    card.style.marginTop = "16px";
    card.style.display = "none"; // hidden until we have lyrics

    card.innerHTML = `
      <div style="padding:16px 18px 18px 18px;">
        <div style="
          font-size:11.5px;
          letter-spacing:.34px;
          color:rgba(255,255,255,.62);
          text-transform:uppercase;
          margin-bottom:12px;
          display:flex;
          align-items:center;
          gap:10px;
        ">
          <span class="dot on" aria-hidden="true"></span>
          Lyrics
        </div>

        <div id="lyricsText" style="
          white-space:pre-line;
          font-size:14px;
          line-height:1.55;
          color:rgba(255,255,255,.90);
          max-height:420px;
          overflow:auto;
          padding-right:6px;
        "></div>
      </div>
    `;

    // Insert right after Mirror card (as in your screenshot)
    mirrorCard.insertAdjacentElement("afterend", card);
  }

  function hideCard() {
    const card = $("lyricsCard");
    if (card) card.style.display = "none";
  }

  function showLyrics(text) {
    const card = $("lyricsCard");
    const box = $("lyricsText");
    if (!card || !box) return;

    box.textContent = text;
    card.style.display = "block";
  }

  function renderFromResponse(payload) {
    // Your worker returns: { ok:true, found, synced, lrc, lines, plain, ... }
    if (!payload || !payload.ok || !payload.found) {
      hideCard();
      return;
    }

    // Prefer synced lines (but display only the text)
    let text = "";

    if (Array.isArray(payload.lines) && payload.lines.length) {
      const out = [];
      let lastLine = "";

      for (const ln of payload.lines) {
        const t = (ln?.text || "").trim();
        if (!t) continue;
        // de-dupe consecutive duplicates (common in LRC)
        if (t === lastLine) continue;
        lastLine = t;
        out.push(t);
      }

      text = out.join("\n");
    } else if (payload.plain) {
      text = String(payload.plain).trim();
    } else if (payload.lrc) {
      // last resort: strip timestamps from raw lrc
      const raw = String(payload.lrc);
      text = raw
        .split("\n")
        .map(l => l.replace(/\[[0-9:.]+\]/g, "").trim())
        .filter(Boolean)
        .join("\n");
    }

    // If it’s too short, treat as “no lyrics”
    if (!text || text.length < 20) {
      hideCard();
      return;
    }

    showLyrics(text);
  }

  async function fetchLyrics(artist, track, album) {
    ensureCardInjected();

    const a = cleanTitle(artist);
    const t = cleanTitle(track);
    const al = cleanTitle(album || "");

    if (!a || !t || t === "—" || a === "—") {
      hideCard();
      return;
    }

    const key = `${a}::${t}::${al}`;
    if (key === lastKey) return;
    lastKey = key;

    if (aborter) aborter.abort();
    aborter = new AbortController();

    try {
      const qs = new URLSearchParams({ artist: a, track: t });
      if (al) qs.set("album", al);

      const url = `${LYRICS_ENDPOINT}?${qs.toString()}`;
      const res = await fetch(url, { signal: aborter.signal });
      const data = await res.json();

      renderFromResponse(data);
    } catch (e) {
      hideCard();
    }
  }

  function readNow() {
    const track = safeText($("nowTrack"));
    const artist = safeText($("nowArtist"));
    const album = safeText($("nowAlbum"));
    return { track, artist, album };
  }

  function isNowPanelActive() {
    const nowPanel = document.querySelector('.panel[data-panel="now"]');
    if (!nowPanel) return true;
    return !nowPanel.classList.contains("hidden");
  }

  function tick() {
    if (!isNowPanelActive()) return;

    const { track, artist, album } = readNow();
    if (track && artist && track !== "—" && artist !== "—") {
      fetchLyrics(artist, track, album);
    } else {
      hideCard();
    }
  }

  // Boot
  function boot() {
    ensureCardInjected();
    tick();

    // Poll (simple + reliable with your existing UI updates)
    setInterval(tick, POLL_MS);

    // Extra: react faster on DOM updates
    const nt = $("nowTrack");
    const na = $("nowArtist");
    if (nt && na && window.MutationObserver) {
      const mo = new MutationObserver(() => tick());
      mo.observe(nt, { childList: true, characterData: true, subtree: true });
      mo.observe(na, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
