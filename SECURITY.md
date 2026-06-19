# Security

Vitals is self-hosted and privacy-first. This document describes the security
posture and how to report a vulnerability.

## Data & secrets

- **Your health data stays on your machine.** It's stored in a local **SQLite**
  database under `data/` (default `data/vitals.db`), which is **gitignored**. It
  is never uploaded anywhere by the app.
- **Secrets live in `.env`**, which is **gitignored**. Device OAuth tokens are
  stored in token files under `data/` (also gitignored). Never commit any of
  these.
- The only data that leaves the machine is what *you* send to an AI provider:
  the cloud CLIs (`claude`, `codex`) for the brief/Ask, or whatever you ask
  Claude via the MCP connectors. Running the brief/Ask with a **local model
  (Ollama or an OpenAI-compatible server) keeps inference fully on-box** — see
  [`docs/AI.md`](./docs/AI.md).

## Network exposure

- The **API and the local MCP server bind to loopback** and are meant to sit
  behind your own [Tailscale](https://tailscale.com) tailnet for private remote
  access.
- The **public MCP server** (`apps/mcp-server/src/http.ts`), used to reach your
  data from claude.ai, is the one component intentionally exposed to the
  internet — via **Tailscale Funnel**. It is hardened accordingly:
  - **OAuth 2.1 + PKCE**, with a human-approval **HTML login page** in front of
    `/authorize` (username/password from `MCP_AUTH_USER` / `MCP_AUTH_PASSWORD`).
    The server refuses to start if those aren't set.
  - **Read-only**: it opens the database read-only and removes the write tools
    (`save_briefing`, `log_habit_entry`) from the catalog.
  - **Rate-limited** (60 req / 15 min on the OAuth endpoints) and **per-IP
    lockout** (15 min after 5 failed logins), with constant-time password
    comparison.
  - **Binds `127.0.0.1` only** — the sole path in is the Funnel proxy.

  > ⚠️ **Tailscale Funnel exposes the MCP endpoint to the public internet.** Once
  > the Funnel is up, the **login password is the main thing protecting your
  > data**. Use a long, random `MCP_AUTH_PASSWORD`.

## AI sandboxing

When the brief/Ask use the cloud CLIs, they run with the input untrusted:

- **`claude`** runs as a pure text completion with **no tools at all** (empty
  allow-list plus an explicit deny of `Bash Read Write Edit WebFetch WebSearch
  Glob Grep Task`, at `default` permission mode). It cannot run commands, read
  files, or reach the network — so a crafted prompt can't exfiltrate `.env` or
  your tokens.
- **`codex`** runs as `codex exec -s read-only` — sandboxed and read-only.

## Hardening checklist

- Set a long, random `MCP_AUTH_PASSWORD` before enabling the Funnel.
- `chmod 600 .env` and any token files under `data/` (e.g.
  `.google-tokens.json`, `.whoop-tokens.json`, `.mcp-oauth.json`).
- Only run the public HTTP MCP server when you actually need claude.ai access;
  the local Claude Desktop (stdio) path needs no internet exposure at all.
- Keep dependencies updated.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for an
exploitable vulnerability.

- Preferred: open a private **GitHub Security Advisory** at
  `https://github.com/USER/vitals-command-center/security/advisories/new`.
- Or contact the maintainer (**8tp**) through the contact listed on the GitHub
  profile.

Include steps to reproduce and the impact. We'll acknowledge and work with you
on a fix and coordinated disclosure.
