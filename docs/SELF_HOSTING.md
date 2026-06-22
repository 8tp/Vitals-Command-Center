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

**Two hard requirements — install these first or `npm install` will fail:**

- **Node.js >= 20** (22 works too). The repo's `engines` requires `>=20`.
- **A C/C++ toolchain.** `better-sqlite3` is a native module that compiles at
  install time:
  - **macOS:** `xcode-select --install`
  - **Debian/Ubuntu:** `sudo apt install build-essential python3`

Then:

- **git** and a terminal.
- **An always-on box** to host it — a Mac mini is the reference target; any
  Linux box works as well. The app and the systemd units are Linux-portable;
  the shipped launchd plist + shell scripts are macOS examples (see §7).
- *Optional:* **Tailscale**, for private remote access to the dashboard and to
  expose the MCP server to claude.ai.
- *Optional:* **Ollama** (or another local LLM server), if you want AI briefs
  with zero cloud calls (see §3 and §5).
- *Optional:* **Python 3.12+** and the `sqlite3` CLI — only needed for the
  legacy Apple Health XML importer and for shell scripts.

## 2. Clone and install

```bash
git clone https://github.com/8tp/Vitals-Command-Center.git
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

The schema applies itself: migrations **001–008 auto-run on API boot**, so the
explicit migrate step is optional. Run it by hand only if you want the DB built
before the first start (idempotent):

```bash
npm run db:migrate   # optional
```

### See it working first (recommended)

Before wiring up any real account, seed 90 days of demo data and start the app —
this is the fastest way to confirm your install is healthy and to see every
dashboard surface populated:

```bash
npm run db:seed       # 90 days of synthetic data
npm run dev           # then open http://localhost:5173
```

Once the demo data looks right, connect a real source (§4).

## 3. Configure `.env`

Open `.env` and fill in the variables for the features you want. The full
reference — every variable, its default, and whether it's required/secret — is in
[CONFIGURATION](./CONFIGURATION.md). At minimum you need **one data source** and
**one AI provider**.

A few things worth setting deliberately:

- `GOOGLE_HEALTH_SOURCES` decides which devices come from the Google Health
  bridge vs. their native adapters (see [ADAPTERS](./ADAPTERS.md)). The default
  lists **all four** (`fitbit,apple,whoop,oura`), i.e. everything via the bridge.
  **Critical:** a native adapter (Oura PAT / WHOOP OAuth / Apple REST) is
  *silently ignored* for any source still in this list — the bridge owns it. To
  use a native adapter you must **remove that source from
  `GOOGLE_HEALTH_SOURCES`** (or set the list empty). This is the most common
  "I set my Oura token but nothing syncs" trap.
- `AI_PROVIDERS` is the ordered fallback chain for briefs and `/ask`
  (`claude,codex` by default). The default providers call cloud models through a
  **logged-in CLI** (no API key) — set `AI_PROVIDERS=ollama` for a fully-local,
  no-cloud setup (see §5).
- `VITE_USER_NAME` personalizes the dashboard greeting; `VITE_ALLOWED_HOSTS`
  lets the Vite dev server accept a reverse-proxy hostname (e.g. a Caddy
  domain). Both live in the **single root `.env`** alongside everything else —
  Vite's `envDir` resolves from the repo root.
- On your production box, set `NODE_ENV=production`.

> **Lowest-friction first real source:** an **Oura Personal Access Token** — no
> OAuth round-trip, no cloud project. Just remove `oura` from
> `GOOGLE_HEALTH_SOURCES`, set `OURA_PAT`, and sync (§4 → §6). The Google Health
> bridge below is the heaviest integration; treat it as advanced/optional, not
> your starting point.

## 4. Connect at least one data source

You only need one to get going. Connect more later. The native sources below are
the lowest friction; the Google Health bridge at the end is the heaviest and is
best treated as advanced/optional.

Remember the routing rule: WHOOP/Oura/Apple come from the bridge for any source
listed in `GOOGLE_HEALTH_SOURCES`, and from their **native** adapter only when
removed from that list (Strava is separate — see below).

### Connect Oura (native PAT) — start here

The least-effort real source: no OAuth, no cloud project, tokens don't expire.

1. Remove `oura` from `GOOGLE_HEALTH_SOURCES` (otherwise the PAT is ignored).
2. <https://cloud.ouraring.com> → **Personal Access Tokens** → create one.
3. Set `OURA_PAT=...` in `.env`. That's the whole setup.

### Connect Strava (native OAuth — workouts only)

Strava is an **activity source**: it pulls Apple-Watch / phone-tracked workouts
(runs, rides, etc.) into the `workouts` table. It is **not** a consensus device
and is **not** governed by `GOOGLE_HEALTH_SOURCES` — it is gated solely by its
per-integration toggle (`enabled`, on by default; see §3's Settings note) plus
its credentials.

1. <https://www.strava.com/settings/api> → create an **API Application**. Set
   the **Authorization Callback Domain** to `localhost`.
2. Put `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` into `.env`. The redirect URI
   defaults to `http://localhost:3001/api/auth/strava/callback`.
3. Start Vitals, then visit
   `http://localhost:3001/api/auth/strava/authorize` (or click **Connect Strava**
   on the dashboard). Approve; tokens persist to `data/.strava-tokens.json` and
   refresh automatically. (The headless SSH-tunnel trick below works here too.)

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

### Connect Google Health (the "bridge") — advanced/optional

This is the **heaviest** integration. One OAuth grant can cover Fitbit/Pixel,
Apple HealthKit, and residual WHOOP/Oura together, but standing it up means a GCP
project, an enabled API, a consent screen, and an exact redirect URI. Skip it
unless you specifically need Fitbit/Pixel or the consolidated bridge — a native
source (above) is a far easier first connection.

1. In Google Cloud Console, create a project and **enable the Google Health
   API**.
2. Create an OAuth **Web application** client. Configure the consent screen as
   **External / Testing** and **add your own Google account as a test user** —
   this is a personal, unverified app, so no security review is needed.
3. Add the redirect URI **exactly** as Vitals uses it:
   `http://localhost:3001/api/auth/google/callback`.
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` into `.env`.
5. Start Vitals (`npm run dev`, see §5) and visit
   `http://localhost:3001/api/auth/google/authorize` (or click **Connect** on the
   dashboard). Approve in the browser; Google redirects back, tokens are
   persisted to `data/.google-tokens.json`, and they auto-refresh thereafter.

**Headless box trap.** Google only allows `localhost` redirect URIs for
unverified apps, so the callback must land on `localhost` *as seen from your
browser*. On a Mac mini / NUC with no local browser, SSH-forward the API port
from your laptop and do the OAuth dance there:

```bash
ssh -L 3001:localhost:3001 you@your-host
# then on your laptop, open:
#   http://localhost:3001/api/auth/google/authorize
```

The browser hits `localhost:3001` on your laptop, the tunnel forwards it to the
box, the box exchanges the code and writes `data/.google-tokens.json`. Tear down
the tunnel once it's done.

## 5. Run it

### Development (everything, hot-reload)

```bash
npm run dev
```

Dev runs **three processes** concurrently — the API (`:3001`), the Vite
dashboard (`:5173`), and the MCP server. Open **http://localhost:5173**.
(Individual workspaces: `npm run dev:api`, `npm run dev:web`, `npm run dev:mcp`.)

### Production (build once, the API serves the dashboard)

```bash
npm run build          # builds all workspaces (incl. apps/web/dist)
NODE_ENV=production npm run start --workspace apps/api
```

Production collapses to a **single built API process**: the API serves the
prebuilt dashboard from `apps/web/dist`, so one process gives you both the API
and the UI on `:3001`. The schedulers run **in-process** in that same process
(unless `DISABLE_SCHEDULERS=1`) — no separate Vite or job processes.

### AI without the cloud (Ollama)

The default `AI_PROVIDERS=claude,codex` shells out to a **logged-in CLI**
(`claude -p` / `codex exec`) — local orchestration, but the model itself is in
the cloud, and the chain quietly skips any provider whose CLI isn't installed or
signed in. For a **fully-local, no-cloud** brief and Ask, run Ollama and point
the chain at it:

```bash
ollama serve
ollama pull llama3.1
# in .env:
#   AI_PROVIDERS=ollama
#   OLLAMA_URL=http://127.0.0.1:11434
#   OLLAMA_MODEL=llama3.1
```

With `ollama` (or `openai-compat`) as the only provider, **no inference traffic
leaves the box**. No Anthropic API key is needed for the brief or Ask in any
configuration — the `claude` provider uses your CLI session, not a key.

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

The repo ships a briefing **example** at `scripts/com.vcc.briefing.plist`, which
fires every 30 min in the morning and calls the idempotent
`scripts/brief-if-ready.sh` (syncs, then generates the brief via the Claude Code
CLI once today's data is present). These are macOS *examples, not drop-in
files*: the plist hardcodes a repo path and `brief-if-ready.sh` resolves the
repo from a `$VCC_REPO` placeholder. **Set `$VCC_REPO` (or edit the paths)
before loading them**, and treat the plist below as a template you fill in for
your own `<repo>` location.

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
