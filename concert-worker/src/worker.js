// worker.js
// Listening Mirror — Concert Worker
// Main entry point

import {
  fetchAllVenueEvents,
  fetchVenueEventsById
} from "./concert-fetch-engine.js";

import {
  scoreConcerts,
  filterRecommendedConcerts
} from "./concert-recommender.js";

import {
  buildTasteProfile,
  sortAffinityMap
} from "./taste-profile-engine.js";

import {
  fetchLastfmProfile,
  summarizeLastfmProfile
} from "./lastfm-client.js";

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      return json(
        {
          ok: false,
          error: err?.message || "Unknown error"
        },
        500
      );
    }
  }
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (pathname === "/health") {
    return json({
      ok: true,
      service: "econcerts",
      status: "healthy",
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === "/concerts/venues") {
    const source = (url.searchParams.get("source") || "").trim().toLowerCase();

    if (source) {
      const events = await fetchVenueEventsById(source);

      return json({
        ok: true,
        mode: "single-source",
        source,
        count: events.length,
        events
      });
    }

    const events = await fetchAllVenueEvents();

    return json({
      ok: true,
      mode: "all-venues",
      count: events.length,
      events
    });
  }

  if (pathname === "/concerts/search") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    if (!q) {
      return json(
        {
          ok: false,
          error: "Missing q param"
        },
        400
      );
    }

    const events = await fetchAllVenueEvents();

    const results = events.filter((e) => {
      const blob = [
        e.title || "",
        e.raw_title || "",
        ...(Array.isArray(e.artists_all) ? e.artists_all : [])
      ]
        .join(" ")
        .toLowerCase();

      return blob.includes(q);
    });

    return json({
      ok: true,
      mode: "search",
      query: q,
      total_pool: events.length,
      found: results.length,
      results
    });
  }

  if (pathname === "/lastfm/debug") {
    const profile = await fetchLastfmProfile(env);
    const summary = summarizeLastfmProfile(profile);
    const affinityMap = buildTasteProfile(profile);
    const topAffinity = sortAffinityMap(affinityMap).slice(0, 50);

    return json({
      ok: true,
      mode: "lastfm-debug",
      summary,
      topAffinity
    });
  }

  if (pathname === "/concerts/recommended") {
    const allEvents = await fetchAllVenueEvents();
    const lastfmProfile = await fetchLastfmProfile(env);
    const affinityMap = buildTasteProfile(lastfmProfile);

    const scored = scoreConcerts(allEvents, affinityMap);
    const recommended = filterRecommendedConcerts(scored, {
      minScore: 0.18,
      includeWeakSignals: false
    });

    return json({
      ok: true,
      mode: "recommended",
      total_events: allEvents.length,
      recommended_count: recommended.length,
      recommended
    });
  }

  if (pathname === "/") {
    return json({
      ok: true,
      service: "econcerts",
      endpoints: [
        "/health",
        "/concerts/venues",
        "/concerts/venues?source=tivoli",
        "/concerts/venues?source=013",
        "/concerts/venues?source=paradiso",
        "/concerts/venues?source=melkweg",
        "/concerts/venues?source=paard",
        "/concerts/venues?source=doornroosje",
        "/concerts/venues?source=patronaat",
        "/concerts/venues?source=effenaar",
        "/concerts/venues?source=vera",
        "/concerts/venues?source=hedon",
        "/concerts/venues?source=muziekgieterij",
        "/concerts/venues?source=boerderij",
        "/concerts/venues?source=fluor",
        "/concerts/search?q=amenra",
        "/lastfm/debug",
        "/concerts/recommended"
      ]
    });
  }

  return json(
    {
      ok: false,
      error: "Not found",
      pathname
    },
    404
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type"
  };
}

function normalizePath(pathname) {
  if (!pathname) return "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}