-- Rich per-activity detail for workouts (Strava splits/laps/segments + extra
-- stats). Stored as a JSON blob so the shape can evolve without further
-- migrations; the summary columns above stay the queryable surface. NULL until
-- the detail endpoint has been fetched for that activity.
ALTER TABLE workouts ADD COLUMN detail_json TEXT;
