// spotify-click-play.js (FULL FILE) — PART 1/3
/* Click-to-play for Recent/Top lists
   - No changes required in app.js (best-effort parsing)
   - Uses Worker resolver: window.SPOTIFY_RESOLVER_BASE
   - Plays via window.SpotifyPlayer.playUri(uri)
*/

(function () {
  "use strict";

  // ✅ Set this in index.html before this script OR hardcode here.
  // Example: https://your-worker.yourdomain.workers.dev
  const RESOLVER_BASE = (window.SPOTIFY_RESOLVER_BASE || "").replace(/\/+$/, "");

  function $(sel, root = document) { return root.querySelector(sel); }

  function findRow(target) {
    // Your rows likely have class "row" (from your CSS)
    return target?.closest?.(".row") || null;
  }

  function getText(el) {
    return (el?.textContent || "").trim();
  }

  function extractTrackArtist(row) {
    // Best effort based on your markup: .mid .title and .mid .sub
    const titleEl = row.querySelector(".title") || row.querySelector('[data-field="title"]');
    const subEl   = row.querySelector(".sub")   || row.querySelector('[data-field="artist"]');

    const track = getText(titleEl);
    let artist = getText(subEl);

    // Sometimes "Artist — Album" exists; keep just artist
    if (artist.includes(" — ")) artist = artist.split(" — ")[0].trim();
    if (artist.includes(" · ")) artist = artist.split(" · ")[0].trim();

    return { track, artist };
  }

  async function resolveToUri(artist, track) {
    if (!RESOLVER_BASE) throw new Error("Missing RESOLVER_BASE (window.SPOTIFY_RESOLVER_BASE).");

    const u = new URL(RESOLVER_BASE + "/resolve");
    u.searchParams.set("artist", artist);
    u.searchParams.set("track", track);

    const res = await fetch(u.toString(), { method: "GET" });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(`Resolver ${res.status}: ${JSON.stringify(j)}`);
    if (!j.ok || !j.uri) throw new Error(`No match for ${artist} - ${track}`);
    return j.uri;
  }

  function setRowBusy(row, busy) {
    row.style.opacity = busy ? "0.75" : "";
    row.style.transform = busy ? "scale(0.995)" : "";
  }

  async function handleRowClick(e) {
    const row = findRow(e.target);
    if (!row) return;

    // If user clicked on a link/button inside row, ignore
    if (e.target.closest("a,button,input,textarea,select")) return;

    e.preventDefault();

    // Already has URI? allow direct play
    const directUri = row.getAttribute("data-spotify-uri");
    const { track, artist } = extractTrackArtist(row);

    if (!directUri && (!track || !artist)) {
      console.warn("[ClickPlay] Could not extract track/artist from row.");
      return;
    }

    try {
      setRowBusy(row, true);

      // Ensure Spotify auth/device is ready
      if (window.SpotifyPlayer && typeof window.SpotifyPlayer.connect === "function") {
        await window.SpotifyPlayer.connect();
      }

      const uri = directUri || await resolveToUri(artist, track);
      await window.SpotifyPlayer.playUri(uri);

      // Optional: store resolved uri for next click (instant)
      if (!directUri) row.setAttribute("data-spotify-uri", uri);
    } catch (err) {
      console.error("[ClickPlay] play failed:", err);
    } finally {
      setRowBusy(row, false);
    }
  }

  function bind(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.addEventListener("click", handleRowClick, { passive: false });
  }

  function boot() {
    bind("recentList");
    bind("topList");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();