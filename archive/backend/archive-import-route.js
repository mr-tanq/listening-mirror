// archive/backend/archive-import-route.js
// Listening Mirror — Archive seed importer route
// Loads archive/data/archive-seed.json from the deployed site
// and inserts missing rows into D1 using event_key dedupe.

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function asNullableText(value) {
  const v = asText(value);
  return v === "" ? null : v;
}

function asFestivalInt(value) {
  return value ? 1 : 0;
}

function assertSeedEntry(entry, index) {
  const problems = [];

  if (!entry || typeof entry !== "object") {
    problems.push("entry is not an object");
  }

  if (!asText(entry.event_key)) problems.push("missing event_key");
  if (!asText(entry.start_date)) problems.push("missing start_date");
  if (!asText(entry.title)) problems.push("missing title");
  if (!entry.venue || typeof entry.venue !== "object") {
    problems.push("missing venue object");
  } else {
    if (!asText(entry.venue.raw_name)) problems.push("missing venue.raw_name");
    if (!asText(entry.venue.family_name)) problems.push("missing venue.family_name");
  }

  if (!asText(entry.city)) problems.push("missing city");
  if (!asText(entry.country)) problems.push("missing country");

  if (problems.length) {
    throw new Error(`Invalid seed entry at index ${index}: ${problems.join(", ")}`);
  }
}

function buildInsertRow(entry) {
  const artists = Array.isArray(entry.artists) ? entry.artists : [];

  const headliner =
    artists.find((a) => a.role === "headliner")?.name ||
    asText(entry.title);

  const supports = artists
    .filter((a) => a.role === "support" || a.role === "festival")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((a) => asText(a.name))
    .filter(Boolean)
    .join(", ");

  return {
    date: asText(entry.start_date),
    main_artist: headliner,
    supports,
    venue: asText(entry.venue.raw_name),
    city: asText(entry.city),
    country: asText(entry.country),
    festival: asFestivalInt(entry.kind === "festival"),
    notes: "",
    rating: null,
    venue_family: asText(entry.venue.family_name),
    title: asText(entry.title),
    end_date: asText(entry.end_date || entry.start_date),
    region: asNullableText(entry.region),
    event_key: asText(entry.event_key)
  };
}
async function loadSeedFromStaticFile(req) {
  const seedUrl = new URL("/archive/data/archive-seed.json", req.url);

  const res = await fetch(seedUrl.toString(), {
    method: "GET",
    headers: { "accept": "application/json" }
  });

  if (!res.ok) {
    throw new Error(`Failed to load seed file: ${res.status} ${res.statusText}`);
  }

  const seed = await res.json();

  if (!Array.isArray(seed)) {
    throw new Error("Seed file is not an array");
  }

  seed.forEach(assertSeedEntry);

  return seed;
}

async function importSeedIntoD1(env, seed) {
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < seed.length; i += 1) {
    const entry = seed[i];

    try {
      const row = buildInsertRow(entry);

      const existing = await env.ARCHIVE_DB
        .prepare("SELECT id FROM concerts WHERE event_key = ? LIMIT 1")
        .bind(row.event_key)
        .first();

      if (existing) {
        skipped += 1;
        continue;
      }

      await env.ARCHIVE_DB.prepare(
        `
        INSERT INTO concerts (
          date,
          main_artist,
          supports,
          venue,
          city,
          country,
          festival,
          notes,
          rating,
          venue_family,
          title,
          end_date,
          region,
          event_key,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `
      )
        .bind(
          row.date,
          row.main_artist,
          row.supports,
          row.venue,
          row.city,
          row.country,
          row.festival,
          row.notes,
          row.rating,
          row.venue_family,
          row.title,
          row.end_date,
          row.region,
          row.event_key
        )
        .run();

      inserted += 1;
    } catch (error) {
      errors.push({
        index: i,
        event_key: entry?.event_key ?? null,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const total = await env.ARCHIVE_DB
    .prepare("SELECT COUNT(*) AS total FROM concerts")
    .first();

  return {
    ok: errors.length === 0,
    inserted,
    skipped,
    errors,
    total_concerts: total?.total ?? null
  };
                     }
export async function handleArchiveImportRoute(req, env) {
  const url = new URL(req.url);

  if (url.pathname !== "/archive/admin/import-seed") {
    return null;
  }

  // simple protection for admin use
  const token = url.searchParams.get("token");
  const expected = env.ARCHIVE_IMPORT_TOKEN;

  if (!expected) {
    return json(
      {
        ok: false,
        error: "ARCHIVE_IMPORT_TOKEN is not configured"
      },
      500
    );
  }

  if (!token || token !== expected) {
    return json(
      {
        ok: false,
        error: "Unauthorized"
      },
      401
    );
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return json(
      {
        ok: false,
        error: "Method not allowed"
      },
      405
    );
  }

  try {
    const seed = await loadSeedFromStaticFile(req);
    const result = await importSeedIntoD1(env, seed);

    return json({
      ok: true,
      seed_entries: seed.length,
      ...result
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}
