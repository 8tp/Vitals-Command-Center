# Architecture

Vitals is a self-hosted, single-user, privacy-first health command center. This
document describes the system design: the monorepo layout, how data flows from
wearables to dashboard, the multi-source consensus model, the AI provider chain,
the MCP server, and the deployment topology.

---

## 1. The monorepo

Vitals is a TypeScript monorepo managed with **npm workspaces** (`workspaces:
["apps/*", "packages/*"]`). There are three apps and two shared packages:

```
vitals-command-center/
├── apps/
│   ├── api/          @vcc/api         Fastify REST API + jobs + serves the dashboard
│   ├── web/          @vcc/web         React + Vite PWA dashboard
│   └── mcp-server/   @vcc/mcp-server  MCP server (stdio + Streamable HTTP)
├── packages/
│   ├── db/           @vcc/db          SQLite connection, migrations, queries
│   └── shared/       @vcc/shared      Types, device defs, Zod schemas, confidence
└── data/             SQLite DB, token files, briefings (git-ignored, local only)
```

### Responsibilities

| Workspace | What it owns |
|---|---|
| **`apps/api`** | The Fastify REST API (`/api/*`), the sync/normalizer pipeline, the AI brief + Ask services, the cron schedulers, the Apple ingest endpoint, and the OAuth callbacks for WHOOP/Google. In production it also serves the built dashboard as static files (SPA fallback). |
| **`apps/web`** | The React 18 + Vite progressive web app. Light/dark themes, installable PWA, charts via Recharts. In dev it runs on Vite; in prod it is built and served by the API. |
| **`apps/mcp-server`** | The Model Context Protocol server. Two entrypoints: `index.ts` (stdio, for Claude Desktop, full read/write) and `http.ts` (Streamable HTTP + OAuth, for claude.ai, read-only). |
| **`packages/db`** | The `better-sqlite3` connection (WAL mode), the SQL migration runner, and all typed query modules. The single source of truth for the schema. |
| **`packages/shared`** | Cross-cutting code with no runtime deps beyond Zod: device definitions (`DEVICE_SOURCES`, accuracy rankings, weights), the confidence model, Zod request schemas, and API/domain types. |

Both `apps/api` and `apps/mcp-server` depend on `@vcc/db` and `@vcc/shared`. The
web app depends only on `@vcc/shared` (for types). The shared packages export
their TypeScript source directly (no build step required for consumers in dev),
which keeps the schema and the servers in lockstep.

---

## 2. Data flow

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │  SOURCES                                                             │
  │   Google Health API "bridge"   ──┐  (Fitbit/Pixel + Apple HealthKit │
  │     (OAuth)                       │   + residual WHOOP/Oura)         │
  │   WHOOP native (OAuth)          ──┤                                  │
  │   Oura native (PAT)             ──┤  routed by GOOGLE_HEALTH_SOURCES │
  │   Apple Health (REST ingest)    ──┘                                  │
  └─────────────────┬───────────────────────────────────────────────────┘
                    │  sync job (cron 4h)  /  POST /api/ingest/apple
                    ▼
            ┌───────────────┐
            │  normalizer   │   per-source rows → per-device columns,
            │  + confidence │   weighted consensus, confidence level
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │    SQLite     │   daily_summary, sleep_sessions, workouts,
            │  (@vcc/db)    │   habits, briefings, sync_log  (local file)
            └───┬───────┬───┘
                │       │
      ┌─────────┘       └──────────┬─────────────────┐
      ▼                            ▼                 ▼
 ┌──────────┐              ┌──────────────┐   ┌──────────────┐
 │ REST API │              │  MCP server  │   │  AI brief +  │
 │ (Fastify)│              │ (stdio/HTTP) │   │  Ask service │
 └────┬─────┘              └──────┬───────┘   └──────┬───────┘
      ▼                           ▼                  │
 ┌──────────┐            claude.ai / Claude          │ provider chain
 │  PWA     │            Desktop                      ▼
 │dashboard │                                  claude / codex /
 └──────────┘                                  ollama / openai-compat
```

1. **Pull.** A scheduled sync job (default every 4 hours, `SYNC_CRON`) pulls from
   each configured source. Apple Health is *pushed* instead, via the
   `POST /api/ingest/apple` REST endpoint that the iOS Health Auto Export app calls.
2. **Normalize.** The normalizer maps each source's payload onto the shared
   `daily_summary` schema, writing **per-device columns** (e.g. `whoop_hrv`,
   `oura_hrv`, `apple_hrv`), and computing the consensus + confidence (§3).
   Sleep sessions and workouts are stored individually, **tagged with their source**.
3. **Store.** Everything lands in a local SQLite database (`DB_PATH`, WAL mode).
4. **Serve.** The REST API exposes the data to the dashboard; the MCP server
   exposes it to Claude; the AI brief/Ask service reads it to generate narratives.

---

## 3. Multi-source model: bridge vs. native, consensus + confidence

Vitals is **platform-agnostic** and built for **multi-device consensus**: when
two devices both measure your HRV, that agreement is signal.

### Bridge vs. native routing

Each physical device is owned by exactly one ingestion path, never both:

- The **Google Health API "bridge"** already aggregates several devices that sync
  into Google Health / Apple HealthKit (Fitbit/Pixel, Apple HealthKit, and any
  WHOOP/Oura data that lands in HealthKit).
- **Native adapters** talk directly to a vendor: WHOOP (OAuth), Oura (personal
  access token), Apple Health (REST ingest from Health Auto Export).

`GOOGLE_HEALTH_SOURCES` (comma list of `fitbit,apple,whoop,oura`) decides which
devices are taken **from the bridge**. Any device *not* listed is taken from its
**native adapter** instead. A device is therefore never populated by both paths —
**no double-counting**. New devices (Garmin and others) plug in through the same
adapter pattern, so the model is community-extensible.

### Consensus and confidence

The `daily_summary` table carries **per-device columns** for each metric plus:

- **Consensus columns** — `consensus_hrv`, `consensus_rhr`, `consensus_sleep_hours`.
  Devices are combined with **accuracy-ranked weights**: for each metric,
  `DEVICE_ACCURACY` (`packages/shared/src/devices.ts`) ranks sources most- to
  least-trusted, and `accuracyWeight()` turns rank into a weight (1.0 / 0.7 / 0.5
  / 0.3). The most accurate device for a metric dominates the blended value.
- **A confidence level** — `confidence_level` ∈ `HIGH | MEDIUM | LOW | NONE`,
  derived in `packages/shared/src/confidence.ts`:
  - `confidenceFromSources()` — ≥2 devices → `HIGH`, 1 device → `MEDIUM`, 0 → `NONE`.
  - `confidenceFromSpread()` — when present devices *disagree* beyond a per-metric
    tolerance (e.g. HRV within ~8 ms, RHR within 3 bpm), confidence is downgraded
    to `LOW`. Used by `GET /api/compare`.

`sleep_sessions` and `workouts` are stored per session, each tagged with its
`source`, so the dashboard can show "Oura says X, WHOOP says Y" side by side.

The same `confidence.ts` module also centralizes the **alert thresholds**
(`ALERT_THRESHOLDS`) used by briefings and the UI, so the AI narrative and the
dashboard reason from identical constants.

---

## 4. The AI layer (bring-your-own, local option)

The **daily brief** and the dashboard **"Ask"** box are produced by an on-box
agent runner that tries a configurable chain of providers, falling back on any
failure (CLI not installed/logged-in, HTTP refused, empty output). The chain is
set by `AI_PROVIDERS` (comma list, default `claude,codex`):

| Provider | Backend | Privacy |
|---|---|---|
| `claude` | `claude -p` (Claude Code CLI) | Cloud model, local orchestration |
| `codex` | `codex exec` CLI | Cloud model, local orchestration |
| `ollama` | local Ollama server (`OLLAMA_URL`) | **Fully on-box — nothing leaves the machine** |
| `openai-compat` | any OpenAI-compatible `/v1/chat/completions` server (LocalAI, LM Studio, vLLM) | **Fully on-box** when pointed at a local server |

Setting `AI_PROVIDERS=ollama` gives a **100% local, no-API-key** setup. A hybrid
like `AI_PROVIDERS=ollama,claude` tries local first and falls back to cloud.

**Security:** the `claude` provider for `/ask` is sandboxed to a pure text
completion with **no tools** — an empty allowlist plus an explicit deny of
Bash/Read/Write/WebFetch — so untrusted free-text questions can never make the
CLI run a tool and exfiltrate `.env` or token files. All providers share one
timeout (`AI_TIMEOUT_MS`, default 240s).

The optional Anthropic API key (`ANTHROPIC_API_KEY`) is used by a direct-API
code path; the default brief/Ask flow runs through the CLI/HTTP runner above and
works without it. `GET /api/config/status` reports which AI and source
integrations are configured (booleans only — never secrets).

---

## 5. The MCP server

`apps/mcp-server` exposes the health data over the **Model Context Protocol** so
you can query it conversationally from claude.ai or Claude Desktop. It has two
transports, sharing one `buildServer()` core:

- **stdio** (`index.ts`) — for Claude Desktop running locally on the same box.
  Full read/write: it can `save_briefing` and `log_habit_entry`.
- **Streamable HTTP** (`http.ts`) — for claude.ai (web). Opens the SQLite DB
  **read-only**, drops every write tool from the catalog, and is fronted by a
  minimal built-in **OAuth 2.1 server** (`@modelcontextprotocol/sdk` auth router
  + a file-backed provider).

The tool catalog (`tools/index.ts`) includes `get_full_context`,
`get_daily_summary`, `get_trends`, `get_sleep_details`, `get_workouts`,
`get_device_status`, `get_correlations`, `get_habit_streaks`, `get_briefing`,
plus the two write tools `save_briefing` and `log_habit_entry` (`WRITE_TOOLS`).
On the read-only HTTP surface, write tools are hidden from `ListTools` and
rejected if called. The server ships server-level `instructions` (an analyst
persona + device hierarchy + alert thresholds) that Claude surfaces as the
session system prompt.

The HTTP server hardens the public surface: a human-approval HTML login gate on
`/authorize`, per-IP brute-force lockout, a coarse rate limit on the
unauthenticated OAuth endpoints, loopback-only binding (`127.0.0.1`), and
request logs that record only method/path/status — never headers or bodies.

### Why a monorepo (and why the MCP server lives here)

**Decision: the MCP server is kept in this monorepo, not split into its own repo.**

The MCP server is *tightly coupled to the data model.* It reads the exact same
SQLite database through the same `@vcc/db` queries and the same `@vcc/shared`
device/confidence definitions that the API and sync pipeline use. It is not a
generic, standalone service — it is one face of the integrated self-hosted stack,
alongside the API, the dashboard, and the jobs.

Keeping it in one repo means:

- **Schema and server stay in lockstep.** A migration that changes
  `daily_summary` updates the queries the MCP tools call in the same commit and
  the same review. There is no version-skew window between a separately released
  server and the database it reads.
- **One install for self-hosters.** `git clone && npm install` wires up the API,
  the dashboard, and the MCP server together. A self-hoster does not juggle two
  repos, two release cadences, or a published-package dependency just to ask
  Claude about their own data.
- **Shared hardening and conventions.** Loopback binding, the read-only DB
  posture, and the env/config loading are consistent with the rest of the stack.

**If it is ever distributed standalone**, the clean extraction seam already
exists: the MCP server depends only on `@vcc/db` + `@vcc/shared`. Publishing
those two packages and shipping the MCP server as a package that consumes them is
the supported split. Until there is a concrete reason to pay that cost, a single
repo is simpler, safer, and easier to reason about — so it stays here.

---

## 6. Deployment topology

Vitals is designed to run on an always-on box (e.g. a Mac mini) under a process
supervisor. On macOS this is **launchd**; the same jobs map onto systemd or any
supervisor.

```
        ┌──────────────────────── always-on box (e.g. Mac mini) ────────────────────────┐
        │                                                                                 │
        │  launchd                                                                        │
        │   ├─ API + dashboard      apps/api  (Fastify, :3001)  ◀── Tailscale Serve ──┐   │
        │   ├─ MCP HTTP server      apps/mcp-server/http  (127.0.0.1:8787) ◀─ Funnel ─┼─┐ │
        │   ├─ sync job             cron  SYNC_CRON         (default every 4h)         │ │ │
        │   ├─ daily brief          cron  BRIEFING_CRON     (default 06:00 local)      │ │ │
        │   ├─ weekly report        cron  WEEKLY_REPORT_CRON(default Sun 08:00)        │ │ │
        │   └─ nightly DB backup    cron  (copy SQLite + WAL)                          │ │ │
        │                                                                              │ │ │
        │  SQLite DB (DB_PATH)  ◀─ all of the above read/write the same local file ────┘ │ │
        └────────────────────────────────────────────────────────────────────────────┼─┘
                                                                                       │
   tailnet-private dashboard ◀── Tailscale Serve ──── you, on your devices             │
   public MCP URL (claude.ai) ◀── Tailscale Funnel (HTTPS) ──── claude.ai ─────────────┘
```

- **Schedulers.** `apps/api/src/jobs/scheduler.ts` registers three `node-cron`
  jobs in-process: the 4-hour sync, the daily brief, and the weekly report. (They
  can also be driven by external launchd timers; set `DISABLE_SCHEDULERS=1` to
  turn off the in-process ones.)
- **Binding.** The API binds `API_HOST` (default `0.0.0.0` for local/tailnet
  reach). The public MCP HTTP server binds **`127.0.0.1` only** — it is reached
  exclusively through Tailscale Funnel, which proxies from loopback (`trust proxy
  = loopback`).
- **Remote access.** **Tailscale Serve** publishes the dashboard privately within
  your tailnet (only your own devices). **Tailscale Funnel** publishes the MCP
  server's HTTPS URL publicly, because claude.ai (a cloud service) must reach it;
  the OAuth gate + password page + rate limits guard that surface.
- **Backups.** A nightly job copies the SQLite database (with its WAL) to a backup
  location. Because all data is one local file, backup and restore are trivial.
- **Data residency.** The database, the OAuth/token files, and the generated
  briefings all live under the local `data/` directory. Nothing is stored in a
  vendor cloud; the only outbound traffic is to the device vendor APIs you connect
  and (if enabled) the cloud AI providers you choose.

---

## 7. Request envelope and conventions

Every REST response uses a consistent envelope:

```jsonc
{ "ok": true,  "data": { /* ... */ } }
{ "ok": false, "error": { "error": "message", "code": "CODE", "details": [] } }
```

Request validation uses Zod via `fastify-type-provider-zod`; validation failures
return `400` with code `VALIDATION`. Range queries accept presets (`7d`, `14d`,
`30d`, `90d`) or an explicit `YYYY-MM-DD..YYYY-MM-DD` window. See
[API.md](./API.md) for the full route reference.
