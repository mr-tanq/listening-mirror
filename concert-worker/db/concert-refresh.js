import { fetchVenueEventsById } from "../core/concert-fetch-engine.js";
import { saveConcerts } from "./concert-repository.js";

export async function refreshSource(db, source) {

  const events = await fetchVenueEventsById(source);

  if (!events || !events.length) {
    return {
      source,
      written: 0
    };
  }

  const written = await saveConcerts(db, events);

  return {
    source,
    written
  };
}