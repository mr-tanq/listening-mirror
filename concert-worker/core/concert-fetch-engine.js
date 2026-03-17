import { venueRegistry } from "./venue-registry.js";

export async function fetchVenueEventsById(source) {
  const key = String(source || "").trim().toLowerCase();

  if (!key) {
    throw new Error("missing source");
  }

  const fn = venueRegistry[key];

  if (typeof fn !== "function") {
    throw new Error(`unknown source: ${key}`);
  }

  const events = await fn();

  return Array.isArray(events) ? events : [];
} 