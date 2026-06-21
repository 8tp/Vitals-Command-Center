-- 006_settings_and_strava.sql
-- Two additions:
--  1. User settings: an app-level key/value store plus per-integration settings
--     (enable/disable + auto-sync cadence). This lets the user turn dormant
--     wearables OFF so they stop reading as "disconnected".
--  2. Widen workouts.source to include 'strava' so Apple-Watch-via-Strava runs
--     can be synced into this DB and shown on the dashboard.

-- --- generic app settings (JSON-encoded values) ----------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('autoSyncEnabled', 'true');

-- --- per-integration settings ----------------------------------------------
CREATE TABLE IF NOT EXISTS integration_settings (
  id TEXT PRIMARY KEY CHECK (id IN ('fitbit','apple','strava','whoop','oura')),
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_sync INTEGER NOT NULL DEFAULT 1,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 240,
  display_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed defaults reflecting the current setup: Fitbit Air is the primary device,
-- Apple Watch runs flow in through Strava. WHOOP/Oura are available but OFF
-- until the user opts in from Settings.
INSERT OR IGNORE INTO integration_settings
  (id, enabled, auto_sync, sync_interval_minutes, display_order) VALUES
  ('fitbit', 1, 1, 240, 0),
  ('apple',  1, 1, 240, 1),
  ('strava', 1, 1, 60,  2),
  ('whoop',  0, 0, 240, 3),
  ('oura',   0, 0, 240, 4);

-- --- workouts: widen source CHECK to include 'strava' ----------------------
-- SQLite can't ALTER a CHECK; recreate the table, copy rows, swap (same dance
-- as migration 004). Column order MUST match the current workouts table.
CREATE TABLE workouts_new (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('whoop','oura','apple','fitbit','strava')),
  sport TEXT,
  start_time TEXT,
  end_time TEXT,
  duration_minutes REAL,
  strain REAL,
  avg_hr INTEGER,
  max_hr INTEGER,
  calories INTEGER,
  distance_km REAL,
  zone_1_minutes REAL,
  zone_2_minutes REAL,
  zone_3_minutes REAL,
  zone_4_minutes REAL,
  zone_5_minutes REAL,
  notes TEXT,
  FOREIGN KEY (date) REFERENCES daily_summary(date) ON DELETE CASCADE
);
INSERT INTO workouts_new SELECT * FROM workouts;
DROP TABLE workouts;
ALTER TABLE workouts_new RENAME TO workouts;
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE INDEX IF NOT EXISTS idx_workouts_sport ON workouts(sport);
