import { fetchVenueEvents } from "../core/concert-fetch-engine.js";
import { deleteBySource, insertEvents } from "./concert-repository.js";

export async function refreshSource(db, source) {
  const events = await fetchVenueEvents(source);

  await deleteBySource(db, source);

  await insertEvents(db, events);

  return {
    source,
    written: events.length
  };
}
