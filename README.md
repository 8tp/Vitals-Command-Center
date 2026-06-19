<div align="center">

# Vitals — Command Center

### All your wearables, one calm view.

A self-hosted, privacy-first personal health command center. Vitals unifies the
data from every wearable you own, computes a single daily **readiness** read,
writes you a daily **AI brief**, and gives you a calm dashboard that you fully
own — running on your own hardware, with your data in a local SQLite database
that never touches a vendor cloud.

<img src="site/assets/screenshot-desktop.png" alt="Vitals dashboard" width="820">

<sub>Open-source · MIT licensed · © 8tp</sub>

</div>

---

## Why Vitals

Every wearable wants to be your whole picture, and each one lives in its own
walled-garden app. Vitals takes the opposite stance: pull the numbers out of all
of them, reconcile them into one trustworthy daily read, and keep everything on a
box you control. No subscription, no data broker, no lock-in.

## Features

- **Unify your wearables** — pull Fitbit/Pixel, Oura, WHOOP, and Apple Health
  into one normalized timeline. Multiple devices measuring the same metric are
  reconciled into a weighted **consensus** with a per-metric **confidence** level.
- **Daily readiness** — one friendly read on how recovered you are today, from
  HRV, resting HR, sleep, and skin-temperature trend versus your baseline.
- **Daily AI brief + Ask** — a short, specific morning brief and a free-form
  "Ask" box, run through a configurable provider chain. Use a cloud model or go
  **100% local** with Ollama / any OpenAI-compatible server — no API key, nothing
  leaves the machine.
- **Calm PWA dashboard** — a React + Vite progressive web app with light and
  dark themes, installable on phone and desktop.
- **Query from Claude** — a built-in **MCP server** lets you ask your own health
  data questions from claude.ai or Claude Desktop (read-only on the public surface).
- **Fully self-hosted & private** — your data lives in a local SQLite file on your
  own always-on box. Remote access is your own private tailnet, not a SaaS.

## Supported sources

| Source | How it connects |
|---|---|
| **Fitbit / Pixel / Google Health** | Google Health API "bridge" (OAuth) — also aggregates other devices that sync to it |
| **Apple Health** | [Health Auto Export](https://www.healthexportapp.com/) iOS app → REST ingest (`POST /api/ingest/apple`) |
| **Oura** | Oura personal access token |
| **WHOOP** | WHOOP OAuth |
| **Garmin & others** | Community-extensible via the same adapter pattern |

A device is sourced **either** from the Google Health bridge **or** from its
native adapter — never both, so nothing is double-counted. Which devices the
bridge owns is set by `GOOGLE_HEALTH_SOURCES`. See **[docs/ADAPTERS.md](docs/ADAPTERS.md)**.

## Quick start

```bash
# 1. Clone
git clone https://github.com/USER/vitals-command-center.git
cd vitals-command-center

# 2. Configure
cp .env.example .env
# edit .env — set DB_PATH, pick your sources, choose your AI provider chain

# 3. Connect at least one source
#    - Fitbit/Google: set GOOGLE_CLIENT_ID/SECRET, then visit /api/auth/google/authorize
#    - WHOOP:         set WHOOP_CLIENT_ID/SECRET, then visit /api/auth/whoop/authorize
#    - Oura:          set OURA_PAT
#    - Apple Health:  set APPLE_INGEST_SECRET and point Health Auto Export at /api/ingest/apple

# 4. Install + run (API + dashboard + MCP server together)
npm install
npm run dev
```

By default the API serves on `http://localhost:3001`, the dashboard (Vite) on
`http://localhost:5173`, and the MCP HTTP server on `:8787`. Trigger a first data
pull with `npm run sync:manual` (or `POST /api/sync`).

> Requires Node.js ≥ 20.

## Architecture at a glance

```
  wearables ──▶ sync / normalizer ──▶ SQLite ──┬──▶ REST API ──▶ PWA dashboard
  (bridge +                         (consensus  ├──▶ MCP server ─▶ claude.ai / Desktop
   native adapters)                + confidence)└──▶ AI brief (provider chain)
```

Vitals is a TypeScript **npm-workspaces monorepo**:

| Workspace | Responsibility |
|---|---|
| `apps/api` | Fastify REST API, serves the built dashboard, runs the sync + brief jobs |
| `apps/web` | React + Vite PWA dashboard (light/dark) |
| `apps/mcp-server` | Model Context Protocol server (stdio + Streamable HTTP) |
| `packages/db` | SQLite connection, migrations, and queries |
| `packages/shared` | Shared types, device definitions, and Zod schemas |

Full design in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, consensus model, deployment topology |
| [docs/API.md](docs/API.md) | REST API reference (`/api/*` routes + response envelope) |
| [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) | Running Vitals on an always-on box, launchd jobs, backups, Tailscale |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every environment variable, explained |
| [docs/ADAPTERS.md](docs/ADAPTERS.md) | Bridge vs. native sources; writing a new device adapter |
| [docs/AI.md](docs/AI.md) | The AI provider chain (cloud + local) and how briefs are generated |
| [docs/MCP.md](docs/MCP.md) | Connecting Vitals to claude.ai / Claude Desktop |

## Privacy

- **Your data stays local.** All health data is stored in a SQLite database on
  your own machine (`DB_PATH`). Nothing is sent to a Vitals cloud — there isn't one.
- **You choose what (if anything) leaves the box.** Native sync talks only to the
  device vendor APIs you connect. The AI layer is opt-in per provider: set
  `AI_PROVIDERS=ollama` (or `openai-compat`) for fully on-box inference with
  **zero** cloud calls. Cloud AI providers (`claude`, `codex`) run a cloud model
  only when you enable them.
- **The remote AI surface is read-only.** When the MCP server is exposed for
  claude.ai, it opens the database read-only and drops every write tool.
- **Loopback by default.** The public MCP server binds `127.0.0.1` and is reached
  only through your own Tailscale Funnel, behind an auth gate.

## Self-hosting

Vitals is built to run on an always-on box (a Mac mini, a NUC, a home server)
under a process supervisor (e.g. `launchd`): scheduled syncs, a daily brief, the
API + dashboard, the MCP server, and nightly database backups. Remote access is
via **Tailscale Serve** (dashboard, tailnet-private) and **Tailscale Funnel**
(MCP, public for claude.ai). See **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

## Configuration

Everything is driven by environment variables — copy `.env.example` to `.env` and
fill in what you use. Highlights: `GOOGLE_HEALTH_SOURCES` (bridge vs. native
routing), `AI_PROVIDERS` (provider chain), `DB_PATH`, the per-source credentials,
and the sync/brief cron schedules. Full reference in
**[docs/CONFIGURATION.md](docs/CONFIGURATION.md)**.

## Contributing

Contributions are welcome — new device adapters especially. The cleanest place to
start is the adapter pattern in `apps/api/src/services/` plus the shared device
definitions in `packages/shared/src/devices.ts`. Please run `npm run typecheck`
and `npm run lint` before opening a PR. See [docs/ADAPTERS.md](docs/ADAPTERS.md)
for the adapter contract.

## License

MIT © 8tp. See [LICENSE](LICENSE).

<sub>Social preview: `site/assets/og-image.png`</sub>
