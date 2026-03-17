export async function deleteBySource(db, source) {
  await db.prepare(
    `DELETE FROM concerts WHERE source = ?`
  ).bind(source).run();
}

export async function insertEvents(db, events) {
  for (const e of events) {
    await db.prepare(`
      INSERT INTO concerts (
        source,
        source_id,
        title,
        date_local,
        venue_name,
        city,
        url,
        image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      e.source,
      e.source_id,
      e.title,
      e.date_local,
      e.venue_name,
      e.city,
      e.url,
      e.image_url
    )
    .run();
  }
}
