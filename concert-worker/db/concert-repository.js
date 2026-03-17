export async function deleteBySource(db, source) {
  await db
    .prepare(`DELETE FROM concerts WHERE source = ?`)
    .bind(source)
    .run();
}

export async function insertEvents(db, events) {
  for (const e of events) {
    await db
      .prepare(`
        INSERT INTO concerts (
          source,
          source_id,
          title,
          artists_main,
          artists_all,
          raw_title,
          date_local,
          time_local,
          venue_name,
          city,
          country,
          url,
          image_url,
          genre_hint,
          fetched_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        e.source ?? null,
        e.source_id ?? null,
        e.title ?? null,
        e.artists_main ?? null,
        JSON.stringify(Array.isArray(e.artists_all) ? e.artists_all : []),
        e.raw_title ?? null,
        e.date_local ?? null,
        e.time_local ?? null,
        e.venue_name ?? null,
        e.city ?? null,
        e.country ?? null,
        e.url ?? null,
        e.image_url ?? null,
        e.genre_hint ?? null,
        e.fetched_at ?? Date.now()
      )
      .run();
  }
}

export async function saveConcerts(db, events) {
  if (!Array.isArray(events) || events.length === 0) {
    return 0;
  }

  const source = events[0]?.source;
  if (!source) {
    throw new Error("Missing source on events");
  }

  await deleteBySource(db, source);
  await insertEvents(db, events);

  return events.length;
}