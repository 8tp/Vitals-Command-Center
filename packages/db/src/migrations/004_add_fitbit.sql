-- 004_add_fitbit.sql — add Fitbit Air as a data source.
-- Fitbit Air (via Google Health API) becomes the primary 24/7 vitals source,
-- replacing WHOOP/Oura. WHOOP/Oura columns are kept (dormant) for reversibility.
-- Workouts now come from the Strava MCP, not this DB.

-- --- daily_summary: additive columns (ALTER ADD is safe in SQLite) --------
ALTER TABLE daily_summary ADD COLUMN has_fitbit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_summary ADD COLUMN fitbit_hrv REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_rhr REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_spo2 REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_skin_temp_delta REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_respiratory_rate REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_sleep_score REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_sleep_hours REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_deep_hours REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_rem_hours REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_light_hours REAL;
ALTER TABLE daily_summary ADD COLUMN fitbit_steps INTEGER;

-- --- sleep_sessions: widen source CHECK to include 'fitbit' ----------------
-- SQLite can't ALTER a CHECK; recreate the table, copy rows, swap.
CREATE TABLE sleep_sessions_new (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('whoop','oura','apple','fitbit')),
  start_time TEXT,
  end_time TEXT,
  is_nap INTEGER NOT NULL DEFAULT 0,
  total_minutes INTEGER,
  deep_minutes INTEGER,
  rem_minutes INTEGER,
  light_minutes INTEGER,
  awake_minutes INTEGER,
  sleep_score REAL,
  avg_hr REAL,
  avg_hrv REAL,
  avg_respiratory_rate REAL,
  spo2 REAL,
  FOREIGN KEY (date) REFERENCES daily_summary(date) ON DELETE CASCADE
);
INSERT INTO sleep_sessions_new SELECT * FROM sleep_sessions;
DROP TABLE sleep_sessions;
ALTER TABLE sleep_sessions_new RENAME TO sleep_sessions;
CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep_sessions(date);
CREATE INDEX IF NOT EXISTS idx_sleep_source ON sleep_sessions(source);

-- --- workouts: widen source CHECK to include 'fitbit' ----------------------
CREATE TABLE workouts_new (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('whoop','oura','apple','fitbit')),
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
