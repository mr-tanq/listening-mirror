import { fetchAllVenueEvents } from "./venues-engine.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // health check
    if (url.pathname === "/health") {
      return new Response("concert-worker-ok");
    }

    // fetch all venue concerts
    if (url.pathname === "/concerts/venues") {
      try {
        const events = await fetchAllVenueEvents();
        return new Response(JSON.stringify(events, null, 2), {
          headers: { "content-type": "application/json" }
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e.message }),
          { status: 500 }
        );
      }
    }

    return new Response("not found", { status: 404 });
  }
};
