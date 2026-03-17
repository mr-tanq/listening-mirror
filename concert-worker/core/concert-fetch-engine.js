import { venueRegistry } from "./venue-registry.js";

export async function fetchVenueEvents(source) {
  const fn = venueRegistry[source];
  if (!fn) throw new Error("unknown source");

  const events = await fn();

  return events;
}
