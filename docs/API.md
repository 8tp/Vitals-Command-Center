# API reference

The Vitals REST API is served by `apps/api` (Fastify). All routes are mounted
under the `/api` prefix and default to `http://localhost:3001` (`API_PORT`).

## Conventions

**Response envelope.** Every response uses one envelope shape:

```jsonc
// success
{ "ok": true, "data": { /* route-specific payload */ } }

// failure
{ "ok": false, "error": { "error": "human message", "code": "CODE", "details": [] } }
```

`details` is optional and present mainly on validation errors.

**Common error codes:** `VALIDATION` (400, bad request body/params/query),
`NOT_FOUND` (404), `CONFLICT` (409), `UNAUTHORIZED` (401), `MISCONFIGURED` (500,
a required env var is unset), `INTERNAL` (500). OAuth and upstream failures use
specific codes (`WHOOP_EXCHANGE`, `GOOGLE_EXCHANGE`, `INVALID_STATE`, etc.).

**Ranges.** Endpoints that accept a `range` query string take either a preset
(`7d`, `14d`, `30d`, `90d` — any `<n>d`) or an explicit window
`YYYY-MM-DD..YYYY-MM-DD`. Defaults vary per route (7 or 30 days). The resolved
`{ start, end, days }` is echoed back in `data.range`.

**Content type.** All routes are `application/json`, except `POST /api/ask` which
streams **Server-Sent Events** (`text/event-stream`).

**CORS.** The API uses an explicit origin allowlist (`CORS_ORIGINS`, default
`http://localhost:5173,http://localhost:3001`); arbitrary origins are not reflected.

---

## Health & status

### `GET /api/health`
Service liveness. Returns status, uptime, timestamp, and the latest sync per source.
```jsonc
{ "ok": true, "data": { "status": "operational", "uptimeSec": 0, "timestamp": "…", "lastSyncs": { /* per source */ } } }
```

### `GET /api/devices/status`
Connection status for every device source (`fitbit`, `whoop`, `oura`, `apple`).
"Connected" means the integration is working (recent successful sync that
produced rows, or recent data) — not necessarily that today's row exists yet.
```jsonc
{ "ok": true, "data": { "date": "YYYY-MM-DD", "statuses": [
  { "source": "fitbit", "connected": true, "hasTodayData": false,
    "lastSeen": "…", "lastSyncOk": true, "message": "connected · today's cycle in progress" }
] } }
```

### `GET /api/config/status`
What the stack has configured, so the UI can gate AI-backed actions. Reveals
booleans + local file paths only — **no secrets**. Includes a ready-to-paste
Claude Desktop MCP config snippet with absolute paths resolved.
```jsonc
{ "ok": true, "data": {
  "claudeApiConfigured": true, "anthropicApiConfigured": false,
  "whoopConfigured": true, "ouraConfigured": false, "appleIngestConfigured": true,
  "mcp": { "serverName": "vitals-command-center", "transport": "stdio",
           "paths": { /* … */ }, "claudeDesktopConfig": { "snippet": "…", "command": "…", "args": [] } }
} }
```

---

## Daily summary

### `GET /api/daily`
Daily summary rows over a range. Query: `range` (default `7d`).
```jsonc
{ "ok": true, "data": { "range": { "start": "…", "end": "…", "days": 7 }, "rows": [ /* daily_summary */ ] } }
```

### `GET /api/daily/:date`
A single day's summary. `:date` must be `YYYY-MM-DD`. `404 NOT_FOUND` if absent.

---

## Sleep

### `GET /api/sleep`
Sleep sessions over a range. Query: `range` (default `7d`).
```jsonc
{ "ok": true, "data": { "range": { … }, "sessions": [ /* per-source sessions */ ] } }
```

### `GET /api/sleep/:date`
Sleep sessions for one date.
```jsonc
{ "ok": true, "data": { "date": "YYYY-MM-DD", "sessions": [ … ] } }
```

---

## Workouts

### `GET /api/workouts`
Workouts over a range. Query: `range` (default `30d`), optional `sport`
(case-insensitive exact match filter).
```jsonc
{ "ok": true, "data": { "range": { … }, "workouts": [ … ] } }
```

---

## Vitals (metric trends)

### `GET /api/vitals`
A single metric's time series with a 7-day moving average and a trend delta.

Query:
- `metric` (**required**) — one of `hrv`, `rhr`, `sleep_hours`, `recovery`,
  `strain`, `steps`, `readiness`, `temp_deviation`, `spo2`, `vo2max`.
- `range` — default `30d`.

Returns per-device `points` (each tagged with its `source`), a `consensus`
series for metrics that have one (`hrv`, `rhr`, `sleep_hours`), the
`movingAverage7d` series, and a `delta` (`{ pct, direction: up|down|flat }`).
```jsonc
{ "ok": true, "data": {
  "metric": "hrv", "range": { … },
  "points": [ { "date": "…", "value": 62, "source": "oura" }, { "date": "…", "value": null, "source": "consensus" } ],
  "movingAverage7d": [ { "date": "…", "value": 60 } ],
  "delta": { "pct": 4.2, "direction": "up" }
} }
```

---

## Compare (per-device cross-check)

### `GET /api/compare`
Per-device readings for one date with a divergence-based confidence per metric
(HRV, RHR, sleep duration, SpO₂). Query: `date` (**required**, `YYYY-MM-DD`).
`404 NOT_FOUND` if no summary for that date.
```jsonc
{ "ok": true, "data": { "date": "YYYY-MM-DD", "comparison": [
  { "key": "hrv", "label": "HRV (rMSSD)", "unit": "ms", "toleranceAbs": 8,
    "devices": [ { "device": "oura", "value": 61 }, { "device": "whoop", "value": 58 } ],
    "confidence": "HIGH" }
] } }
```

---

## Habits

### `GET /api/habits`
List active habits → `{ "ok": true, "data": { "habits": [ … ] } }`.

### `POST /api/habits`
Create a habit. Body (Zod `createHabitSchema`): `name`, `category`, `type`,
optional `unit`, `targetValue`, `sortOrder`. Returns the created habit.

### `PUT /api/habits/:id`
Update a habit (Zod `updateHabitSchema`). `404 NOT_FOUND` if the id is unknown.

### `DELETE /api/habits/:id`
Soft-delete a habit → `{ "ok": true, "data": { "deleted": "<id>" } }`.

### `GET /api/habits/log`
Habit log entries over a range. Query: `range` (default `30d`).

### `POST /api/habits/log`
Log a habit check-in. Body (Zod `logHabitSchema`): `habitId`, `value`, optional
`date` (defaults to today). Returns the stored log entry.

### `GET /api/habits/streaks`
Current and longest streaks per habit → `{ "ok": true, "data": { "streaks": [ … ] } }`.

### `GET /api/habits/correlations`
Habit↔metric correlations. Currently returns an empty set with a note
(correlation engine is a future phase).

---

## Insights & briefings

### `GET /api/insights/today`
Today's summary, the latest stored daily briefing, and computed insights.
```jsonc
{ "ok": true, "data": { "date": "…", "summary": { … }, "briefing": { … }, "insights": [ … ] } }
```

### `GET /api/insights/briefing/:date`
A previously-stored daily briefing for a date. `404 NOT_FOUND` if none.

### `POST /api/insights/generate`
Generate (and store) a daily briefing via the on-box AI provider chain. Body
(optional): `{ "date": "YYYY-MM-DD" }`, defaults to today. Requires a
`daily_summary` for that date (else `400 NO_DATA`); AI failures return `502
CLAUDE_FAILED`. Returns the stored briefing.

---

## Ask (streaming Q&A)

### `POST /api/ask`
Free-form question answered by the on-box AI provider chain over your recent
data. Body (Zod `askSchema`): `question`, optional `context.date`.

**Response is Server-Sent Events** (`text/event-stream`). The CLI providers are
non-streaming, so the answer arrives as a single event followed by `[DONE]`:
```
data: {"text":"…the answer…"}

data: [DONE]
```
On error: `data: {"error":"…"}` then the stream ends.

---

## Sync

### `POST /api/sync`
Trigger a sync. Body (optional): `days` (1–1095, the backfill window),
`includeApple` (boolean). Fire-and-forget — returns immediately. Returns
`409 CONFLICT` if a sync is already running.
```jsonc
{ "ok": true, "data": { "triggered": true, "rangeDays": 7 } }
```

### `GET /api/sync/status`
Last sync time, whether a sync is running, and per-device sync state.
```jsonc
{ "ok": true, "data": { "lastSyncAt": "…", "running": false,
  "perDevice": [ { "source": "fitbit", "lastSyncAt": "…", "ok": true, "message": null } ] } }
```

---

## Ingest (Apple Health)

### `POST /api/ingest/apple`
Receives a payload from the iOS **Health Auto Export** app and upserts it as
Apple daily rows, sleep sessions, and workouts (all tagged `source: apple`).

**Auth (required):** send the shared secret as either header
`x-apple-ingest-secret: <APPLE_INGEST_SECRET>` **or** `Authorization: Bearer
<APPLE_INGEST_SECRET>`. The route **fails closed**: if `APPLE_INGEST_SECRET` is
unset, every request is rejected with `401 UNAUTHORIZED`.

**Body:** `{ "data": { "metrics": [ … ], "workouts": [ … ] } }` (Health Auto
Export format). Malformed bodies return `400 VALIDATION` / `400 PARSE_ERROR`.
```jsonc
{ "ok": true, "data": { "dailyUpserted": 3, "sleepUpserted": 3, "workoutUpserted": 2, "dates": [ "…" ] } }
```

---

## Auth (OAuth callbacks)

These are browser-redirect endpoints, not JSON APIs — open them in a browser to
connect a source. They are no-ops if the corresponding client id is unset
(returns `500 MISCONFIGURED`).

### WHOOP
- `GET /api/auth/whoop/authorize` — redirects to WHOOP's consent screen.
- `GET /api/auth/whoop/callback?code&state` — exchanges the code, persists
  tokens, redirects to `WHOOP_POST_AUTH_REDIRECT`. Bad/expired state →
  `400 INVALID_STATE`; exchange failure → `502 WHOOP_EXCHANGE`.
- `GET /api/auth/whoop/status` → `{ "ok": true, "data": { "connected": bool } }`.

### Google Health API (Fitbit/Pixel + bridge)
- `GET /api/auth/google/authorize` — redirects to Google's consent screen.
- `GET /api/auth/google/callback?code&state` — exchanges the code, persists
  tokens, redirects to `GOOGLE_POST_AUTH_REDIRECT`.
- `GET /api/auth/google/status` → `{ "ok": true, "data": { "connected": bool, "reauthNeeded": bool } }`
  (`reauthNeeded` is `true` after a token refresh hit `invalid_grant`).

> Oura uses a personal access token (`OURA_PAT`) and has no OAuth flow.

---

## Static dashboard

In production, the API also serves the built web dashboard from `apps/web/dist`
at `/`, with an SPA fallback (any non-`/api` GET that isn't a static file returns
`index.html`). In development the dashboard is served separately by Vite, so this
path no-ops until the web app is built.
