/* lyrics-ui.js (FULL FILE REPLACE) — PART 1/3
   Listening Mirror — Lyrics UI (inject-only)
   ✅ Injects Lyrics card under Mirror (NOW panel)
   ✅ Works with worker schema:
      - type:"plain" + plain (string)
      - type:"plain" + lines (string[])
      - type:"synced" + sync ([{timeMs,text}] or similar)
   ✅ Shows ONLY lyric text (no timestamps)
   ✅ Karaoke highlight + auto-scroll ONLY when timed sync exists
   ✅ Hidden when no lyrics, EXCEPT strong instrumental keyword -> show small message
*/

(() => {
  "use strict";

  const LYRICS_ENDPOINT = "https://lyrics.errtanq9.workers.dev/lyrics";
  const SPOTIFY_API = "https://api.spotify.com/v1";

  const NOW_POLL_MS = 2000;
  const PLAYER_POLL_MS = 900;
  const HILITE_THROTTLE_MS = 180;

  const MIN_TEXT_LEN = 20;
  const AUTOSCROLL_PADDING = 0.32;

  let lastSongKey = "";
  let lastRenderedKey = "";
  let lyricsAbort = null;

  let timedLines = null;     // [{timeMs, text}]
  let currentTrackId = "";
  let lastActiveIndex = -1;
  let lastHiliteTs = 0;

  const $ = (id) => document.getElementById(id);
  const safeText = (el) => (el?.textContent || "").trim();

  function cleanTitle(s){
    s = (s || "").toString().trim();
    if(!s) return "";
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

  function isNowPanelActive(){
    const nowPanel = document.querySelector('.panel[data-panel="now"]');
    if(!nowPanel) return true;
    return !nowPanel.classList.contains("hidden");
  }

  function getToken(){
    if (window.SpotifyAuth && typeof window.SpotifyAuth.getAccessToken === "function") {
      return window.SpotifyAuth.getAccessToken();
    }
    if (window.SpotifyPlayer && typeof window.SpotifyPlayer.getAccessToken === "function") {
      return window.SpotifyPlayer.getAccessToken();
    }
    return null;
  }

  function strongInstrumentalGuess(track){
    const t = (track || "").toLowerCase();
    if(!t) return false;
    const kws = ["instrumental","intro","interlude","overture","theme","ost","score","ambient mix"];
    return kws.some(k => t.includes(k));
  }

  function injectStylesOnce(){
    if (document.getElementById("lyricsUiStyles")) return;

    const st = document.createElement("style");
    st.id = "lyricsUiStyles";

    // IMPORTANT: keep CSS valid (balanced braces). If this breaks, highlight breaks.
    st.textContent = `
      #lyricsText .lyLine{
        padding: 5px 0;
        font-size: 18.5px;
        line-height: 1.6;
        letter-spacing: .2px;
        transition: color .18s ease, opacity .18s ease, transform .16s ease;
        color: rgba(255,255,255,.55);
        opacity: .7;
        font-weight: 500;
      }

      #lyricsText .lyLine.dim{
        opacity: .35;
        color: rgba(255,255,255,.35);
      }

      /* ACTIVE LINE — ICE BLUE */
      #lyricsText .lyLine.active{
        color: #8fd3ff; /* ice blue */
        opacity: 1;
        font-weight: 600;
        transform: translateY(-1px);
        text-shadow:
          0 0 6px rgba(143,211,255,.55),
          0 0 18px rgba(143,211,255,.35),
          0 0 36px rgba(143,211,255,.18);
      }

      #lyricsHint{
        font-size: 13px;
        color: rgba(255,255,255,.70);
        line-height: 1.45;
      }
    `;

    document.head.appendChild(st);
  }

  function ensureCardInjected(){
    if ($("lyricsCard")) return true;

    injectStylesOnce();

    const mirrorCard = $("mirrorCard");
    if(!mirrorCard) return false;

    const card = document.createElement("div");
    card.id = "lyricsCard";
    card.className = "card";
    card.style.marginTop = "16px";
    card.style.display = "none";

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
          max-height:420px;
          overflow:auto;
          padding-right:6px;
        "></div>
      </div>
    `;

    mirrorCard.insertAdjacentElement("afterend", card);
    return true;
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

  function clearLyricsUI(){
    timedLines = null;
    currentTrackId = "";
    lastActiveIndex = -1;
    const box = $("lyricsText");
    if(box) box.innerHTML = "";
    setHint("");
  }
   /* lyrics-ui.js (FULL FILE REPLACE) — PART 2/3 */

  function renderPlainText(text){
    const box = $("lyricsText");
    if(!box) return;
    box.textContent = text;
  }

  function renderPlainLines(lines){
    const box = $("lyricsText");
    if(!box) return;

    box.innerHTML = "";
    const frag = document.createDocumentFragment();

    for(let i=0;i<lines.length;i++){
      const t = (lines[i] || "").toString().trim();
      if(!t) continue;
      const d = document.createElement("div");
      d.className = "lyLine";
      d.dataset.i = String(i);
      d.textContent = t;
      frag.appendChild(d);
    }

    box.appendChild(frag);
  }

  function normalizeTimedSync(sync){
    // Accept:
    //  - {timeMs, text}
    //  - {t, text}
    //  - {time, line}
    const out = [];
    let last = "";

    for(const it of (sync || [])){
      const text = (it?.text ?? it?.line ?? "").toString().trim();
      const ms = Number(it?.timeMs ?? it?.t ?? it?.time);
      if(!text) continue;
      if(!Number.isFinite(ms) || ms < 0) continue;

      // dedupe consecutive duplicates
      if(text === last) continue;
      last = text;

      out.push({ timeMs: ms, text });
    }

    out.sort((a,b)=>a.timeMs - b.timeMs);
    return out;
  }

  function findActiveIndex(positionMs){
    const lines = timedLines;
    if(!lines || !lines.length) return -1;

    let lo=0, hi=lines.length-1, ans=-1;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      if(lines[mid].timeMs <= positionMs){
        ans=mid; lo=mid+1;
      }else hi=mid-1;
    }
    return ans;
  }

  function scrollToActive(index){
    const box = $("lyricsText");
    if(!box) return;

    const el = box.querySelector(`.lyLine[data-i="${index}"]`);
    if(!el) return;

    const boxRect = box.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const targetY =
      (elRect.top - boxRect.top) + box.scrollTop
      - (box.clientHeight * AUTOSCROLL_PADDING);

    box.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }

  function applyHighlight(index){
    const box = $("lyricsText");
    if(!box) return;

    if(index === lastActiveIndex) return;
    lastActiveIndex = index;

    const nodes = box.querySelectorAll(".lyLine");
    if(!nodes.length) return;

    nodes.forEach(n => { n.classList.remove("active"); n.classList.remove("dim"); });

    if(index < 0) return;

    for(let i=0;i<nodes.length;i++){
      if(i === index) continue;
      if(Math.abs(i-index) >= 6) nodes[i].classList.add("dim");
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
    if(!timedLines || !timedLines.length) return;

    const now = Date.now();
    if(now - lastHiliteTs < HILITE_THROTTLE_MS) return;
    lastHiliteTs = now;

    const st = await spotifyMePlayer();
    if(!st || !st.item) return;

    const id = st.item.id || "";
    const pos = Number(st.progress_ms || 0);

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

  async function syncTrackIdFromSpotify(){
    const st = await spotifyMePlayer();
    if(!st || !st.item) return;
    currentTrackId = st.item.id || "";
                                 }
   /* lyrics-ui.js (FULL FILE REPLACE) — PART 3/3 */

  async function fetchLyrics(artist, track, album){
    // Ensure card exists (retry if mirrorCard not yet on DOM)
    if(!ensureCardInjected()) return;

    const a = cleanTitle(artist);
    const t = cleanTitle(track);
    const al = cleanTitle(album || "");

    if(!a || !t || a === "—" || t === "—"){
      hideCard();
      return;
    }

    const songKey = `${a}::${t}::${al}`;
    if(songKey === lastSongKey) return;
    lastSongKey = songKey;

    clearLyricsUI();
    hideCard();

    if(strongInstrumentalGuess(t)){
      setHint("Instrumental / No lyrics available.");
      showCard();
      return;
    }

    if(lyricsAbort) lyricsAbort.abort();
    lyricsAbort = new AbortController();

    try{
      const qs = new URLSearchParams({ artist: a, track: t });
      if(al) qs.set("album", al);

      const url = `${LYRICS_ENDPOINT}?${qs.toString()}`;
      const res = await fetch(url, { signal: lyricsAbort.signal });
      const data = await res.json();

      if(!data || !data.ok || !data.found){
        hideCard();
        return;
      }

      // 1) TIMED SYNC (karaoke): prefer data.sync
      const syncArr = Array.isArray(data.sync) ? data.sync : null;
      if(syncArr && syncArr.length){
        const norm = normalizeTimedSync(syncArr);
        if(norm.length){
          timedLines = norm;

          // Render text-only lines (divs) so .active works
          renderPlainLines(norm.map(x => x.text));

          showCard();
          await syncTrackIdFromSpotify();
          progressTick();

          lastRenderedKey = songKey;
          return;
        }
      }

      // 2) PLAIN STRING
      const plain = (data.plain || data.plainLyrics || "").toString().trim();
      if(plain && plain.length >= MIN_TEXT_LEN){
        renderPlainText(plain);
        showCard();
        lastRenderedKey = songKey;
        return;
      }

      // 3) PLAIN LINES STRING[]
      if(Array.isArray(data.lines) && data.lines.length && typeof data.lines[0] === "string"){
        const joined = data.lines.join("\n").trim();
        if(joined.length >= MIN_TEXT_LEN){
          renderPlainLines(data.lines);
          showCard();
          lastRenderedKey = songKey;
          return;
        }
      }

      hideCard();
    }catch{
      hideCard();
    }
  }

  function boot(){
    // In case scripts run before mirrorCard exists, retry a few times
    let tries = 0;
    const injectTimer = setInterval(() => {
      tries++;
      if(ensureCardInjected() || tries > 12) clearInterval(injectTimer);
    }, 250);

    setInterval(async () => {
      if(!isNowPanelActive()) return;

      const { track, artist, album } = readNowDom();
      if(!track || !artist || track === "—" || artist === "—"){
        hideCard();
        return;
      }

      const key = `${artist}::${track}::${album}`;
      if(key !== lastRenderedKey){
        await fetchLyrics(artist, track, album);
      }
    }, NOW_POLL_MS);

    setInterval(() => {
      progressTick();
    }, PLAYER_POLL_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  }else{
    boot();
  }
})();
