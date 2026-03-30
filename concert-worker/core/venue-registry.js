import { fetchParadisoEvents } from "../parsers/parser-paradiso.js";
import { fetchMelkwegEvents } from "../parsers/parser-melkweg.js";
import { fetchTivoliEvents } from "../parsers/parser-tivoli.js";
import { fetchPatronaatEvents } from "../parsers/parser-patronaat.js";
import { fetchEffenaarEvents } from "../parsers/parser-effenaar.js";
import { fetchDoornroosjeEvents } from "../parsers/parser-doornroosje.js";
import { fetch013Events } from "../parsers/parser-013.js";
import { fetchPaardEvents } from "../parsers/parser-paard.js";
import { fetchFluorEvents } from "../parsers/parser-fluor.js";
import { fetchNeushoornEvents } from "../parsers/parser-neushoorn.js";
import { fetchBoerderijEvents } from "../parsers/parser-boerderij.js";
import { fetchAcuEvents } from "../parsers/parser-acu.js";
import { fetchVeraEvents } from "../parsers/parser-vera.js";
import { fetchHedonEvents } from "../parsers/parser-hedon.js";
import { fetchDbsEvents } from "../parsers/parser-dbs.js";
import { fetchMuziekgieterijEvents } from "../parsers/parser-muziekgieterij.js";
import { fetchCarreEvents } from "../parsers/parser-carre.js";
import { fetchMusiconEvents } from "../parsers/parser-musicon.js";
import { fetchDeHellingEvents } from "../parsers/parser-dehelling.js";

export const venueRegistry = {
  paradiso: fetchParadisoEvents,
  melkweg: fetchMelkwegEvents,
  tivoli: fetchTivoliEvents,
  dehelling: fetchDeHellingEvents,
  patronaat: fetchPatronaatEvents,
  effenaar: fetchEffenaarEvents,
  doornroosje: fetchDoornroosjeEvents,
  "013": fetch013Events,
  paard: fetchPaardEvents,
  fluor: fetchFluorEvents,
  neushoorn: fetchNeushoornEvents,
  boerderij: fetchBoerderijEvents,
  acu: fetchAcuEvents,
  vera: fetchVeraEvents,
  hedon: fetchHedonEvents,
  dbs: fetchDbsEvents,
  muziekgieterij: fetchMuziekgieterijEvents,
  carre: fetchCarreEvents,
  musicon: fetchMusiconEvents
};
