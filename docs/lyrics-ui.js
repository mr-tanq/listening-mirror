/* lyrics-ui.js (FULL FILE REPLACE)
   Listening Mirror — Lyrics UI (inject-only)
   ✅ Injects Lyrics card under Mirror on NOW panel
   ✅ Fetches from Cloudflare Worker
   ✅ Shows ONLY lyric text (no timestamps)
   ✅ Karaoke highlight + auto-scroll (uses Spotify Web API /me/player progress_ms)
   ✅ Hidden when no lyrics, EXCEPT strong instrumental keyword -> show small message
*/

(() => {
  "use strict";

  const LYRICS_ENDPOINT = "https://lyrics.errtanq9.workers.dev/lyrics";
  const SPOTIFY_API = "https://api.spotify.com/v1";

  // Polling intervals
  const NOW_POLL_MS = 2000;      // detect song change via DOM
  const PLAYER_POLL_MS = 900;    // get progress_ms
  const HILITE_THROTTLE_MS = 180;

  // UI / behavior
  const MIN_TEXT_LEN = 20;       // too short -> treat as no lyrics
  const AUTOSCROLL_PADDING = 0.32; // where to keep active line (0=top, 0.5=center)

  let lastSongKey = "";
  let lastLyricsKey = "";
  let lyricsAbort = null;

  let currentLines = null;      // [{timeMs, text}]
  let currentPlain = "";        // plain text
  let currentTrackId = "";      // spotify item id (best)
  let currentDurationMs = 0;
  let lastActiveIndex = -1;

  let lastHiliteTs = 0;

  function $(id){ return document.getElementById(id); }

  function safeText(el){ return (el?.textContent || "").trim(); }

  function cleanTitle(s){
    s = (s || "").toString().trim();
    if(!s) return "";
    return s
      .replace(/\s+/g, " ")
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, "-")
      // remove (feat...) blocks
      .replace(/\s*[\(\[]\s*(feat\.?|ft\.?)\s+[^)\]]+[\)\]]\s*/gi, " ")
      // remove remaster/live/etc blocks
      .replace(/\s*[\(\[]\s*(remaster(ed)?|live|radio edit|edit|version|mix|demo|bonus track|deluxe|expanded|anniversary)\b[^)\]]*[\)\]]\s*/gi, " ")
      // remove trailing "- remastered ..." etc
      .replace(/\s*-\s*(remaster(ed)?|live|radio edit|edit|version|mix|demo|bonus track|deluxe|expanded|anniversary)\b.*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isNowPanelActive(){
    const nowPanel = document.querySelector('.panel[data-panel="now"]');
    if(!nowPanel) return true;
    return !nowPanel.classList.contains("hidden");
  }

  function getToken(){
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    // fallback: spotify-player.js exposed getAccessToken too
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return window.SpotifyPlayer.getAccessToken();
    }
    return null;
  }

  function strongInstrumentalGuess(track){
    const t = (track || "").toLowerCase();
    if(!t) return false;
    const kws = [
      "instrumental",
      "intro",
      "interlude",
      "overture",
      "theme",
      "ost",
      "score",
      "ambient mix"
    ];
    return kws.some(k => t.includes(k));
  }

  function injectStylesOnce(){
    if (document.getElementById("lyricsUiStyles")) return;
    const st = document.createElement("style");
    st.id = "lyricsUiStyles";
    st.textContent = `
  #lyricsText .lyLine{
    padding: 4px 0;
    transition: opacity .14s ease, transform .14s ease, background .18s ease, box-shadow .18s ease, color .18s ease;
    opacity: .78;
  }

  #lyricsText .lyLine.dim{
    opacity: .48;
  }

  /* ✅ TURQUOISE HIGHLIGHT */
  #lyricsText .lyLine.active{
    opacity: 1;
    color: rgba(255,255,255,.98);

    background: linear-gradient(90deg,
      rgba(53,224,210,.22),
      rgba(53,224,210,.10) 55%,
      rgba(53,224,210,.00)
    );

    border-left: 3px solid rgba(53,224,210,.85);
    padding-left: 10px;
    margin-left: -10px;

    border-radius: 10px;

    box-shadow:
      0 0 0 1px rgba(53,224,210,.18),
      0 10px 30px rgba(53,224,210,.10),
      0 0 26px rgba(53,224,210,.16);

    text-shadow:
      0 0 18px rgba(53,224,210,.22),
      0 10px 30px rgba(0,0,0,.25);
  }

  #lyricsHint{
    font-size: 12.5px;
    color: rgba(255,255,255,.70);
    line-height: 1.45;
  }
`;
    document.head.appendChild(st);
  }

  function ensureCardInjected(){
    if ($("lyricsCard")) return;

    injectStylesOnce();

    const mirrorCard = $("mirrorCard");
    if(!mirrorCard) return;

    const card = document.createElement("div");
    card.id = "lyricsCard";
    card.className = "card";
    card.style.marginTop = "16px";
    card.style.display = "none"; // hidden until needed

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

        <div id="lyricsHint" style="display:none; margin-bottom:10px;"></div>

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

    mirrorCard.insertAdjacentElement("afterend", card);
  }

  function hideCard(){
    const card = $("lyricsCard");
    if(card) card.style.display = "none";
  }

  function showCard(){
    const card = $("lyricsCard");
    if(card) card.style.display = "block";
  }

  function setHint(text){
    const h = $("lyricsHint");
    if(!h) return;
    if(!text){
      h.style.display = "none";
      h.textContent = "";
      return;
    }
    h.textContent = text;
    h.style.display = "block";
  }

  function clearLyrics(){
    currentLines = null;
    currentPlain = "";
    lastActiveIndex = -1;
    const box = $("lyricsText");
    if(box) box.innerHTML = "";
    setHint("");
  }

  function renderPlain(text){
    const box = $("lyricsText");
    if(!box) return;

    // display as plain (no karaoke)
    box.textContent = text;
  }

  function renderSynced(lines){
    const box = $("lyricsText");
    if(!box) return;

    box.innerHTML = "";
    const frag = document.createDocumentFragment();

    for(let i=0;i<lines.length;i++){
      const d = document.createElement("div");
      d.className = "lyLine";
      d.dataset.i = String(i);
      d.textContent = lines[i].text;
      frag.appendChild(d);
    }

    box.appendChild(frag);
  }

  function normalizeLines(payloadLines){
    // payload.lines expected: [{ timeMs, text }]
    const out = [];
    let last = "";

    for(const ln of payloadLines || []){
      const t = (ln?.text || "").trim();
      const ms = Number(ln?.timeMs);
      if(!t) continue;
      if(!Number.isFinite(ms) || ms < 0) continue;

      // dedupe consecutive duplicates
      if(t === last) continue;
      last = t;

      out.push({ timeMs: ms, text: t });
    }

    // ensure sorted by time
    out.sort((a,b)=>a.timeMs - b.timeMs);
    return out;
  }

  function findActiveIndex(positionMs){
    const lines = currentLines;
    if(!lines || !lines.length) return -1;

    // Binary search: last line with timeMs <= positionMs
    let lo = 0, hi = lines.length - 1, ans = -1;
    while(lo <= hi){
      const mid = (lo + hi) >> 1;
      if(lines[mid].timeMs <= positionMs){
        ans = mid;
        lo = mid + 1;
      }else{
        hi = mid - 1;
      }
    }
    return ans;
  }

  function scrollToActive(index){
    const box = $("lyricsText");
    if(!box) return;

    const el = box.querySelector(`.lyLine[data-i="${index}"]`);
    if(!el) return;

    const boxRect = box.getBoundingClientRect();
    const elRect  = el.getBoundingClientRect();

    // target offset inside scroll container
    const targetY =
      (elRect.top - boxRect.top) + box.scrollTop
      - (box.clientHeight * AUTOSCROLL_PADDING);

    // smooth-ish but safe on mobile
    box.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }

  function applyHighlight(index){
    const box = $("lyricsText");
    if(!box) return;

    if(index === lastActiveIndex) return;
    lastActiveIndex = index;

    const nodes = box.querySelectorAll(".lyLine");
    if(!nodes || !nodes.length) return;

    nodes.forEach(n => {
      n.classList.remove("active");
      n.classList.remove("dim");
    });

    if(index < 0) return;

    // make neighbors slightly dim for focus
    for(let i=0;i<nodes.length;i++){
      if(i === index) continue;
      // dim far lines more
      if(Math.abs(i - index) >= 6) nodes[i].classList.add("dim");
    }

    const active = box.querySelector(`.lyLine[data-i="${index}"]`);
    if(active){
      active.classList.add("active");
      scrollToActive(index);
    }
  }

  async function spotifyMePlayer(){
    const token = getToken();
    if(!token) return null;

    try{
      const res = await fetch(`${SPOTIFY_API}/me/player`, {
        headers: { "Authorization": "Bearer " + token }
      });

      // 204: no active player
      if(res.status === 204) return null;

      const json = await res.json().catch(()=>null);
      if(!res.ok) return null;
      return json;
    }catch{
      return null;
    }
  }

  async function progressTick(){
    if(!isNowPanelActive()) return;
    if(!currentLines || !currentLines.length) return; // karaoke only when synced

    const now = Date.now();
    if(now - lastHiliteTs < HILITE_THROTTLE_MS) return;
    lastHiliteTs = now;

    const st = await spotifyMePlayer();
    if(!st || !st.item) return;

    const id = st.item.id || "";
    const pos = Number(st.progress_ms || 0);

    // If Spotify reports different track than what lyrics are for, don't highlight
    if(currentTrackId && id && currentTrackId !== id) return;

    const idx = findActiveIndex(pos);
    applyHighlight(idx);
  }

  function readNowDom(){
    const track = cleanTitle(safeText($("nowTrack")));
    const artist = cleanTitle(safeText($("nowArtist")));
    const album = cleanTitle(safeText($("nowAlbum")));
    return { track, artist, album };
  }

  async function fetchLyrics(artist, track, album){
    ensureCardInjected();

    const a = cleanTitle(artist);
    const t = cleanTitle(track);
    const al = cleanTitle(album || "");

    if(!a || !t || a === "—" || t === "—"){
      hideCard();
      return;
    }

    // Unique key for "song intent"
    const songKey = `${a}::${t}::${al}`;
    if(songKey === lastSongKey) return;
    lastSongKey = songKey;

    // Reset UI state immediately
    clearLyrics();
    hideCard();

    // Instrumental hint: ONLY show if strong keyword
    if(strongInstrumentalGuess(t)){
      ensureCardInjected();
      setHint("Instrumental / No lyrics available.");
      // show small card even if no lyrics (only for strong keyword)
      showCard();
      return;
    }

    // Abort previous lyrics request
    if(lyricsAbort) lyricsAbort.abort();
    lyricsAbort = new AbortController();

    try{
      // Query worker
      const qs = new URLSearchParams({ artist: a, track: t });
      if(al) qs.set("album", al);

      const url = `${LYRICS_ENDPOINT}?${qs.toString()}`;
      const res = await fetch(url, { signal: lyricsAbort.signal });
      const data = await res.json();

      if(!data || !data.ok || !data.found){
        hideCard();
        return;
      }

      // Track identity (best effort) for karaoke safety
      // worker might not return spotify id; we'll get it from /me/player on highlight tick
      currentTrackId = "";
      currentDurationMs = 0;

      // Prefer synced lines array
      if(Array.isArray(data.lines) && data.lines.length){
        const lines = normalizeLines(data.lines);
        if(lines.length){
          currentLines = lines;
          renderSynced(lines);
          setHint(""); // no hint
          showCard();
          lastLyricsKey = songKey;
          // One immediate highlight attempt
          progressTick();
          return;
        }
      }

      // fallback plain
      const plain = (data.plain || data.plainLyrics || "").toString().trim();
      if(plain && plain.length >= MIN_TEXT_LEN){
        currentPlain = plain;
        renderPlain(plain);
        setHint(""); // no hint
        showCard();
        lastLyricsKey = songKey;
        return;
      }

      // last fallback: raw lrc -> strip timestamps
      const lrc = (data.lrc || data.syncedLyrics || "").toString();
      if(lrc){
        const text = lrc
          .split("\n")
          .map(line => line.replace(/\[[0-9:.]+\]/g, "").trim())
          .filter(Boolean)
          .join("\n")
          .trim();

        if(text && text.length >= MIN_TEXT_LEN){
          currentPlain = text;
          renderPlain(text);
          setHint(""); // no hint
          showCard();
          lastLyricsKey = songKey;
          return;
        }
      }

      hideCard();
    }catch{
      hideCard();
    }
  }

  async function syncTrackIdFromSpotify(){
    // Optional: align lyrics session with spotify item id to avoid mismatches on rapid switching
    const st = await spotifyMePlayer();
    if(!st || !st.item) return;

    currentTrackId = st.item.id || "";
    currentDurationMs = Number(st.item.duration_ms || 0);
  }

  function boot(){
    ensureCardInjected();

    // song detector loop (DOM)
    setInterval(async () => {
      if(!isNowPanelActive()) return;

      const { track, artist, album } = readNowDom();
      if(!track || !artist || track === "—" || artist === "—"){
        hideCard();
        return;
      }

      // fetch lyrics if song changed
      const key = `${artist}::${track}::${album}`;
      if(key !== lastLyricsKey){
        await fetchLyrics(artist, track, album);
        // after lyrics render, capture spotify id (best effort)
        await syncTrackIdFromSpotify();
      }
    }, NOW_POLL_MS);

    // karaoke loop (Spotify progress)
    setInterval(() => {
      progressTick();
    }, PLAYER_POLL_MS);

    // also react fast to DOM changes
    if(window.MutationObserver){
      const nt = $("nowTrack");
      const na = $("nowArtist");
      if(nt && na){
        const mo = new MutationObserver(() => {
          // force faster refresh on changes
          lastLyricsKey = ""; // allow fetchLyrics to run on next poll
        });
        mo.observe(nt, { childList:true, characterData:true, subtree:true });
        mo.observe(na, { childList:true, characterData:true, subtree:true });
      }
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  }else{
    boot();
  }
})();
