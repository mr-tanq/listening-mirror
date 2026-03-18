import { fetchParadisoEvents } from "../parsers/parser-paradiso.js";
import { fetchMelkwegEvents } from "../parsers/parser-melkweg.js";
import { fetchTivoliEvents } from "../parsers/parser-tivoli.js";

export const venueRegistry = {
  paradiso: fetchParadisoEvents,
  melkweg: fetchMelkwegEvents,
  tivoli: fetchTivoliEvents
};