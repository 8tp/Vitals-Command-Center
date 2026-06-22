# AI: daily brief & Ask

Vitals has two AI features that read your health data and write back to you:

1. **The daily brief** — an automatic morning summary of your readiness, sleep,
   fueling, training, and action items.
2. **Ask** — the dashboard's free-text Q&A box (*"why is my HRV down this
   week?"*).

Both run through the **same on-box provider chain** and answer over your recent
data. Neither needs an Anthropic API key, and with a local model neither sends
anything off your machine.

> This is separate from the [MCP server](./MCP.md). MCP is for *interactive*
> questions from Claude Desktop / claude.ai. The brief and Ask are the
> stack's *own* built-in AI, run from the API service.

---

## How it works

Both features build a compact context packet from your SQLite data
(`buildBriefContext` in `apps/api/src/services/localBrief.ts`):

- today's row,
- a 14-day window of key metrics,
- **recent runs** — Strava activities sync into the local DB (since 2026-06)
  with split-level detail, so the packet carries your last runs with
  **per-mile interval paces**. The work efforts are reconstructed (walk
  recoveries removed), and the prompt explicitly tells the model *not* to read
  the distance auto-splits as a fade on interval workouts,
- and the previous brief for continuity.

That packet plus a system prompt is handed to a small **agent runner**
(`apps/api/src/services/agentCli.ts`), which tries a chain of providers and
returns the first one that succeeds.

- **Daily brief** — `generateLocalBrief()` (`localBrief.ts`), triggered on a cron
  (default 6:00 AM, `BRIEFING_CRON`) and on demand via `POST /api/insights/generate`.
  The result is stored as a `daily` briefing; the dashboard renders it via
  `GET /api/insights/today`.
- **Ask** — `answerQuestion()` (`localAsk.ts`), behind `POST /api/ask`. The
  answer streams back over SSE (the providers are non-streaming, so it arrives as
  one event).

---

## Dashboard AI summary & toggles

The daily brief also renders on the dashboard as an AI summary card. Two switches
control it, both stored **in the database** (`app_settings`, migration
`008_ai_settings.sql`) and toggled from the dashboard **Settings** — *not* from
`.env`:

| Setting | Default | Effect |
|---------|---------|--------|
| `aiEnabled` | on | **Master gate.** When off, the Ask tab and the dashboard brief card are hidden and all auto-generation stops. |
| `aiAutoSummary` | on | **Auto-generate the brief.** When on, the brief is generated when it's missing for today and refreshed after a new sync/run. Turn it off to keep AI on but only generate manually. |

A manual **Regenerate** button on the dashboard re-runs the brief on demand. It
works whenever `aiEnabled` is on, regardless of `aiAutoSummary`.

The cron job (`apps/api/src/jobs/local-brief.ts`) checks both flags and skips if
either is off; manual generation only checks `aiEnabled`.

---

## Providers

The runner supports four providers, set by the comma-separated **`AI_PROVIDERS`**
env var and tried in order — if one fails (not installed, not logged in,
connection refused, empty output), it falls through to the next:

| Provider | Backend | Inference location | Needs a key? |
|----------|---------|--------------------|--------------|
| `claude` | `claude -p` (Claude Code CLI) | Cloud (local orchestration) | Uses your Claude login |
| `codex` | `codex exec -s read-only` (Codex CLI) | Cloud (local orchestration) | Uses your Codex login |
| `ollama` | [Ollama](https://ollama.com) HTTP API | **Fully on-box** | No |
| `openai-compat` | Any OpenAI-compatible server (LocalAI, LM Studio, vLLM, …) | On-box / your LAN | Optional |

**Default:** `AI_PROVIDERS=claude,codex`.

**No Anthropic API key is required for the brief or Ask.** The `claude` provider
shells out to the Claude Code CLI and uses your **logged-in CLI subscription**,
not an API key. For a **fully-local** setup where nothing leaves the box, set
`AI_PROVIDERS=ollama` and `ollama pull` a model (see below).

You can override the provider per feature without changing the chain:

- `BRIEF_CLI` — provider to try first for the daily brief.
- `ASK_CLI` — provider to try first for Ask.

Other knobs:

- `AI_TIMEOUT_MS` — shared per-provider timeout (default 240000).
- `BRIEF_MODEL` — model override for the brief.
- `AI_CLI_PATH` — PATH prefix used when spawning the CLI providers (handy under
  `launchd`, which has a minimal environment).

---

## Run it fully local with Ollama

For a setup where **nothing leaves your machine**:

```bash
# 1. Install Ollama (https://ollama.com), then start the server:
ollama serve

# 2. Pull a model:
ollama pull llama3.1
```

```bash
# 3. In .env:
AI_PROVIDERS=ollama
OLLAMA_URL=http://127.0.0.1:11434   # default
OLLAMA_MODEL=llama3.1               # default
```

The runner POSTs to `${OLLAMA_URL}/api/chat`. You can also run a **hybrid**
chain — e.g. `AI_PROVIDERS=ollama,claude` tries the local model first and falls
back to the cloud only if Ollama is down.

### LocalAI / LM Studio / vLLM (OpenAI-compatible)

Any server exposing `POST /v1/chat/completions` works:

```bash
AI_PROVIDERS=openai-compat
OPENAI_COMPAT_URL=http://127.0.0.1:1234   # your server's base URL
OPENAI_COMPAT_MODEL=your-model-name
OPENAI_COMPAT_KEY=                          # optional — most local servers need none
```

`openai-compat` is only attempted when `OPENAI_COMPAT_URL` is set. The
`Authorization` header is sent only if `OPENAI_COMPAT_KEY` is non-empty.

### Cloud via the CLIs

If you'd rather use your existing Claude or Codex subscription, keep the default
`AI_PROVIDERS=claude,codex`. These require the respective CLI installed and
logged in on the machine (`claude` → `/login`). Orchestration stays local; only
the model call is remote.

---

## Safety model

The CLI providers run untrusted-ish input (Ask feeds your free text to a CLI), so
they are locked down:

- **`claude`** runs with **no tools at all**: an empty `--allowed-tools` plus an
  explicit `--disallowed-tools` deny of `Bash Read Write Edit WebFetch WebSearch
  Glob Grep Task`, at the `default` permission mode (never `bypassPermissions`).
  It's a pure text completion and cannot touch your filesystem, run commands, or
  reach the network — so a crafted prompt can't make it read `.env` or your
  tokens.
- **`codex`** runs as `codex exec -s read-only` — sandboxed, read-only.
- The local providers (`ollama`, `openai-compat`) are plain chat completions with
  no tool access.

See [`../SECURITY.md`](../SECURITY.md) for the full posture.

---

## The daily brief prompt

The brief is GitHub-flavored markdown with this fixed structure:

- **Readiness** — a state word (PRIMED / STEADY / STRAINED) + the why, citing
  HRV/RHR/sleep numbers.
- **Sleep** — last night vs trend, plus one concrete fix if needed.
- **Food** — fueling guidance for the day (references logged calories only if
  present; no nagging to log).
- **Training** — today's session given recovery + step trend.
- **Actions** — up to ~4 ranked, specific recommendations (dose/time/duration).

There is no recovery/readiness *score* in the data — the model infers readiness
itself from HRV vs its 7-day baseline, RHR vs baseline, and last night's sleep,
using the alert thresholds baked into the prompt.

### Customizing

- **Schedule:** `BRIEFING_CRON` (default `0 6 * * *`), `WEEKLY_REPORT_CRON`
  (default `0 8 * * 0`) in `.env`.
- **Prompt / sections:** edit `SYSTEM` in `localBrief.ts` (brief) or `ASK_SYSTEM`
  in `localAsk.ts` (Ask).
- **Provider & model:** `AI_PROVIDERS`, `BRIEF_CLI`/`ASK_CLI`, `BRIEF_MODEL`,
  `OLLAMA_MODEL`, `OPENAI_COMPAT_MODEL`.
