# Source adapters

Vitals normalizes data from several wearables into one row per day. This page
explains the adapter model — how data gets in, how a device is routed, how the
columns and consensus work — and gives a concrete, step-by-step guide for adding
a new source (using Garmin as the worked example).

If you only want to *configure* the sources that already exist, see
[CONFIGURATION](./CONFIGURATION.md) and [SELF_HOSTING](./SELF_HOSTING.md). This
page is for contributors.

---

## The two ingest paths

Every device's data arrives by exactly one of two paths:

### 1. The Google Health "bridge" (pull, multi-device)

The Google Health API client (`apps/api/src/services/fitbit.ts`) is more than a
Fitbit client — it's a **bridge**. A single Google OAuth connection can return
data points for several physical devices at once: Fitbit/Pixel directly, plus
Apple HealthKit and residual WHOOP/Oura data that those apps write *through*
HealthKit. Each data point carries a `dataSource`, which the bridge maps to one
of our four `DeviceSource`s:

```
platform === 'FITBIT'                → fitbit
packageName contains 'whoop'         → whoop      (checked before apple, so a
packageName contains 'oura'          → oura        WHOOP/Oura app writing through
packageName startsWith 'com.apple.health' → apple   HealthKit isn't mislabeled)
```

Rather than collapsing everything to one value, the bridge groups by device and
emits a separate daily-row + sleep-session set **per source**, so the normalizer
can fold them with the right per-device weighting.

### 2. Native adapters (per device)

When a device isn't taken from the bridge, it's pulled from its own native
client:

- **WHOOP** — OAuth 2.0 (`services/whoop.ts`), pull.
- **Oura** — Personal Access Token (`services/oura.ts`), pull.
- **Apple Health** — two native options: the **REST ingest**
  (`POST /api/ingest/apple`, push, from the iOS "Health Auto Export" app) and a
  legacy **XML export parser** (`services/apple-health.ts`, pull from a file).

---

## Routing: `dataSource → device` ownership

The single rule that prevents double-counting:

> A device is taken from the **bridge** if it is listed in
> `GOOGLE_HEALTH_SOURCES`; otherwise it falls to its **native** client.
> **Each device is populated by exactly one path.**

`GOOGLE_HEALTH_SOURCES` is a comma list of `fitbit`, `apple`, `whoop`, `oura`
(default: all four via the bridge). It's parsed by `parseBridgeSources()` in
`services/fitbit.ts`, which lowercases, trims, and drops anything that isn't a
valid `DeviceSource`. The sync orchestrator (`jobs/sync.ts`) reads it once per
run into a `Set` and gates each native client on it:

```ts
const bridgeSources = new Set(parseBridgeSources(process.env.GOOGLE_HEALTH_SOURCES));

// native WHOOP only runs when the bridge does NOT own whoop AND creds exist:
if (bridgeSources.has('whoop') || !process.env.WHOOP_CLIENT_ID) return EMPTY_WHOOP;
```

When the bridge *does* own a device, its bridge rows (in the generic
`FitbitDailyRow` shape) are mapped into that device's row shape
(`toWhoopRow` / `toOuraRow` / `toAppleRow` in `jobs/sync.ts`) before being
handed to the normalizer. Metrics the bridge doesn't carry for that device
(e.g. WHOOP strain) simply stay `null`.

> **Note on the Apple bridge case:** when `apple` is in `GOOGLE_HEALTH_SOURCES`,
> the scheduled sync's XML-parser path is skipped. The REST ingest route
> (`/api/ingest/apple`) is independent of the scheduled sync — it writes
> directly whenever the iOS app POSTs — so in practice keep `apple` out of
> `GOOGLE_HEALTH_SOURCES` if you intend to use the REST push.

---

## The data model: per-device columns + consensus

All four devices share one wide row in `daily_summary` (keyed by `date`). Each
device owns its own columns, plus there are `has_*` flags and shared consensus
columns. Source of truth is `packages/db/src/migrations/`.

### Per-device columns (`daily_summary`)

- **`has_fitbit` / `has_whoop` / `has_oura` / `has_apple`** — `1` when that
  device contributed a row for the date.
- **`{device}_*`** — the device's own readings. Notable shapes:
  - `fitbit_*`: `hrv`, `rhr`, `spo2`, `skin_temp_delta`, `respiratory_rate`,
    `sleep_score`, `sleep_hours`, `deep_hours`, `rem_hours`, `light_hours`,
    `steps`, `calories_burned`, `calories_in`.
  - `whoop_*`: `recovery_score`, `hrv`, `rhr`, `strain`, `calories`, `spo2`,
    `skin_temp_delta`, `sleep_score`, `sleep_hours`, `deep_hours`, `rem_hours`,
    `light_hours`.
  - `oura_*`: `readiness_score`, `sleep_score`, `activity_score`, `hrv`, `rhr`,
    `temp_deviation`, `spo2`, `respiratory_rate`, `sleep_hours`, `deep_hours`,
    `rem_hours`, `light_hours`, `steps`, `active_calories`, `total_calories`,
    `stress_high_min`.
  - `apple_*`: `hrv`, `rhr`, `spo2`, `vo2max`, `respiratory_rate`, `steps`,
    `active_calories`, `basal_calories`, `distance_km`, `exercise_minutes`,
    `stand_hours`.

`sleep_sessions` and `workouts` are separate tables, each with a `source` column
(`CHECK (source IN ('whoop','oura','apple','fitbit'))`) and a foreign key to
`daily_summary(date)`. Sleep/workout rows require a parent daily row, so the
writers call an `ensureDailyStub()` insert first.

### Consensus + confidence

The normalizer (`services/normalizer.ts`) folds the per-device rows into:

- **`consensus_hrv`, `consensus_rhr`, `consensus_sleep_hours`** — a weighted
  mean across whichever devices reported, using the per-metric accuracy ranking
  in `packages/shared/src/devices.ts` (`DEVICE_ACCURACY` →
  `accuracyWeight(metric, device)`: 1st place = 1.0, 2nd = 0.7, 3rd = 0.5,
  else 0.3; weight 0 sources are dropped, missing values are dropped rather
  than counted as zero).
- **`confidence_level`** — derived from how many devices contributed
  (`confidenceFromSources()` in `packages/shared/src/confidence.ts`): ≥2 devices
  → `HIGH`, 1 → `MEDIUM`, 0 → `NONE`.
- **`devices_active`** — count of contributing devices for the date.

---

## Add a new source adapter (worked example: Garmin)

This is the contributor checklist for wiring a brand-new device. The same shape
applies to any pull-based source; for a push-based source, see the REST-ingest
variant at the end.

### Step 1 — register the device enum

`packages/shared/src/devices.ts` is the single place the device union lives:

```ts
export const DEVICE_SOURCES = ['fitbit', 'whoop', 'oura', 'apple', 'garmin'] as const;
```

Then fill in the records keyed by `DeviceSource` so TypeScript stays exhaustive:

- `DEVICE_LABEL` — human label (e.g. `garmin: 'Garmin'`).
- `DEVICE_COLOR` / `DEVICE_COLOR_BG` — identity color for charts/dots/pills.
- `DEVICE_ACCURACY` — add `'garmin'` to each metric ranking where it
  contributes; its position sets its consensus weight.

### Step 2 — write the native client

Add `apps/api/src/services/garmin.ts`. Model it on `oura.ts` (PAT) or `whoop.ts`
(OAuth). It must export:

- A daily-row interface (`GarminDailyRow`) — one object per date with the
  metrics you'll write to `garmin_*` columns; use `number | null` for every
  metric and never throw on a missing field.
- A fetch result type:

  ```ts
  export interface GarminFetchResult {
    daily: GarminDailyRow[];
    sleepSessions: SleepSession[];   // from @vcc/shared, source: 'garmin'
    workouts: Workout[];             // from @vcc/shared, source: 'garmin'
  }
  ```

- A client with `fetchDaysInRange(start, end): Promise<GarminFetchResult>` that
  returns the normalized shapes. Follow the existing conventions: rate-limit
  backoff on 429, hours = seconds / 3600, distances in km, sport slugs
  lowercased with spaces → underscores so they line up across devices.

If the source uses OAuth, mirror the WHOOP auth routes in
`apps/api/src/routes/auth.ts` (`/auth/garmin/authorize` + `/auth/garmin/callback`,
reusing the in-memory state-store helpers) and add the corresponding env vars to
`.env.example` and [CONFIGURATION](./CONFIGURATION.md).

### Step 3 — add the columns

Create the next migration, e.g.
`packages/db/src/migrations/006_add_garmin.sql`. Migrations are additive and run
in filename order on every boot (tracked in `_migrations`). Two parts:

1. `ALTER TABLE daily_summary ADD COLUMN has_garmin INTEGER NOT NULL DEFAULT 0;`
   plus one `ADD COLUMN garmin_<metric> ...` per metric.
2. SQLite can't alter a `CHECK` constraint, so to let `sleep_sessions` /
   `workouts` accept `source = 'garmin'` you must recreate each table with the
   widened `CHECK (... ,'garmin')`, copy rows, drop, rename, and re-create the
   indexes — copy the pattern verbatim from `004_add_fitbit.sql`.

Update the `daily_summary` upsert query in
`packages/db/src/queries/dailySummary.ts` to include the new columns.

### Step 4 — teach the normalizer

In `services/normalizer.ts`:

- Add `garmin?: GarminDailyRow[]` to the `perDevice` argument and index it by
  date alongside the others.
- Push `'garmin'` into `devicesPresent` when a Garmin row exists for the date.
- Add the `garmin_*` fields to the `queries.dailySummary.upsert(...)` call.
- Include Garmin's value in the `weightedAvg(...)` maps for any consensus metric
  it should influence (`hrv`, `rhr`, `sleep_stages`).

### Step 5 — wire it into the sync orchestrator

In `jobs/sync.ts`:

- Add an `EMPTY_GARMIN` constant.
- Add a `pullSource('garmin', ...)` block that returns `EMPTY_GARMIN` when the
  bridge owns the device or creds are missing, otherwise calls
  `new GarminClient(...).fetchDaysInRange(start, end)`. This gives you free
  `sync_log` bookkeeping and error containment.
- Add `garmin: garmin.daily` to the `normalizeAndUpsert(db, { ... })` call.
- Spread `...garmin.sleepSessions` and `...garmin.workouts` into the
  `writeSessions(...)` arrays.

(If Garmin can also arrive via the Google Health bridge, also extend
`GOOGLE_HEALTH_SOURCES`'s valid set and add a `toGarminRow(...)` mapper — but
most third-party devices are native-only.)

### Step 6 — verify

```bash
npm run db:migrate          # apply the new migration
npm run typecheck           # the exhaustive DeviceSource records catch gaps
npm run sync:manual -- --days 2
sqlite3 ./data/vitals.db "SELECT date, has_garmin, garmin_hrv FROM daily_summary ORDER BY date DESC LIMIT 3;"
```

---

## Push-based sources (REST ingest)

For a device whose data is pushed to you (like Apple's "Health Auto Export"),
skip the pull client/scheduler wiring and instead add a route. The Apple route
(`apps/api/src/routes/ingest.ts`) is the template:

1. `POST /api/ingest/<source>` with a shared-secret check that **fails closed**
   (reject every request when the secret env is unset; accept either an
   `x-<source>-ingest-secret` header or `Authorization: Bearer <secret>`).
2. A tolerant parser (see `parseHealthAutoExport` in `services/apple-health.ts`)
   that maps the incoming JSON to your `*DailyRow[]`, `SleepSession[]`, and
   `Workout[]` shapes — be liberal about missing/renamed fields.
3. `normalizeAndUpsert(db, { <source>: parsed.daily })` for the daily row, then
   `ensureDailyStub` + `queries.sleep.upsert` / `queries.workouts.upsert` for
   sessions and workouts.

Steps 1, 3, and 4 above (enum, columns, normalizer) still apply; you just
replace the pull client + scheduler wiring with the route.
