-- 005_add_calories.sql — Fitbit energy tracking.
-- calories_burned: active energy burned (from active-energy-burned, summed/day).
-- calories_in: logged food intake (from nutrition-log; needs nutrition OAuth scope —
--   stays NULL until the user re-authorizes, which is fine).
ALTER TABLE daily_summary ADD COLUMN fitbit_calories_burned INTEGER;
ALTER TABLE daily_summary ADD COLUMN fitbit_calories_in INTEGER;
