# Quickstart

Zero to a fully populated dashboard in about 5 minutes — **no accounts, no
OAuth, no API keys**. We seed 90 days of realistic demo data first so the UI
looks alive immediately, then layer on a real source and the AI brief once
you've seen it working.

---

## 0. Prereqs

You need two things on the box:

- **Node.js ≥ 20**
- **A C toolchain** — `better-sqlite3` compiles a native module on install. This
  is the single most common silent install failure, so set it up first:
  - **macOS:** `xcode-select --install`
  - **Debian / Ubuntu:** `sudo apt install build-essential python3`

---

## 1. Seed-first: a live demo dashboard (≈5 min)

```bash
# Clone + configure (the defaults in .env are enough for the demo)
git clone https://github.com/8tp/Vitals-Command-Center.git
cd vitals-command-center
cp .env.example .env

# Install dependencies (compiles better-sqlite3 — needs the toolchain above)
npm install

# Seed 90 days of realistic, deterministic multi-device demo data
npm run db:seed

# Run the API + dashboard + MCP server together
npm run dev
```

Open **http://localhost:5173**. You should see a fully populated dashboard —
readiness, vitals, sleep, trends, and demo workouts — with no accounts connected.

> The demo data is generated locally into your SQLite file (`DB_PATH`, default
> `./data/vitals.db`). Want a different window? `tsx scripts/seed_demo_data.ts 60`
> seeds 60 days instead of the default 90.

The API runs on `http://localhost:3001`, the dashboard on
`http://localhost:5173`, and the MCP HTTP server on `:8787`.

---

## 2. Connect your first real source — Oura (≈5 min, no OAuth)

Oura is the easiest real source because it uses a **Personal Access Token** —
no OAuth app, no redirect URIs, no callback dance.

1. Go to <https://cloud.ouraring.com/personal-access-tokens> and create a token.
2. Put it in `.env`:

   ```bash
   OURA_PAT=your_token_here
   ```

3. **IMPORTANT:** make sure Oura is read from its native adapter, not the Google
   Health bridge. Remove `oura` from `GOOGLE_HEALTH_SOURCES` (or set it empty):

   ```bash
   # before
   GOOGLE_HEALTH_SOURCES=fitbit,apple,whoop,oura
   # after — oura now comes from OURA_PAT
   GOOGLE_HEALTH_SOURCES=fitbit,apple,whoop
   ```

4. Pull your data:

   ```bash
   npm run sync:manual
   ```

Refresh the dashboard — your real Oura vitals and sleep now flow into the
consensus read.

> **Want runs too?** Strava is the activity source for Apple Watch / phone runs.
> Create an API app at <https://www.strava.com/settings/api> (set the callback
> domain to `localhost`), put `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` in
> `.env`, then visit `http://localhost:3001/api/auth/strava/authorize` and
> approve. Runs sync into the timeline; click any run for splits, laps,
> segments, and reconstructed run/walk intervals.

---

## 3. Turn on the AI brief

The brief renders right on the dashboard. It analyzes your recovery, trends, and
recent runs (down to per-mile interval paces). Pick a provider:

### Option A — fully local with Ollama (no cloud, no key)

```bash
# Install Ollama from https://ollama.com, then:
ollama pull llama3.1
```

In `.env`:

```bash
AI_PROVIDERS=ollama
```

Nothing leaves the machine — all inference runs on-box.

### Option B — the default cloud CLI

The default chain is `AI_PROVIDERS=claude,codex`, which shells out to the
`claude` / `codex` CLIs (cloud model, local orchestration). If you have one
installed and logged in, you're already set.

### Generate one

Either hit the **Regenerate** button on the dashboard's insights panel, or call
the API directly:

```bash
curl -X POST localhost:3001/api/insights/generate \
  -H 'content-type: application/json' \
  -d '{}'
```

Two dashboard toggles control the AI surface (Settings → AI):

- **`aiEnabled`** — master switch. Off hides the Ask tab and the brief card.
- **`aiAutoSummary`** — auto-generate the brief (vs. only on demand via
  Regenerate).

---

## Next steps

- **[SELF_HOSTING.md](SELF_HOSTING.md)** — run Vitals durably on an always-on box
  (launchd jobs, scheduled syncs, backups, and remote access over Tailscale).
- **[CONFIGURATION.md](CONFIGURATION.md)** — every source and environment
  variable, explained.
