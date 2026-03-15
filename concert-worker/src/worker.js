// worker.js
// Listening Mirror — Concert Worker
// Main entry point (DEPLOY TEST VERSION)

import {
  fetchAllVenueEvents,
  fetchVenueEventsById
} from "./concert-fetch-engine.js";

import {
  scoreConcerts,
  filterRecommendedConcerts
} from "./concert-recommender.js";

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

  if (pathname === "/concerts/recommended") {
    const allEvents = await fetchAllVenueEvents();
    const affinityMap = buildMockAffinity();

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

  // 🔥 DEPLOY TEST ROOT
  if (pathname === "/") {
    return json({
      ok: true,
      service: "econcerts",
      version: "TEST-777",
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

function buildMockAffinity() {
  return {
    amenra: { name: "Amenra", affinity: 0.95 },
    mono: { name: "Mono", affinity: 0.92 },
    solstafir: { name: "Sólstafir", affinity: 0.88 },
    "sólstafir": { name: "Sólstafir", affinity: 0.88 },
    alcest: { name: "Alcest", affinity: 0.9 },
    psychonaut: { name: "Psychonaut", affinity: 0.75 },
    "villagers of ioannina city": { name: "Villagers of Ioannina City", affinity: 0.82 },
    "godspeed you! black emperor": { name: "Godspeed You! Black Emperor", affinity: 0.86 },
    "godspeed you black emperor": { name: "Godspeed You! Black Emperor", affinity: 0.86 }
  };
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