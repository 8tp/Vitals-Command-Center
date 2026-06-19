-- 002_default_habits.sql — seed the default habit library from SPEC.md

INSERT OR IGNORE INTO habits (id, name, category, type, unit, target_value, sort_order, created_at) VALUES
  ('habit_energy_level',      'Energy level',              'morning_checkin', 'scale_1_5', NULL, NULL, 1,  datetime('now')),
  ('habit_sleep_quality',     'Sleep quality (subjective)','morning_checkin', 'scale_1_5', NULL, NULL, 2,  datetime('now')),
  ('habit_soreness',          'Soreness',                  'morning_checkin', 'scale_1_5', NULL, NULL, 3,  datetime('now')),
  ('habit_intention',         'Today''s intention',        'morning_checkin', 'text',      NULL, NULL, 4,  datetime('now')),

  ('habit_caffeine_cutoff',   'Caffeine cutoff time',      'evening_checkin', 'time',      NULL, NULL, 10, datetime('now')),
  ('habit_last_meal',         'Last meal time',            'evening_checkin', 'time',      NULL, NULL, 11, datetime('now')),
  ('habit_alcohol',           'Alcohol',                   'evening_checkin', 'boolean',   NULL, NULL, 12, datetime('now')),
  ('habit_supplements',       'Supplements taken',         'evening_checkin', 'boolean',   NULL, NULL, 13, datetime('now')),
  ('habit_screen_off',        'Screen off time',           'evening_checkin', 'time',      NULL, NULL, 14, datetime('now')),
  ('habit_stress',            'Stress level',              'evening_checkin', 'scale_1_5', NULL, NULL, 15, datetime('now')),
  ('habit_mood',              'Mood',                      'evening_checkin', 'scale_1_5', NULL, NULL, 16, datetime('now')),
  ('habit_daily_note',        'Daily note',                'evening_checkin', 'text',      NULL, NULL, 17, datetime('now')),

  ('habit_10k_steps',         'Hit 10k steps',             'auto_tracked',    'boolean',   'steps', 10000, 20, datetime('now')),
  ('habit_trained',           'Trained today',             'auto_tracked',    'boolean',   NULL, NULL, 21, datetime('now')),
  ('habit_bed_by_target',     'In bed by target time',     'auto_tracked',    'boolean',   NULL, NULL, 22, datetime('now')),
  ('habit_no_afternoon_caff', 'No caffeine after noon',    'auto_tracked',    'boolean',   NULL, NULL, 23, datetime('now'));
