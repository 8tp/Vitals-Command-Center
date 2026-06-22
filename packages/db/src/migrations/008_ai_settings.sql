-- AI feature switches (app-level). `aiEnabled` is the master gate: off hides the
-- Ask tab + the dashboard AI summary and stops auto-generation. `aiAutoSummary`
-- controls whether the daily brief is generated automatically (on schedule + on
-- the dashboard when missing/stale); the manual Regenerate button works either
-- way as long as aiEnabled is on. Both default on to preserve current behavior.
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('aiEnabled', 'true'),
  ('aiAutoSummary', 'true');
