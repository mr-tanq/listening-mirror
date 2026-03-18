import { fetchParadisoEvents } from "../parsers/parser-paradiso.js";
import { fetchMelkwegEvents } from "../parsers/parser-melkweg.js";

export const venueRegistry = {
  paradiso: fetchParadisoEvents,
  melkweg: fetchMelkwegEvents
};