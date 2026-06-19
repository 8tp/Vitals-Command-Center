# Configuration

Vitals is configured entirely through a single `.env` file at the repo root.
Copy the template and fill in what you need:

```bash
cp .env.example .env
```

`.env` is gitignored (along with everything under `data/`), so your secrets and
tokens never leave the box. **All health data stays local** — the only traffic
that leaves the machine is whatever AI provider you choose to call (and nothing
at all if you run a fully local provider like Ollama).

This page documents every variable that the code reads. The authoritative source
is always [`.env.example`](../.env.example); this table explains what each one
does, its default, and whether it is required or secret.

Conventions in the tables below:

- **Required** — the feature it belongs to won't work without it. Vitals as a
  whole only requires you to configure *at least one* data source plus *one* AI
  provider; everything else is optional.
- **Secret** — treat as a credential. Never commit it; never paste it into logs.
- **Default** — the value the code falls back to when the variable is unset.
  A few variables have a code default but are **not present in `.env.example`**
  (noted as "code-only"); set them explicitly only if you need to override.

---

## Runtime

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `NODE_ENV` | `development` | No | No | Standard Node environment. Set to `production` on your always-on box — this switches off the pretty-printed logger and is what gates production behavior. |
| `API_PORT` | `3001` | No | No | Port the Fastify API (which also serves the built dashboard) listens on. |
| `WEB_PORT` | `5173` | No | No | Port the Vite dev server uses in `npm run dev`. Not used in production (the API serves the dashboard). |
| `LOG_LEVEL` | `info` | No | No | Pino log level (`trace`/`debug`/`info`/`warn`/`error`). |
| `API_HOST` | `0.0.0.0` | No | No | **Code-only** (not in `.env.example`). Interface the API binds to. For a Tailscale-fronted box, set `API_HOST=127.0.0.1` so only Tailscale Serve can reach it. See [SELF_HOSTING](./SELF_HOSTING.md#remote-access-with-tailscale). |
| `DISABLE_SCHEDULERS` | unset | No | No | **Code-only.** Set to `1` to stop the in-process cron schedulers (sync/brief/weekly) from starting — useful if you run those jobs from launchd/systemd instead. |

## Storage paths

Paths may be absolute or repo-relative. Repo-relative paths resolve against the
repo root (not the workspace cwd), so they work no matter which workspace script
launched the process.

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `DB_PATH` | `./data/vitals.db` | No | No | SQLite database file. Created on first run; migrations apply automatically on boot. |
| `BRIEFINGS_DIR` | `./data/briefings` | No | No | Where briefing artifacts and job logs are written. |
| `APPLE_HEALTH_EXPORT_PATH` | `./data/apple-health-export/export.xml` | No | No | Path to a full Apple Health XML export (legacy/fallback Apple path). Only used by the scheduled sync when `apple` is **not** owned by the Google Health bridge. The preferred Apple path is the REST ingest — see `APPLE_INGEST_SECRET`. |

## Google Health API ("bridge") + multi-wearable routing

The Google Health API client doubles as the **bridge**: a single OAuth
connection that can return data for several physical devices at once (Fitbit /
Pixel, Apple HealthKit, and residual WHOOP/Oura data written through HealthKit).
`GOOGLE_HEALTH_SOURCES` decides which devices come *from the bridge*; any device
not listed there is pulled from its **native** client instead. A device is never
populated by both paths. See [ADAPTERS](./ADAPTERS.md) for the full model.

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `GOOGLE_HEALTH_SOURCES` | `fitbit,apple,whoop,oura` | No | No | Comma list of devices the bridge owns. Valid values: `fitbit`, `apple`, `whoop`, `oura`. Anything omitted falls to its native adapter. Unset = all four via the bridge. |
| `GOOGLE_CLIENT_ID` | — | For bridge/Fitbit | No | Google Cloud OAuth Web client ID. Enable the **Google Health API** and create an OAuth Web application client. |
| `GOOGLE_CLIENT_SECRET` | — | For bridge/Fitbit | Yes | OAuth client secret for the same client. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3001/api/auth/google/callback` | No | No | Must match the redirect URI registered in Google Cloud Console **exactly**. Google only allows `localhost` for unverified apps — for headless boxes use the SSH-tunnel trick in [SELF_HOSTING](./SELF_HOSTING.md#connect-google-health-the-bridge). |
| `GOOGLE_POST_AUTH_REDIRECT` | `http://localhost:5173/?connected=fitbit` | No | No | Where the user lands after a successful OAuth round-trip. |
| `GOOGLE_TOKEN_FILE` | `./data/.google-tokens.json` | No | Yes | Where the access/refresh tokens are persisted. Auto-refreshes; re-auth needed only if Google revokes the refresh token. |

## WHOOP (native adapter)

Used as the WHOOP source whenever `whoop` is **not** in `GOOGLE_HEALTH_SOURCES`.
Create an OAuth app at <https://developer.whoop.com>.

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `WHOOP_CLIENT_ID` | — | For native WHOOP | No | WHOOP OAuth app client ID. |
| `WHOOP_CLIENT_SECRET` | — | For native WHOOP | Yes | WHOOP OAuth app client secret. |
| `WHOOP_REDIRECT_URI` | `http://localhost:3001/api/auth/whoop/callback` | No | No | Must match the redirect URI registered in your WHOOP app exactly. |
| `WHOOP_POST_AUTH_REDIRECT` | `http://localhost:5173/?connected=whoop` | No | No | Where to land the user after successful OAuth. |
| `WHOOP_TOKEN_FILE` | `./data/.whoop-tokens.json` | No | Yes | Token storage file; the refresh token auto-rotates. |

The OAuth scopes requested are fixed in code:
`read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline`.

## Oura (native adapter)

Used as the Oura source whenever `oura` is **not** in `GOOGLE_HEALTH_SOURCES`.
Oura uses a Personal Access Token, so there's no OAuth round-trip.

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `OURA_PAT` | — | For native Oura | Yes | Personal Access Token from <https://cloud.ouraring.com> → Personal Access Tokens. PATs don't expire; re-issue only on rotation. |

## Apple Health REST ingest

Used as the Apple source whenever `apple` is **not** in `GOOGLE_HEALTH_SOURCES`.
The iOS "Health Auto Export" app POSTs JSON to `POST /api/ingest/apple`.

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `APPLE_INGEST_SECRET` | — | For Apple REST ingest | Yes | Shared secret for the ingest route. The app must send it as header `x-apple-ingest-secret: <value>` **or** `Authorization: Bearer <value>`. **The route fails closed:** if this is unset, every ingest request is rejected with 401. |

## AI providers

The on-box AI runner (used by the daily brief and `/ask`) tries providers in
order and falls back on any failure (CLI not installed/logged-in, HTTP refused,
empty output).

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `AI_PROVIDERS` | `claude,codex` | No | No | Comma-ordered provider chain. Values: `claude` (`claude -p` CLI), `codex` (`codex exec` CLI), `ollama` (local Ollama server), `openai-compat` (LocalAI / LM Studio / vLLM). For a no-cloud setup use e.g. `AI_PROVIDERS=ollama`; for a hybrid, `AI_PROVIDERS=ollama,claude`. |
| `AI_TIMEOUT_MS` | `240000` | No | No | Shared timeout (ms) for every provider, CLI or HTTP. Commented out in `.env.example`. |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | For `ollama` | No | Base URL of your Ollama server (`ollama serve`). |
| `OLLAMA_MODEL` | `llama3.1` | For `ollama` | No | Model to use; `ollama pull <model>` first. |
| `OPENAI_COMPAT_URL` | — | For `openai-compat` | No | Base URL of an OpenAI-compatible server. `openai-compat` is only attempted when this is set. POSTs to `${OPENAI_COMPAT_URL}/v1/chat/completions`. |
| `OPENAI_COMPAT_MODEL` | — | For `openai-compat` | No | Model name to send to that server. |
| `OPENAI_COMPAT_KEY` | — | No | Yes | Optional bearer key. Most local servers need none — leave blank to omit the `Authorization` header entirely. |
| `ANTHROPIC_API_KEY` | — | No | Yes | Anthropic API key from <https://console.anthropic.com>. Only needed if a code path uses the Anthropic SDK directly. The `claude` provider above uses the `claude` **CLI** (your Claude subscription), not this key. |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | No | No | Model id used when the Anthropic SDK path is invoked. |
| `BRIEF_CLI` | unset | No | No | **Code-only.** Force a specific CLI (`claude` or `codex`) for brief generation, bypassing the chain. |

> **Local-only privacy note:** `ollama` and `openai-compat` keep *all* inference
> on-box — nothing leaves the machine. The CLI providers (`claude`, `codex`) run
> orchestration locally but call a cloud model.

## MCP server (remote, for claude.ai)

The MCP server exposes your data to the claude.ai web app over an HTTP transport
guarded by an OAuth gate. It binds loopback and is meant to be fronted by
Tailscale Funnel. **It refuses to start unless `MCP_AUTH_USER` and
`MCP_AUTH_PASSWORD` are both set.**

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `MCP_HTTP_PORT` | `8787` | No | No | Port the MCP HTTP server binds (on `127.0.0.1`). |
| `MCP_PUBLIC_URL` | `http://localhost:<MCP_HTTP_PORT>` | For remote MCP | No | The public HTTPS URL once exposed via Tailscale Funnel, e.g. `https://<host>.<tailnet>.ts.net`. Used to build OAuth metadata URLs. |
| `MCP_AUTH_USER` | — | For MCP | No | Username for the OAuth password gate. Server won't start without it. |
| `MCP_AUTH_PASSWORD` | — | For MCP | Yes | Password for the OAuth gate. Server won't start without it. |
| `MCP_OAUTH_FILE` | `./data/.mcp-oauth.json` | No | Yes | Where registered OAuth clients are persisted. |

## Scheduler

Standard cron expressions, validated by `node-cron`. These drive the in-process
schedulers (disabled with `DISABLE_SCHEDULERS=1` if you prefer launchd/systemd).

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `SYNC_CRON` | `0 */4 * * *` | No | No | Data sync cadence (every 4 hours on the hour). |
| `BRIEFING_CRON` | `0 6 * * *` | No | No | Daily briefing generation (06:00 local). |
| `WEEKLY_REPORT_CRON` | `0 8 * * 0` | No | No | Weekly report (Sunday 08:00 local). |

## CORS

| Variable | Default | Required | Secret | Description |
|---|---|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3001` | No | No | **Code-only** (not in `.env.example`). Comma-separated allowlist of origins. Arbitrary origins are never reflected. Add your Tailscale Serve dashboard origin here if the browser calls the API cross-origin. |
