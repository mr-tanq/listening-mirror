<!-- PART 1/4 -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#0b0c0e" />
  <title>Listening Mirror</title>

  <style>
    :root{
      --bg:#0b0c0e;
      --bg2:#090a0c;
      --card: rgba(255,255,255,.055);
      --card2: rgba(255,255,255,.035);
      --text:#ececee;
      --muted:#a7abb4;
      --muted2:#7d828d;
      --shadow: 0 18px 55px rgba(0,0,0,.55);
      --r: 22px;

      --live:#ff3b3b;
      --liveBg: rgba(255,59,59,.10);
      --liveBd: rgba(255,59,59,.30);

      --safeL: max(14px, env(safe-area-inset-left));
      --safeR: max(14px, env(safe-area-inset-right));
      --safeT: max(14px, env(safe-area-inset-top));
      --safeB: max(14px, env(safe-area-inset-bottom));
    }

    *{ box-sizing:border-box; -webkit-tap-highlight-color: transparent; }
    html,body{ height:100%; }
    html{ overscroll-behavior-y:none; }

    body{
      margin:0;
      overflow-x:hidden;
      overscroll-behavior-y:none;
      background: linear-gradient(180deg, var(--bg), var(--bg2));
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    }

    /* =========================================================
       GENERATIVE BACKGROUND CANVAS (behind everything)
       ========================================================= */
    #bgCanvas{
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 0;
      pointer-events: none;
    }

    .app{
      position: relative;
      z-index: 1;
      min-height:100%;
      padding: calc(var(--safeT) + 14px) var(--safeR) calc(var(--safeB) + 18px) var(--safeL);
      max-width: 920px;
      margin: 0 auto;
    }

    header{
      display:flex;
      align-items:flex-start;
      gap:14px;
      margin-bottom: 14px;
    }

    .brand{
      display:flex;
      align-items:center;
      gap:10px;
      padding-left: 2px;
    }

    .glyph{
      width: 16px;
      height: 16px;
      border-radius: 999px;
      position:relative;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.22), rgba(255,255,255,.05) 55%, rgba(255,255,255,.03) 70%);
      outline: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 10px 35px rgba(0,0,0,.45);
      flex: 0 0 auto;
    }
    .glyph:before{
      content:"";
      position:absolute;
      inset:3px;
      border-radius: 999px;
      outline: 1px solid rgba(255,255,255,.10);
      background: radial-gradient(circle at 65% 35%, rgba(255,255,255,.10), transparent 60%);
      opacity:.9;
    }

    .wordmark{
      display:flex;
      flex-direction:column;
      line-height: 1.15;
    }
    .wordmark .title{
      font-size: 18px;
      font-weight: 720;
      letter-spacing: .35px;
      margin:0;
      background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.70));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .wordmark .sub{
      margin-top: 6px;
      display:flex;
      align-items:center;
      gap:8px;
      color: var(--muted2);
      font-size: 12px;
      letter-spacing: .2px;
    }
    .dot{
      width: 7px;
      height: 7px;
      border-radius: 99px;
      background: rgba(255,255,255,.14);
      outline: 1px solid rgba(255,255,255,.10);
    }
    .dot.on{
      background: rgba(49,208,124,.75);
      outline-color: rgba(49,208,124,.35);
      box-shadow: 0 0 0 3px rgba(49,208,124,.10);
    }

    /* =========================================================
       TABS: left aligned + order Now / Recent / Top
       ========================================================= */
    .tabs{
      display:flex;
      justify-content:flex-start;
      align-items:center;
      gap:10px;
      padding: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      outline: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 16px 45px rgba(0,0,0,.35);
      width: fit-content;
      margin: 12px 0 16px 0;
    }
    .tabBtn{
      border:0;
      background: transparent;
      color: rgba(255,255,255,.72);
      padding: 10px 14px;
      border-radius: 999px;
      font-size: 13px;
      letter-spacing: .2px;
      cursor:pointer;
    }
    .tabBtn[aria-selected="true"]{
      background: rgba(255,255,255,.085);
      outline: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.95);
    }

    .panel{ display:block; }
    .hidden{ display:none; }

    .card{
      border-radius: var(--r);
      background: linear-gradient(180deg, var(--card), var(--card2));
      outline: 1px solid rgba(255,255,255,.08);
      box-shadow: var(--shadow);
      overflow:hidden;
      position:relative;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    /* NOW background — SHARP artwork (λίγο πιο έντονο, όχι αχνό) */
    .nowAmbient{
      position:absolute;
      inset:-1px;
      opacity: 0;
      pointer-events:none;
      transition: opacity .22s ease;
    }
    .nowAmbient.on{ opacity: 1; }
    .nowAmbient:before{
      content:"";
      position:absolute;
      inset:0;
      background-image: var(--ambient-url, none);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      transform: scale(1.02);
      opacity: .95;
      filter: saturate(1.02) contrast(1.02);
    }
    .nowAmbient:after{
      content:"";
      position:absolute;
      inset:0;
      background:
        radial-gradient(900px 520px at 18% 8%, rgba(255,255,255,.10), transparent 55%),
        radial-gradient(700px 420px at 85% 10%, rgba(255,255,255,.06), transparent 60%),
        linear-gradient(180deg, rgba(8,9,11,.50), rgba(8,9,11,.92));
    }

    .nowWrap{ position:relative; padding: 18px; }
    .nowTop{
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:12px;
      margin-bottom: 14px;
      position:relative;
      z-index:2;
      min-height: 24px;
    }

    .chip{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,.045);
      outline: 1px solid rgba(255,255,255,.085);
      color: rgba(255,255,255,.78);
      font-size: 12px;
      letter-spacing:.25px;
      white-space:nowrap;
    }
    .chip .miniDot{ width:6px;height:6px;border-radius:999px; background: rgba(255,255,255,.18); }
    .chip.live{
      color: rgba(255,255,255,.95);
      outline-color: var(--liveBd);
      background: var(--liveBg);
    }
    .chip.live .miniDot{
      background: var(--live);
      box-shadow: 0 0 0 3px rgba(255,59,59,.12);
    }

    /* NOW content is single column (no square cover) */
    .nowMain{
      display:grid;
      grid-template-columns: 1fr;
      gap: 0;
      align-items:center;
      position:relative;
      z-index:2;
    }
    /* kept for app.js compatibility, but hidden */
    .coverWrap{ display:none !important; }

    .nowText{ min-width:0; padding-left: 2px; }
    .line1{ font-size: 15.5px; font-weight: 720; letter-spacing: .15px; }
    .line2{ margin-top: 6px; font-size: 13.5px; color: rgba(255,255,255,.72); }
    .line3{ margin-top: 6px; font-size: 12px; color: var(--muted2); }

    /* Marquee: fade only on RIGHT */
    .marq{ display:inline-block; white-space:nowrap; will-change:transform; }
    .marqWrap{
      position:relative;
      overflow:hidden;
      padding-left: 3px;
      -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 86%, transparent 100%);
      mask-image: linear-gradient(90deg, #000 0%, #000 86%, transparent 100%);
    }
    .marqOn .marq{ animation: marqMove var(--marqDur, 10s) linear infinite; }
    @keyframes marqMove{
      0%{ transform: translateX(0); }
      100%{ transform: translateX(calc(-1 * var(--marqShift, 60px))); }
    }
<!-- PART 2/4 -->
    .controls{
      padding: 14px;
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }
    .seg{
      display:flex;
      gap:8px;
      padding: 7px;
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      outline: 1px solid rgba(255,255,255,.08);
      width: fit-content;
    }
    .seg button{
      border:0;
      background: transparent;
      color: rgba(255,255,255,.74);
      padding: 9px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      cursor:pointer;
      letter-spacing:.2px;
    }
    .seg button[aria-selected="true"]{
      background: rgba(255,255,255,.085);
      outline: 1px solid rgba(255,255,255,.10);
      color: rgba(255,255,255,.95);
    }

    .list{ padding: 10px; }

    .row{
      display:grid;
      grid-template-columns: 52px minmax(0,1fr) max-content;
      gap: 12px;
      padding: 12px 12px 12px 16px;
      border-radius: 16px;
      align-items:center;
      user-select:none;
    }
    .row:hover{ background: rgba(255,255,255,.035); }
    .row:active{ background: rgba(255,255,255,.045); }

    .thumb{
      width: 44px; height: 44px;
      border-radius: 14px;
      overflow:hidden;
      position:relative;
      outline: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.03);
      box-shadow: 0 10px 30px rgba(0,0,0,.40);
    }
    .thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
    .thumbFallback{
      position:absolute; inset:0; display:grid; place-items:center;
      color: rgba(255,255,255,.35); font-size: 18px;
    }

    .mid{ min-width:0; padding-left: 3px; }
    .title{
      font-size: 13.5px;
      font-weight: 650;
      color: rgba(255,255,255,.92);
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .sub{
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted2);
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .right{
      justify-self:end;
      text-align:right;
      font-size: 12.5px;
      font-weight: 700;
      color: rgba(255,255,255,.80);
      padding-left: 8px;
      white-space:nowrap;
    }
    .right.count{
      color: rgba(255,214,102,.92);
    }

    /* --------------------------
       MIRROR CARD + ORB + POPUP
       -------------------------- */
    .mirrorCard{ margin-top: 16px; overflow: visible; } /* ✅ popup not clipped */
    .mirrorWrap{ padding: 16px 18px 18px 18px; position:relative; }

    .mirrorTop{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin-bottom: 12px;
    }

    .mirrorTitle{
      font-size: 11.5px;
      letter-spacing: .34px;
      color: rgba(255,255,255,.62);
      text-transform: uppercase;
      display:flex;
      align-items:center;
      gap:10px;
      min-width: 0;
    }

    .orbDetails{ position:relative; display:inline-block; }
    .orbDetails summary{
      list-style:none;
      display:inline-flex;
      align-items:center;
      gap:10px;
      cursor:pointer;
      user-select:none;
      outline:none;
    }
    .orbDetails summary::-webkit-details-marker{ display:none; }
    .orbDetails summary:focus-visible{
      box-shadow: 0 0 0 3px rgba(255,255,255,.12);
      border-radius: 999px;
    }

    .orb{
      width: 18px;
      height: 18px;
      border-radius: 999px;
      position:relative;
      flex: 0 0 auto;
      background:
        radial-gradient(circle at 30% 30%, rgba(255,255,255,.28), rgba(255,255,255,.09) 55%, rgba(255,255,255,.05) 75%),
        radial-gradient(circle at 70% 65%, rgba(255,255,255,.10), transparent 60%);
      outline: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 12px 32px rgba(0,0,0,.45);
    }
    .orb:after{
      content:"";
      position:absolute;
      inset: -6px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(255,255,255,.10), transparent 60%);
      opacity: .55;
      filter: blur(2px);
      pointer-events:none;
    }
    .orb.on{
      animation: orbBreath 1.9s ease-in-out infinite;
      outline-color: rgba(49,208,124,.22);
    }
    @keyframes orbBreath{
      0%,100%{
        transform: scale(1);
        box-shadow: 0 12px 32px rgba(0,0,0,.45), 0 0 0 0 rgba(49,208,124,.00);
      }
      50%{
        transform: scale(1.05);
        box-shadow: 0 12px 32px rgba(0,0,0,.45), 0 0 0 10px rgba(49,208,124,.06);
      }
    }

    .orbPopup{
      position:absolute;
      top: calc(100% + 10px);
      left: 0;
      width: min(320px, calc(100vw - 40px));
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(22,24,28,.92), rgba(14,16,19,.92));
      outline: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 22px 70px rgba(0,0,0,.62);
      padding: 12px 12px 12px 12px;
      z-index: 50;
      transform-origin: 12px 0;
      transform: translateY(-4px) scale(.98);
      opacity: 0;
      pointer-events:none;
      transition: opacity .16s ease, transform .16s ease;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .orbDetails[open] .orbPopup{
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events:auto;
    }
    .orbPopup:before{
      content:"";
      position:absolute;
      top:-7px;
      left: 16px;
      width: 14px;
      height: 14px;
      transform: rotate(45deg);
      background: rgba(22,24,28,.92);
      outline: 1px solid rgba(255,255,255,.10);
      border-radius: 4px;
    }
    .orbPopupTitle{
      font-size: 12px;
      font-weight: 760;
      letter-spacing: .25px;
      color: rgba(255,255,255,.92);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-bottom: 8px;
    }
    .orbPopupHint{
      font-size: 11px;
      color: rgba(255,255,255,.58);
      line-height: 1.35;
      margin-bottom: 10px;
    }
    .orbPopupGrid{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:10px;
    }
    .orbMini{
      border-radius: 14px;
      background: rgba(255,255,255,.03);
      outline: 1px solid rgba(255,255,255,.07);
      padding: 10px 10px 10px 10px;
    }
    .orbMiniLbl{
      font-size: 10px;
      letter-spacing: .28px;
      color: rgba(255,255,255,.60);
      text-transform: uppercase;
    }
    .orbMiniVal{
      margin-top: 8px;
      font-size: 13px;
      font-weight: 760;
      color: rgba(255,255,255,.90);
    }

    .mirrorPill{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      outline: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.78);
      font-size: 12px;
      letter-spacing: .2px;
      white-space:nowrap;
    }
    .mirrorPill .miniDot{
      width:6px;height:6px;border-radius:999px;
      background: rgba(255,255,255,.20);
    }
    .mirrorPill.on{
      background: rgba(49,208,124,.10);
      outline-color: rgba(49,208,124,.22);
      color: rgba(255,255,255,.92);
    }
    .mirrorPill.on .miniDot{
      background: rgba(49,208,124,.85);
      box-shadow: 0 0 0 3px rgba(49,208,124,.10);
    }

    .mirrorState{
      font-size: 18px;
      font-weight: 760;
      letter-spacing: .12px;
      margin: 6px 0 2px 0;
      color: rgba(255,255,255,.94);
    }

    /* Keep mDot in DOM for app.js brightness signal,
       but the Axis UI is hidden (we'll use it only as a sensor). */
    .mood{ display:none !important; }

    @media (max-width: 520px){
      .tabs{ width: 100%; justify-content:flex-start; }
      .line1{ font-size: 15px; }
      .orbPopup{ left: 0; }
    }
  </style>
</head>
<!-- PART 3/4 -->
<body>
  <!-- Generative background -->
  <canvas id="bgCanvas" aria-hidden="true"></canvas>

  <div class="app">
    <header>
      <div class="brand">
        <div class="glyph" aria-hidden="true"></div>
        <div class="wordmark">
          <div class="title">Listening Mirror</div>
          <div class="sub">
            <span id="statusDot" class="dot" aria-hidden="true"></span>
            <span id="statusLine">Offline</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Tabs order: Now / Recent / Top -->
    <div class="tabs" role="tablist" aria-label="Main tabs">
      <button class="tabBtn" data-tab="now" aria-selected="true" role="tab">Now</button>
      <button class="tabBtn" data-tab="recent" aria-selected="false" role="tab">Recent</button>
      <button class="tabBtn" data-tab="top" aria-selected="false" role="tab">Top</button>
    </div>

    <section class="panel" data-panel="now">
      <!-- NOW -->
      <div class="card">
        <div id="nowAmbient" class="nowAmbient"></div>

        <div class="nowWrap">
          <div class="nowTop">
            <div id="nowBadge" class="chip">
              <span class="miniDot" aria-hidden="true"></span>
              <span id="nowBadgeText">OFF</span>
            </div>
          </div>

          <div class="nowMain">
            <!-- kept for app.js compatibility, but hidden by CSS -->
            <div class="coverWrap" id="nowCoverWrap">
              <img id="nowImg" class="coverImg" alt="" />
              <div id="nowFallback" class="coverFallback">♪</div>
            </div>

            <div class="nowText">
              <div class="line1 marqWrap" id="nowTrackWrap">
                <span class="marq" id="nowTrack">—</span>
              </div>
              <div class="line2 marqWrap" id="nowArtistWrap">
                <span class="marq" id="nowArtist">—</span>
              </div>
              <div class="line3 marqWrap" id="nowAlbumWrap">
                <span class="marq" id="nowAlbum">—</span>
              </div>
              <div class="sub" id="nowMsg" style="margin-top:12px;">—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- MIRROR -->
      <div class="card mirrorCard" id="mirrorCard">
        <div class="mirrorWrap">
          <div class="mirrorTop">
            <div class="mirrorTitle">
              <details class="orbDetails" id="orbDetails">
                <summary aria-label="Open Mirror popup">
                  <span id="mirrorOrb" class="orb" aria-hidden="true"></span>
                  Mirror
                </summary>

                <!-- ✅ No random text. Clean. Premium. -->
                <div class="orbPopup" role="dialog" aria-label="Mirror popup">
                  <div class="orbPopupTitle">
                    <span>Mirror</span>
                    <span style="font-size:11px;color:rgba(255,255,255,.55)">tap orb again</span>
                  </div>
                  <div class="orbPopupHint">
                    Visual layer is running in the background. (No AI text here.)
                  </div>
                  <div class="orbPopupGrid">
                    <div class="orbMini">
                      <div class="orbMiniLbl">Mode</div>
                      <div id="orbModeVal" class="orbMiniVal">—</div>
                    </div>
                    <div class="orbMini">
                      <div class="orbMiniLbl">Brightness</div>
                      <div id="orbBrightVal" class="orbMiniVal">—</div>
                    </div>
                  </div>
                </div>
              </details>
            </div>

            <div id="mirrorPill" class="mirrorPill">
              <span class="miniDot" aria-hidden="true"></span>
              <span id="mirrorPillText">IDLE</span>
            </div>
          </div>

          <div id="mirrorState" class="mirrorState">IDLE</div>

          <!-- Hidden “axis sensor” (app.js can still move mDot left%) -->
          <div class="mood" aria-label="Mood axis sensor">
            <div class="moodBar">
              <div id="mDot" class="moodDot" style="left:50%"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel hidden" data-panel="top">
      <div class="card">
        <div class="controls">
          <div class="seg" aria-label="Top type">
            <button data-top-type="tracks" aria-selected="true">Track</button>
            <button data-top-type="artists" aria-selected="false">Artist</button>
            <button data-top-type="albums" aria-selected="false">Album</button>
          </div>

          <div class="seg" aria-label="Top period">
            <button data-top-period="today" aria-selected="true">Today</button>
            <button data-top-period="week" aria-selected="false">Week</button>
            <button data-top-period="year" aria-selected="false">Year</button>
          </div>
        </div>

        <div class="list" id="topList" aria-live="polite"></div>
      </div>
    </section>

    <section class="panel hidden" data-panel="recent">
      <div class="card">
        <div class="list" id="recentList" aria-live="polite"></div>
      </div>
    </section>
  </div>

  <script src="./app.js"></script>
<!-- PART 4/4 -->
  <script>
    // =========================================================
    // Premium generative background (canvas) driven by mDot left%
    // =========================================================
    (function(){
      const canvas = document.getElementById("bgCanvas");
      const ctx = canvas.getContext("2d", { alpha: true });

      const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1);

      function resize(){
        W = Math.floor(window.innerWidth);
        H = Math.floor(window.innerHeight);
        DPR = Math.min(2, window.devicePixelRatio || 1);

        canvas.width = Math.floor(W * DPR);
        canvas.height = Math.floor(H * DPR);
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        ctx.setTransform(DPR,0,0,DPR,0,0);
      }
      window.addEventListener("resize", resize, { passive:true });
      resize();

      // --- Seed (changes per track so each session feels unique)
      let seed = 1337;
      function hashStr(s){
        let h = 2166136261;
        for(let i=0;i<s.length;i++){
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }
      function setSeedFromTrack(){
        const t = (document.getElementById("nowTrack")?.textContent || "").trim();
        const a = (document.getElementById("nowArtist")?.textContent || "").trim();
        const al = (document.getElementById("nowAlbum")?.textContent || "").trim();
        const key = (t + " • " + a + " • " + al) || "idle";
        seed = hashStr(key);
        rebuild();
      }

      // --- RNG
      function rnd(){
        // xorshift32
        seed ^= seed << 13; seed >>>= 0;
        seed ^= seed >> 17; seed >>>= 0;
        seed ^= seed << 5;  seed >>>= 0;
        return (seed >>> 0) / 4294967296;
      }

      // --- Brightness driven by mDot (0..1)
      let targetB = 0.5;
      let curB = 0.5;

      function readBrightnessFromDot(){
        const dot = document.getElementById("mDot");
        if(!dot) return 0.5;
        const left = (dot.style.left || "").trim();
        const m = left.match(/([\d.]+)\%/);
        if(!m) return 0.5;
        const p = Math.max(0, Math.min(100, parseFloat(m[1])));
        return p / 100;
      }

      // --- Mode / Orb info
      function isListening(){
        const nowBadge = (document.getElementById("nowBadgeText")?.textContent || "").toUpperCase();
        const pill = (document.getElementById("mirrorPillText")?.textContent || "").toUpperCase();
        return /LIVE|ON|PLAY|LISTEN/.test(nowBadge) || /LIVE|ON|PLAY|LISTEN/.test(pill);
      }

      // --- Doodles (premium ink-like marks, not childish)
      let doodles = [];
      function rebuild(){
        doodles = [];
        const count = Math.round(20 + rnd()*18); // sparse
        for(let i=0;i<count;i++){
          const typeRoll = rnd();
          const type =
            typeRoll < 0.22 ? "star" :
            typeRoll < 0.44 ? "leaf" :
            typeRoll < 0.64 ? "arc"  :
            typeRoll < 0.82 ? "eye"  :
                              "sigil";

          doodles.push({
            type,
            x: rnd()*W,
            y: rnd()*H,
            s: 10 + rnd()*26,
            r: (rnd()*2-1) * 0.6,
            a: 0.04 + rnd()*0.09,   // very subtle opacity
            w: 0.8 + rnd()*0.9      // thin strokes
          });
        }
      }
      rebuild();

      // --- Helpers: draw “paper” + “ink”
      function bgColors(b){
        // b: 0 dark → 1 bright
        // premium: never full white, never full black
        const dark = { r: 10, g: 11, b: 14 };
        const bright = { r: 235, g: 238, b: 242 };
        const r = Math.round(dark.r + (bright.r - dark.r)*b);
        const g = Math.round(dark.g + (bright.g - dark.g)*b);
        const bl = Math.round(dark.b + (bright.b - dark.b)*b);
        return { r, g, b: bl };
      }

      function inkColor(b){
        // ink flips: on bright background use darker ink; on dark bg use lighter ink
        const k = b > 0.52 ? 0 : 1; // 0=dark ink, 1=light ink
        if(k === 0){
          return "rgba(20,22,26,";
        }else{
          return "rgba(240,242,246,";
        }
      }

      // --- Doodle primitives
      function drawStar(x,y,s,rot,lineW,alpha,b){
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(rot);
        ctx.lineWidth = lineW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = inkColor(b) + alpha + ")";
        const spikes = 5;
        const outer = s;
        const inner = s*0.45;
        ctx.beginPath();
        for(let i=0;i<spikes*2;i++){
          const ang = (Math.PI/spikes)*i;
          const rr = (i%2===0) ? outer : inner;
          ctx.lineTo(Math.cos(ang)*rr, Math.sin(ang)*rr);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      function drawLeaf(x,y,s,rot,lineW,alpha,b){
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(rot);
        ctx.lineWidth = lineW;
        ctx.strokeStyle = inkColor(b) + alpha + ")";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-s*0.6, 0);
        ctx.quadraticCurveTo(0, -s*0.9, s*0.6, 0);
        ctx.quadraticCurveTo(0,  s*0.9, -s*0.6, 0);
        ctx.stroke();

        // vein
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(-s*0.45, 0);
        ctx.quadraticCurveTo(0, 0, s*0.45, 0);
        ctx.stroke();
        ctx.restore();
      }

      function drawArc(x,y,s,rot,lineW,alpha,b){
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(rot);
        ctx.lineWidth = lineW;
        ctx.strokeStyle = inkColor(b) + alpha + ")";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0,0,s, Math.PI*0.15, Math.PI*0.85);
        ctx.stroke();
        ctx.restore();
      }

      function drawEye(x,y,s,rot,lineW,alpha,b){
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(rot);
        ctx.lineWidth = lineW;
        ctx.strokeStyle = inkColor(b) + alpha + ")";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.quadraticCurveTo(0, -s*0.6, s, 0);
        ctx.quadraticCurveTo(0,  s*0.6, -s, 0);
        ctx.stroke();

        ctx.globalAlpha = Math.max(0.02, alpha*0.8);
        ctx.beginPath();
        ctx.arc(0,0,s*0.18,0,Math.PI*2);
        ctx.fillStyle = inkColor(b) + (alpha*0.9) + ")";
        ctx.fill();
        ctx.restore();
      }

      function drawSigil(x,y,s,rot,lineW,alpha,b){
        ctx.save();
        ctx.translate(x,y);
        ctx.rotate(rot);
        ctx.lineWidth = lineW;
        ctx.strokeStyle = inkColor(b) + alpha + ")";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(-s*0.55, -s*0.25);
        ctx.lineTo(0, -s*0.6);
        ctx.lineTo(s*0.55, -s*0.25);
        ctx.lineTo(s*0.35, s*0.5);
        ctx.lineTo(-s*0.35, s*0.5);
        ctx.closePath();
        ctx.stroke();

        ctx.globalAlpha = Math.max(0.02, alpha*0.65);
        ctx.beginPath();
        ctx.moveTo(0, -s*0.45);
        ctx.lineTo(0, s*0.45);
        ctx.stroke();
        ctx.restore();
      }

      // --- Main render loop (low fps, mobile-friendly)
      let last = 0;
      const FPS = prefersReduced ? 2 : 10;
      const frameMs = 1000 / FPS;

      function draw(t){
        requestAnimationFrame(draw);
        if(t - last < frameMs) return;
        last = t;

        // smooth brightness
        targetB = readBrightnessFromDot();
        curB += (targetB - curB) * 0.06;

        // base paper
        const c = bgColors(curB);
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillRect(0,0,W,H);

        // subtle vignette
        const grad = ctx.createRadialGradient(W*0.5,H*0.3, 10, W*0.5,H*0.5, Math.max(W,H)*0.7);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, curB > 0.52 ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.22)");
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,W,H);

        // “breathing” density when listening
        const listening = isListening();
        const density = listening ? 1.0 : 0.65;

        // draw doodles
        ctx.save();
        for(const d of doodles){
          const a = d.a * density;
          switch(d.type){
            case "star":  drawStar(d.x,d.y,d.s,d.r,d.w,a,curB); break;
            case "leaf":  drawLeaf(d.x,d.y,d.s,d.r,d.w,a,curB); break;
            case "arc":   drawArc(d.x,d.y,d.s,d.r,d.w,a,curB); break;
            case "eye":   drawEye(d.x,d.y,d.s,d.r,d.w,a,curB); break;
            case "sigil": drawSigil(d.x,d.y,d.s,d.r,d.w,a,curB); break;
          }
        }
        ctx.restore();

        // update orb popup values (no cringe text)
        const modeEl = document.getElementById("orbModeVal");
        const brEl = document.getElementById("orbBrightVal");
        if(modeEl) modeEl.textContent = listening ? "LIVE" : "IDLE";
        if(brEl) brEl.textContent = Math.round(curB*100) + "%";
      }

      requestAnimationFrame(draw);

      // --- Track changes reseed (new “world” per track)
      const obsTarget = document.getElementById("nowTrack");
      if(obsTarget){
        const mo = new MutationObserver(() => setSeedFromTrack());
        mo.observe(obsTarget, { childList:true, subtree:true, characterData:true });
      }
      // also reseed on artist/album changes
      ["nowArtist","nowAlbum"].forEach(id=>{
        const el = document.getElementById(id);
        if(!el) return;
        const mo = new MutationObserver(() => setSeedFromTrack());
        mo.observe(el, { childList:true, subtree:true, characterData:true });
      });

      // initial seed
      setSeedFromTrack();
    })();
  </script>
</body>
</html>