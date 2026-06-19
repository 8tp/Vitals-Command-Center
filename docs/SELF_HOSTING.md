# Self-hosting Vitals

This is the end-to-end guide to running Vitals on your own hardware. Vitals is
**self-hosted and privacy-first**: your health data lives in a local SQLite file
and never touches a vendor cloud. The only traffic that leaves the box is
whatever AI provider you choose — and nothing at all if you run a fully local one
(Ollama).

The repo is a TypeScript monorepo:

- `apps/api` — Fastify API; also serves the built dashboard and runs the
  sync/brief background jobs.
- `apps/web` — React PWA dashboard.
- `apps/mcp-server` — MCP server for the claude.ai web app.
- `packages/db` — SQLite schema + queries.
- `packages/shared` — shared types and constants.

> For the complete `.env` reference, see [CONFIGURATION](./CONFIGURATION.md).
> For how data sources are routed and how to add a new one, see
> [ADAPTERS](./ADAPTERS.md).

---

## 1. Prerequisites

- **Node.js 20+** (22 works too). The repo's `engines` requires `>=20`.
- **An always-on box** to host it — a Mac mini is the reference target; any
  Linux box works as well.
- **git** and a terminal.
- *Optional:* **Tailscale**, for private remote access to the dashboard and to
  expose the MCP server to claude.ai.
- *Optional:* **Ollama** (or another local LLM server), if you want AI briefs
  with zero cloud calls.
- *Optional:* **Python 3.12+** and the `sqlite3` CLI — only needed for the
  legacy Apple Health XML importer and for shell scripts.

`better-sqlite3` is a native module, so a working C/C++ toolchain is needed at
install time (Xcode Command Line Tools on macOS; `build-essential` + `python3`
on Debian/Ubuntu).

## 2. Clone and install

```bash
git clone https://github.com/USER/vitals-command-center.git
cd vitals-command-center
npm install
```

There's also a guided bootstrap script that checks prerequisites, copies the env
template, installs, migrates, and offers to seed demo data:

```bash
npm run setup
```

Either way, create your `.env` (the setup script does this for you):

```bash
cp .env.example .env
```

Then apply the database schema (idempotent; also runs automatically on API
boot):

```bash
npm run db:migrate
```

Want something on screen before connecting real devices? Seed 90 days of demo
data:

```bash
npm run db:seed
```

## 3. Configure `.env`

Open `.env` and fill in the variables for the features you want. The full
reference — every variable, its default, and whether it's required/secret — is in
[CONFIGURATION](./CONFIGURATION.md). At minimum you need **one data source** and
**one AI provider**.

A few things worth setting deliberately:

- `GOOGLE_HEALTH_SOURCES` decides which devices come from the Google Health
  bridge vs. their native adapters (see [ADAPTERS](./ADAPTERS.md)). Default is
  all four via the bridge. If you plan to push Apple data over REST, keep
  `apple` *out* of this list.
- `AI_PROVIDERS` is the ordered fallback chain for briefs and `/ask`
  (`claude,codex` by default; use `ollama` for fully local).
- On your production box, set `NODE_ENV=production`.

## 4. Connect at least one data source

You only need one to get going. Connect more later.

### Connect Google Health (the "bridge")

The Google Health API connection can cover Fitbit/Pixel, Apple HealthKit, and
residual WHOOP/Oura in one OAuth grant.

1. In Google Cloud Console, enable the **Google Health API** and create an OAuth
   **Web application** client. Run the consent screen as **External / Testing**
   and add your own Google account as a test user — this is a personal,
   unverified app, so no security review is needed.
2. Add the redirect URI **exactly** as Vitals uses it:
   `http://localhost:3001/api/auth/google/callback`.
3. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` into `.env`.
4. Start Vitals (`npm run dev`, see §5) and visit
   `http://localhost:3001/api/auth/google/authorize` (or click **Connect** on the
   dashboard). Approve in the browser; Google redirects back, tokens are
   persisted to `data/.google-tokens.json`, and they auto-refresh thereafter.

**Headless box?** Google only allows `localhost` redirect URIs for unverified
apps, so the callback must land on `localhost` *as seen from your browser*. SSH
forward the API port from your laptop to the box and do the OAuth dance locally:

```bash
ssh -L 3001:localhost:3001 you@your-host
# then on your laptop, open:
#   http://localhost:3001/api/auth/google/authorize
```

The browser hits `localhost:3001` on your laptop, the tunnel forwards it to the
box, the box exchanges the code and writes `data/.google-tokens.json`. Tear down
the tunnel once it's done.

### Connect WHOOP (native OAuth)

Use this when `whoop` is **not** in `GOOGLE_HEALTH_SOURCES`.

1. Create an app at <https://developer.whoop.com>.
2. Scopes:
   `read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline`.
3. Set the redirect URI to `http://localhost:3001/api/auth/whoop/callback`.
4. Put `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` into `.env`.
5. Start Vitals, then visit
   `http://localhost:3001/api/auth/whoop/authorize` (or click **Connect WHOOP**
   on the dashboard). Approve; tokens persist to `data/.whoop-tokens.json` and
   the refresh token auto-rotates. (The headless SSH-tunnel trick above works
   here too.)

### Connect Oura (native PAT)

Use this when `oura` is **not** in `GOOGLE_HEALTH_SOURCES`.

1. <https://cloud.ouraring.com> → **Personal Access Tokens** → create one.
2. Set `OURA_PAT=...` in `.env`. PATs don't expire; that's the whole setup.

### Connect Apple Health (REST push)

Use this when `apple` is **not** in `GOOGLE_HEALTH_SOURCES`. Apple has no public
pull API, so data is pushed from your iPhone by the **Health Auto Export** app.

1. Set `APPLE_INGEST_SECRET=<a random 32-byte hex string>` in `.env`. (The
   ingest route **fails closed** — if this is unset, every request is rejected.)
2. Install **Health Auto Export** from the App Store.
3. In the app, add a REST API automation pointing at your box (over Tailscale or
   your LAN):
   - **URL:** `http://<your-host>:3001/api/ingest/apple`
   - **Header:** `x-apple-ingest-secret: <same value as APPLE_INGEST_SECRET>`
     (or `Authorization: Bearer <value>`)
   - **Schedule:** hourly (or whatever cadence you like)
   - **Format:** JSON
4. Enable the metric set: HRV (SDNN), resting HR, SpO2, VO2max, respiratory
   rate, step count, active + basal energy, walking/running distance, exercise
   time, stand hours, and (optionally) sleep analysis and all workout types.
5. After the first delivery, confirm rows are landing:

   ```bash
   sqlite3 ./data/vitals.db \
     "SELECT date, has_apple, apple_hrv FROM daily_summary ORDER BY date DESC LIMIT 3;"
   ```

   Re-ingesting the same payload is safe — upserts dedupe on `(date, id)`.

**Legacy/fallback — full XML export.** If you want the complete native export
(or Auto Export is unavailable), do a bulk import. On the iPhone:
Health → Profile → **Export All Health Data**, then unzip the archive into
`./data/apple-health-export/`. Point `APPLE_HEALTH_EXPORT_PATH` at the
`export.xml` and the scheduled sync picks it up (only when `apple` is **not**
owned by the bridge). A Python importer is also available:

```bash
python3 scripts/import_apple_health.py \
  --export ./data/apple-health-export/export.xml \
  --db ./data/vitals.db
```

## 5. Run it

### Development (everything, hot-reload)

```bash
npm run dev
```

This runs the API (`:3001`), the Vite dashboard (`:5173`), and the MCP server
concurrently. Open **http://localhost:5173**. (Individual workspaces:
`npm run dev:api`, `npm run dev:web`, `npm run dev:mcp`.)

### Production (build once, the API serves the dashboard)

```bash
npm run build          # builds all workspaces (incl. apps/web/dist)
NODE_ENV=production npm run start --workspace apps/api
```

In production the API serves the built dashboard from `apps/web/dist`, so you
only run the **one** API process to get both the API and the UI on `:3001`. The
in-process schedulers start automatically (unless `DISABLE_SCHEDULERS=1`).

## 6. First sync and first brief

Pull data on demand instead of waiting for the 4-hour cron:

```bash
npm run sync:manual            # last 7 days
npm run sync:manual -- --days 2
```

Generate today's brief. Either hit the API route once data exists:

```bash
curl -X POST http://localhost:3001/api/insights/generate \
  -H 'content-type: application/json' -d '{}'
```

…or run the on-box brief job directly (uses your `AI_PROVIDERS` chain):

```bash
npx tsx apps/api/src/jobs/local-brief.ts --once
# optionally: --once --date 2026-06-18
```

The brief appears on the dashboard and is stored in the `briefings` table.

## 7. Make it durable

The API already runs the schedulers in-process (sync every 4h, brief 06:00,
weekly report Sunday 08:00 — all overridable via the `*_CRON` vars). For a
self-healing setup, run the long-lived processes under your OS service manager
and let dedicated jobs handle sync/brief/backup. Set `DISABLE_SCHEDULERS=1` on
the API if you'd rather drive sync/brief from the service manager than in-process.

### macOS (launchd)

The repo ships a working briefing example at
`scripts/com.vcc.briefing.plist` (it fires every 30 min in the morning and calls
the idempotent `scripts/brief-if-ready.sh`, which syncs and then generates the
brief via the Claude Code CLI once today's data is present). Use it as a model.

A minimal **API** agent — `~/Library/LaunchAgents/com.vcc.api.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.vcc.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd /path/to/vitals-command-center && NODE_ENV=production npm run start --workspace apps/api</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/path/to/vitals-command-center/data/api.out.log</string>
  <key>StandardErrorPath</key><string>/path/to/vitals-command-center/data/api.err.log</string>
</dict>
</plist>
```

A standalone **sync** agent (if you set `DISABLE_SCHEDULERS=1`) — fire every 4h
and run `npm run sync:manual`:

```xml
<key>Label</key><string>com.vcc.sync</string>
<key>ProgramArguments</key>
<array>
  <string>/bin/zsh</string><string>-lc</string>
  <string>cd /path/to/vitals-command-center && npm run sync:manual</string>
</array>
<key>StartCalendarInterval</key>
<array>
  <dict><key>Minute</key><integer>0</integer><key>Hour</key><integer>0</integer></dict>
  <dict><key>Minute</key><integer>0</integer><key>Hour</key><integer>4</integer></dict>
  <dict><key>Minute</key><integer>0</integer><key>Hour</key><integer>8</integer></dict>
  <dict><key>Minute</key><integer>0</integer><key>Hour</key><integer>12</integer></dict>
  <dict><key>Minute</key><integer>0</integer><key>Hour</key><integer>16</integer></dict>
  <dict><key>Minute</key><integer>0</integer><key>Hour</key><integer>20</integer></dict>
</array>
```

The **MCP** server runs the same way — start it with
`npm run start:http --workspace apps/mcp-server` (needs `MCP_AUTH_USER` /
`MCP_AUTH_PASSWORD` set, or it refuses to boot).

A **nightly DB backup** agent (runs the backup command from §9):

```xml
<key>Label</key><string>com.vcc.backup</string>
<key>StartCalendarInterval</key>
<dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
```

Load any agent with:

```bash
launchctl load -w ~/Library/LaunchAgents/com.vcc.api.plist
```

### Linux (systemd)

Equivalent with a unit per long-lived process and `systemd` timers for the
periodic jobs. For the API:

```ini
# /etc/systemd/system/vitals-api.service
[Unit]
Description=Vitals API
After=network.target

[Service]
WorkingDirectory=/path/to/vitals-command-center
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start --workspace apps/api
Restart=always

[Install]
WantedBy=multi-user.target
```

Use `vitals-sync.service` + `vitals-sync.timer` (`OnCalendar=*-*-* 00/4:00:00`)
for sync, and a similar timer for the nightly backup. Enable with
`systemctl enable --now vitals-api`.

## 8. Remote access with Tailscale

Vitals is designed to sit behind Tailscale rather than be exposed directly:

- **Dashboard → Tailscale Serve** (private to your tailnet). Bind the API to
  loopback (`API_HOST=127.0.0.1`) and let Serve front it on a TLS port:

  ```bash
  tailscale serve --bg --https 8443 http://127.0.0.1:3001
  ```

  Now your dashboard is reachable at `https://<host>.<tailnet>.ts.net:8443`,
  only from devices on your tailnet. Add that origin to `CORS_ORIGINS` if the
  browser calls the API cross-origin.

- **MCP → Tailscale Funnel** (public, for claude.ai). The MCP server binds
  `127.0.0.1:8787` and is guarded by its OAuth gate; Funnel exposes it publicly
  so claude.ai can reach it:

  ```bash
  tailscale funnel --bg 8787
  ```

  Set `MCP_PUBLIC_URL=https://<host>.<tailnet>.ts.net` in `.env` so the OAuth
  metadata URLs are correct, and make sure `MCP_AUTH_USER` / `MCP_AUTH_PASSWORD`
  are set. Both the API and MCP bind loopback by design — only Tailscale fronts
  them.

## 9. Database backups

Everything lives in one SQLite file (`DB_PATH`, default `./data/vitals.db`), plus
your tokens and secrets under `data/` (all gitignored). Back up `data/` and your
`.env`.

For a consistent online snapshot of the DB while it's running (WAL mode), use the
SQLite backup API rather than a raw file copy:

```bash
sqlite3 ./data/vitals.db ".backup './data/backups/vitals-$(date +%F).db'"
```

Schedule that nightly via the launchd/systemd backup job above, and prune old
snapshots however you like (e.g. keep 30 days). Restoring is just copying a
backup file back to `DB_PATH`.

## 10. Updating

```bash
git pull
npm install          # pick up dependency changes
npm run db:migrate   # apply any new migrations (also runs on API boot)
npm run build        # production: rebuild API + dashboard
# then restart the API (and MCP) service
```

Migrations are additive and idempotent, so they're safe to run on every update;
the API also applies pending migrations automatically when it boots. Back up
`data/` before a major update, just in case.
