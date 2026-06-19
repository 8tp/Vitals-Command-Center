-- 001_initial.sql — full SPEC schema
-- Source of truth: /SPEC.md §Data Model. Do not drift without updating SPEC.
-- PRAGMAs live in connection.ts (they can't run inside the transaction that wraps migrations).

-- --- Daily summary --------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_summary (
  date TEXT PRIMARY KEY,             -- YYYY-MM-DD
  synced_at TEXT,

  has_whoop INTEGER NOT NULL DEFAULT 0,
  has_oura INTEGER NOT NULL DEFAULT 0,
  has_apple INTEGER NOT NULL DEFAULT 0,

  whoop_recovery_score REAL,
  whoop_hrv REAL,
  whoop_rhr REAL,
  whoop_strain REAL,
  whoop_calories INTEGER,
  whoop_spo2 REAL,
  whoop_skin_temp_delta REAL,
  whoop_sleep_score REAL,
  whoop_sleep_hours REAL,
  whoop_deep_hours REAL,
  whoop_rem_hours REAL,
  whoop_light_hours REAL,

  oura_readiness_score INTEGER,
  oura_sleep_score INTEGER,
  oura_activity_score INTEGER,
  oura_hrv REAL,
  oura_rhr REAL,
  oura_temp_deviation REAL,
  oura_spo2 REAL,
  oura_respiratory_rate REAL,
  oura_sleep_hours REAL,
  oura_deep_hours REAL,
  oura_rem_hours REAL,
  oura_light_hours REAL,
  oura_steps INTEGER,
  oura_active_calories INTEGER,
  oura_total_calories INTEGER,
  oura_stress_high_min INTEGER,

  apple_hrv REAL,
  apple_rhr REAL,
  apple_spo2 REAL,
  apple_vo2max REAL,
  apple_respiratory_rate REAL,
  apple_steps INTEGER,
  apple_active_calories INTEGER,
  apple_basal_calories INTEGER,
  apple_distance_km REAL,
  apple_exercise_minutes INTEGER,
  apple_stand_hours INTEGER,

  consensus_hrv REAL,
  consensus_rhr REAL,
  consensus_sleep_hours REAL,
  confidence_level TEXT CHECK (confidence_level IN ('HIGH','MEDIUM','LOW','NONE')),
  devices_active INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_synced ON daily_summary(synced_at);

-- --- Sleep sessions -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sleep_sessions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('whoop','oura','apple')),
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

CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep_sessions(date);
CREATE INDEX IF NOT EXISTS idx_sleep_source ON sleep_sessions(source);

-- --- Workouts -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('whoop','oura','apple')),
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

CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE INDEX IF NOT EXISTS idx_workouts_sport ON workouts(sport);

-- --- Habits ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('morning_checkin','evening_checkin','auto_tracked','custom')
  ),
  type TEXT NOT NULL CHECK (type IN ('boolean','scale_1_5','number','time','text')),
  unit TEXT,
  target_value REAL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value TEXT NOT NULL,
  logged_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
  UNIQUE(habit_id, date)
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);

-- --- Context (calendar / weather / location / screen time) ---------------
CREATE TABLE IF NOT EXISTS context (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('calendar','weather','location','screen_time','nutrition')),
  data TEXT NOT NULL,                -- JSON
  FOREIGN KEY (date) REFERENCES daily_summary(date) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_context_date_type ON context(date, type);

-- --- Briefings (AI-generated narrative) ----------------------------------
CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('daily','weekly','query_response')),
  content TEXT NOT NULL,             -- markdown
  metrics_snapshot TEXT,             -- JSON Claude analyzed
  created_at TEXT NOT NULL,
  FOREIGN KEY (date) REFERENCES daily_summary(date) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_briefings_date_type ON briefings(date, type);

-- --- Sync log (per-device, per-run status) -------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,              -- whoop / oura / apple / weather / calendar
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  records_upserted INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sync_log_source ON sync_log(source, started_at DESC);
