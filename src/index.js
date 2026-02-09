export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Homepage στο /
      if (path === "/" || path === "") {
        return homepage();
      }

      // Health check
      if (path === "/health") {
        return json({ ok: true, message: "Worker is running." }, 200);
      }

      // API routes
      if (path === "/api/top") {
        return handleTop(request, env, url);
      }

      if (path === "/api/now") {
        return handleNow(request, env);
      }

      // Αν δεν βρέθηκε route
      return json({ ok: false, error: "Not found", path }, 404);
    } catch (err) {
      return json({ ok: false, error: String(err?.message || err) }, 500);
    }
  },
};
