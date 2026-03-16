// artist-normalizer.js
// FULL FILE REPLACE

const HTML_ENTITY_MAP = {
  "&amp;": "&",
  "&quot;": '"',
  "&#34;": '"',
  "&#39;": "'",
  "&#039;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " "
};

const SEPARATOR_REGEX = /\s*(?:\+|,|\/|•|·|\||;|\band\b|\bwith\b|\bw\/\b|\bx\b)\s*/gi;

export function decodeHtmlEntities(input) {
  let s = String(input || "");

  for (const [entity, value] of Object.entries(HTML_ENTITY_MAP)) {
    s = s.split(entity).join(value);
  }

  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number.parseInt(n, 10);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });

  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });

  return s;
}

export function normalizeText(input) {
  let s = decodeHtmlEntities(input);

  s = s
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return s;
}

export function stripDiacritics(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeArtistName(input) {
  let s = normalizeText(input);

  s = stripDiacritics(s);
  s = s.toLowerCase();

  s = s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bga naar:\b/g, " ")
    .replace(/\bpresents?\b/g, " ")
    .replace(/\bpresenteert\b/g, " ")
    .replace(/\bconcert\b/g, " ")
    .replace(/\blive\b/g, " ")
    .replace(/\bthe\b/g, "the")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return s;
}

export function splitArtistString(input) {
  const raw = normalizeText(input);
  if (!raw) return [];

  return raw
    .split(SEPARATOR_REGEX)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function normalizeArtistList(input) {
  let arr = [];

  if (Array.isArray(input)) {
    arr = input.flatMap((item) => {
      if (Array.isArray(item)) return item;
      return [item];
    });
  } else if (typeof input === "string") {
    arr = splitArtistString(input);
  } else if (input != null) {
    arr = [String(input)];
  }

  const seen = new Set();
  const out = [];

  for (const item of arr) {
    const pretty = normalizeText(item);
    const normalized = normalizeArtistName(pretty);

    if (!pretty || !normalized) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    out.push({
      raw: String(item),
      pretty,
      normalized
    });
  }

  return out;
}

export function uniqueNormalizedStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values || []) {
    const n = normalizeArtistName(value);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out;
}

export function isLikelySameArtist(a, b) {
  const na = normalizeArtistName(a);
  const nb = normalizeArtistName(b);

  if (!na || !nb) return false;
  if (na === nb) return true;

  if (na.includes(nb) || nb.includes(na)) {
    const minLen = Math.min(na.length, nb.length);
    return minLen >= 5;
  }

  return false;
}