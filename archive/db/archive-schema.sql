-- archive/db/archive-schema.sql
-- Listening Mirror — Archive D1 schema v1
-- Source of truth for attended / pending live history and stats.

PRAGMA foreign_keys = ON;

-- =========================================================
-- VENUES
-- =========================================================

CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_name TEXT NOT NULL UNIQUE,
  family_name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_venues_family_name
ON venues (family_name);

-- =========================================================
-- LIVE EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS live_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- stable unique key generated from normalized event identity
  event_key TEXT NOT NULL UNIQUE,

  -- normal | festival
  kind TEXT NOT NULL CHECK (kind IN ('normal', 'festival')),

  -- display title
  title TEXT NOT NULL,

  -- only shown in UI when status = pending
  status TEXT NOT NULL DEFAULT 'attended'
    CHECK (status IN ('pending', 'attended')),

  -- single-day shows: start_date = end_date
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,

  venue_id INTEGER NOT NULL,
  city TEXT NOT NULL,
  region TEXT,
  country TEXT NOT NULL,

  -- only for festival entries
  festival_name TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_live_events_status
ON live_events (status);

CREATE INDEX IF NOT EXISTS idx_live_events_kind
ON live_events (kind);

CREATE INDEX IF NOT EXISTS idx_live_events_start_date
ON live_events (start_date DESC);

CREATE INDEX IF NOT EXISTS idx_live_events_country
ON live_events (country);

CREATE INDEX IF NOT EXISTS idx_live_events_city
ON live_events (city);

CREATE INDEX IF NOT EXISTS idx_live_events_venue_id
ON live_events (venue_id);

-- =========================================================
-- ARTISTS
-- =========================================================

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_artists_name
ON artists (name);

-- =========================================================
-- LIVE EVENT ARTISTS
-- Keeps all artists tied to a live and their role.
-- This gives us flexibility without needing separate tables
-- for support acts / festival acts.
-- =========================================================

CREATE TABLE IF NOT EXISTS live_event_artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_event_id INTEGER NOT NULL,
  artist_id INTEGER NOT NULL,

  -- headliner | support | festival
  role TEXT NOT NULL CHECK (role IN ('headliner', 'support', 'festival')),

  sort_order INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (live_event_id) REFERENCES live_events(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE RESTRICT,

  UNIQUE (live_event_id, artist_id, role)
);

CREATE INDEX IF NOT EXISTS idx_live_event_artists_live_event_id
ON live_event_artists (live_event_id);

CREATE INDEX IF NOT EXISTS idx_live_event_artists_artist_id
ON live_event_artists (artist_id);

CREATE INDEX IF NOT EXISTS idx_live_event_artists_role
ON live_event_artists (role);

CREATE INDEX IF NOT EXISTS idx_live_event_artists_sort_order
ON live_event_artists (live_event_id, sort_order);

-- =========================================================
-- OPTIONAL FUTURE ENRICHMENT TABLES
-- We add them now so the archive can grow without schema churn.
-- =========================================================

CREATE TABLE IF NOT EXISTS live_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_event_id INTEGER NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (live_event_id) REFERENCES live_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS live_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_event_id INTEGER NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (live_event_id) REFERENCES live_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_live_photos_live_event_id
ON live_photos (live_event_id);

-- =========================================================
-- SETLISTS
-- For future automatic setlist enrichment.
-- =========================================================

CREATE TABLE IF NOT EXISTS setlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_event_id INTEGER NOT NULL UNIQUE,

  -- none | exact | estimated
  status TEXT NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'exact', 'estimated')),

  source TEXT,
  source_url TEXT,
  confidence REAL,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (live_event_id) REFERENCES live_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS setlist_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setlist_id INTEGER NOT NULL,
  song_order INTEGER NOT NULL,
  song_name TEXT NOT NULL,
  is_encore INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (setlist_id) REFERENCES setlists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_setlist_songs_setlist_id
ON setlist_songs (setlist_id);

CREATE INDEX IF NOT EXISTS idx_setlist_songs_order
ON setlist_songs (setlist_id, song_order);
