import { fetchParadisoEvents } from "../parsers/parser-paradiso.js";
import { fetchMelkwegEvents } from "../parsers/parser-melkweg.js";
import { fetchTivoliEvents } from "../parsers/parser-tivoli.js";
import { fetchPatronaatEvents } from "../parsers/parser-patronaat.js";
import { fetchEffenaarEvents } from "../parsers/parser-effenaar.js";
import { fetchDoornroosjeEvents } from "../parsers/parser-doornroosje.js";

export const venueRegistry = {
  paradiso: fetchParadisoEvents,
  melkweg: fetchMelkwegEvents,
  tivoli: fetchTivoliEvents,
  patronaat: fetchPatronaatEvents,
  effenaar: fetchEffenaarEvents,
  doornroosje: fetchDoornroosjeEvents 
};