export default {
  async fetch(req, env) {

    const url = new URL(req.url)
    const path = url.pathname

    if (path === "/concerts/db-debug-score") {
      return debugScore(url, env)
    }

    if (path === "/concerts/db-search") {
      return dbSearch(url, env)
    }

    if (path === "/concerts/db-recommended") {
      return dbRecommended(url, env)
    }

    return new Response("ok")
  }
}

function normalizeArtist(name) {
  if (!name) return ""
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
}

async function getFutureEvents(env) {
  const res = await env.DB.prepare(`
    SELECT * FROM events
    WHERE date_local >= date('now')
    ORDER BY date_local ASC
  `).all()

  return res.results || []
}
async function dbSearch(url, env) {

  const q = (url.searchParams.get("q") || "").toLowerCase()

  const rows = await env.DB.prepare(`
    SELECT * FROM events
    WHERE lower(raw_title) LIKE ?
    OR lower(artists_main) LIKE ?
    ORDER BY date_local ASC
    LIMIT 50
  `).bind(`%${q}%`, `%${q}%`).all()

  return json({
    ok: true,
    mode: "db-search",
    query: q,
    found: rows.results.length,
    results: rows.results
  })
}

function affinityScore(artist) {

  // προσωρινό fake affinity μέχρι να βάλουμε real lastfm map
  const liked = [
    "villagers of ioannina city",
    "solstafir",
    "mono",
    "godspeed you black emperor",
    "archive",
    "a perfect circle",
    "god is an astronaut",
    "judas priest"
  ]

  if (liked.includes(artist)) return 0.6

  return 0.1
}

function scoreEvent(ev) {

  const artistNorm = normalizeArtist(ev.artists_main)

  const affinity = affinityScore(artistNorm)

  const venueBoost =
    ev.venue_name === "013" ||
    ev.venue_name === "Patronaat" ||
    ev.venue_name === "TivoliVredenburg"
      ? 0.1
      : 0

  const total = affinity + venueBoost

  return {
    artistNorm,
    affinity,
    venueBoost,
    total
  }
}
async function dbRecommended(url, env) {

  const events = await getFutureEvents(env)

  const scored = events.map(ev => {

    const s = scoreEvent(ev)

    return {
      ...ev,
      recommendation_score: s.total,
      matched_artist: s.artistNorm
    }
  })

  const filtered = scored
    .filter(e => e.recommendation_score >= 0.3)
    .sort((a, b) => b.recommendation_score - a.recommendation_score)
    .slice(0, 20)

  return json({
    ok: true,
    mode: "db-recommended",
    total_future_events: events.length,
    recommended_count: filtered.length,
    recommended: filtered
  })
}

async function debugScore(url, env) {

  const q = normalizeArtist(url.searchParams.get("q") || "")

  const events = await getFutureEvents(env)

  const matches = events
    .map(ev => {

      const s = scoreEvent(ev)

      return {
        id: ev.id,
        artist_raw: ev.artists_main,
        artist_norm: s.artistNorm,
        venue: ev.venue_name,
        date: ev.date_local,
        affinity: s.affinity,
        venueBoost: s.venueBoost,
        total_score: s.total,
        passes_threshold: s.total >= 0.3
      }
    })
    .filter(e => e.artist_norm.includes(q))

  return json({
    ok: true,
    mode: "db-debug-score",
    query: q,
    found: matches.length,
    matches
  })
}

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json" }
  })
}