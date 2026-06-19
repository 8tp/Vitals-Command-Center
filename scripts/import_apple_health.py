#!/usr/bin/env python3
"""
Apple Health XML importer (standalone Python fallback).

Why Python and not the TS parser? iOS exports can be multi-hundred-MB files and
SAX parsing in Python is memory-bounded regardless of file size. Useful when
doing a one-shot bulk import of historical data before the TS parser runs live.

Usage:
    python3 scripts/import_apple_health.py --export path/to/export.xml --db ./data/vitals.db
"""
import argparse
import sqlite3
from datetime import datetime
from xml.etree import ElementTree as ET

PULL = {
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': ('hrv', lambda v, u: v),
    'HKQuantityTypeIdentifierRestingHeartRate': ('rhr', lambda v, u: v),
    'HKQuantityTypeIdentifierOxygenSaturation': ('spo2', lambda v, u: v * 100),
    'HKQuantityTypeIdentifierVO2Max': ('vo2max', lambda v, u: v),
    'HKQuantityTypeIdentifierRespiratoryRate': ('respiratory_rate', lambda v, u: v),
    'HKQuantityTypeIdentifierStepCount': ('steps', lambda v, u: v),
    'HKQuantityTypeIdentifierActiveEnergyBurned': ('active_calories', lambda v, u: v),
    'HKQuantityTypeIdentifierBasalEnergyBurned': ('basal_calories', lambda v, u: v),
    'HKQuantityTypeIdentifierDistanceWalkingRunning': (
        'distance_km',
        lambda v, u: v * 1.609 if u == 'mi' else v,
    ),
    'HKQuantityTypeIdentifierAppleExerciseTime': ('exercise_minutes', lambda v, u: v),
    'HKCategoryTypeIdentifierAppleStandHour': ('stand_hours', lambda v, u: 1),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--export', required=True, help='Path to export.xml')
    parser.add_argument('--db', required=True, help='Path to vitals.db')
    args = parser.parse_args()

    per_day: dict[str, dict[str, float]] = {}
    for event, elem in ET.iterparse(args.export, events=('start',)):
        if elem.tag != 'Record':
            elem.clear()
            continue
        t = elem.attrib.get('type')
        if t not in PULL:
            elem.clear()
            continue
        try:
            v = float(elem.attrib.get('value', ''))
        except ValueError:
            elem.clear()
            continue
        unit = elem.attrib.get('unit', '')
        start = elem.attrib.get('startDate', '')[:10]
        if not start:
            elem.clear()
            continue
        col, xform = PULL[t]
        val = xform(v, unit)
        bucket = per_day.setdefault(start, {})
        if col in ('steps', 'active_calories', 'basal_calories', 'distance_km', 'exercise_minutes', 'stand_hours'):
            bucket[col] = bucket.get(col, 0.0) + val
        else:
            existing = bucket.get(col)
            bucket[col] = (existing + val) / 2 if existing is not None else val
        elem.clear()

    con = sqlite3.connect(args.db)
    con.execute('PRAGMA foreign_keys = ON')
    cur = con.cursor()
    for date, row in sorted(per_day.items()):
        cur.execute(
            'INSERT OR IGNORE INTO daily_summary (date, has_apple, devices_active) VALUES (?, 1, 0)',
            (date,),
        )
        sets = ', '.join(f'apple_{k} = ?' for k in row)
        params = list(row.values())
        params.append(date)
        cur.execute(f'UPDATE daily_summary SET has_apple = 1, {sets} WHERE date = ?', params)
    con.commit()
    con.close()
    print(f'[apple-import] processed {len(per_day)} days', flush=True)


if __name__ == '__main__':
    main()
