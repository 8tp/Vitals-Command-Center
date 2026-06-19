# MCP server

Vitals ships an [MCP](https://modelcontextprotocol.io) server (`apps/mcp-server`)
that exposes your local health data to Claude as a set of tools. Instead of
copy-pasting numbers into a chat, you connect Claude once and then just ask —
*"give me today's vitals briefing"*, *"how's my HRV trending?"*, *"how did I
sleep last night?"* — and Claude calls the tools, reads your SQLite data, and
answers.

Everything runs on your own machine. The data never leaves it except as part of
the answer Claude composes for you.

There are **two transports**, and you pick based on where you want to ask from:

| Transport | File | Use it from | Access |
|-----------|------|-------------|--------|
| **stdio** | `src/index.ts` | **Claude Desktop** (same machine) | full read **+ write** |
| **Streamable HTTP** | `src/http.ts` | **claude.ai** (web, remote) | **read-only**, OAuth-gated |

Both transports serve the *same* tool catalog from the same code
(`src/server.ts`); the HTTP server simply drops the write tools and opens the
database read-only.

---

## stdio (local — Claude Desktop)

The local server talks to Claude Desktop over stdio. It opens the database
read-write, so it has the **full** tool set including `save_briefing` and
`log_habit_entry`.

### Claude Desktop config

Open (or create) your Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add a `vitals-command-center` entry. The simplest form runs the TypeScript
source directly via the repo's bundled `tsx`:

```jsonc
{
  "mcpServers": {
    "vitals-command-center": {
      "command": "/path/to/vitals-command-center/node_modules/.bin/tsx",
      "args": ["/path/to/vitals-command-center/apps/mcp-server/src/index.ts"],
      "env": {
        "DB_PATH": "/path/to/vitals-command-center/data/vitals.db"
      }
    }
  }
}
```

> Replace `/path/to/vitals-command-center` with the absolute path to your clone.

For faster cold starts, build the server once and point Claude Desktop at the
compiled output:

```bash
npm run build --workspace apps/mcp-server
```

```jsonc
{
  "mcpServers": {
    "vitals-command-center": {
      "command": "node",
      "args": ["/path/to/vitals-command-center/apps/mcp-server/dist/index.js"],
      "env": {
        "DB_PATH": "/path/to/vitals-command-center/data/vitals.db"
      }
    }
  }
}
```

Save, then **quit and relaunch Claude Desktop**. In a new chat, ask *"give me
today's vitals briefing"*. The server ships its own instructions (analyst
persona, device hierarchy, alert thresholds, briefing flow), so Claude knows to
call `get_full_context`, compose the briefing, and call `save_briefing` — which
the web dashboard then displays.

---

## Streamable HTTP (remote — claude.ai)

The HTTP server lets you reach your data from **claude.ai** on any device, as a
custom connector. It is built to be safe to expose to the internet:

- The database is opened **read-only** — the public server can never write.
- The two write tools (`save_briefing`, `log_habit_entry`) are **removed from
  the catalog** and rejected if called anyway.
- Access is gated by **OAuth 2.1** with a human-approval **HTML login page**
  (username + password from `.env`).
- The OAuth endpoints are **rate-limited**, the login page **locks out an IP**
  for 15 minutes after 5 failed attempts, and the listener binds to
  **loopback only** — it is reached from the internet solely through a
  **Tailscale Funnel** proxy.

### 1. Configure `.env`

```bash
MCP_HTTP_PORT=8787
# Public HTTPS URL once exposed via Tailscale Funnel:
MCP_PUBLIC_URL=https://your-host.your-tailnet.ts.net
MCP_AUTH_USER=your-username
MCP_AUTH_PASSWORD=a-long-random-password
MCP_OAUTH_FILE=./data/.mcp-oauth.json
```

The server **refuses to start** unless both `MCP_AUTH_USER` and
`MCP_AUTH_PASSWORD` are set. `MCP_PUBLIC_URL` must be the exact HTTPS URL clients
will hit, because the OAuth metadata is derived from it.

### 2. Run the HTTP server

```bash
npm run build --workspace apps/mcp-server
node apps/mcp-server/dist/http.js
# or in dev: npx tsx apps/mcp-server/src/http.ts
```

It listens on `127.0.0.1:8787` (or your `MCP_HTTP_PORT`). It is *not* reachable
from your LAN — only loopback.

### 3. Expose it via Tailscale Funnel

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) publishes a single
loopback port to the public internet over your tailnet's HTTPS hostname:

```bash
tailscale funnel 8787
```

That gives you `https://your-host.your-tailnet.ts.net` — set that (plus nothing
after it) as `MCP_PUBLIC_URL`. The MCP endpoint itself is `${MCP_PUBLIC_URL}/mcp`.

### 4. Add the connector in claude.ai

1. In claude.ai, go to **Settings → Connectors → Add custom connector**.
2. For the server URL, enter **`https://your-host.your-tailnet.ts.net/mcp`**.
3. claude.ai discovers the OAuth metadata, dynamically registers itself, and
   opens an **authorization popup** in your browser.
4. The popup shows the **Vitals MCP login page**. Enter your `MCP_AUTH_USER` /
   `MCP_AUTH_PASSWORD`. On success the connector finishes linking.
5. Start a chat and ask about your health data. The remote connector is
   read-only, so it can read summaries, trends, sleep, workouts, and briefings,
   but it cannot log habits or save briefings — do those from Claude Desktop.

> **Why a custom HTML login instead of plain Basic auth?** Browser Basic-auth
> prompts don't reliably appear inside the OAuth popup, so the server renders a
> real password page, sets a short-lived approval cookie, and then lets the
> OAuth flow issue the (PKCE-bound, single-use) code.

---

## Tools

All tools are available on the **local stdio** server. The **remote HTTP**
server exposes everything *except* the two write tools (marked **write**).

| Tool | Args | What it returns |
|------|------|-----------------|
| `get_full_context` | `{ date? }` | One-shot briefing packet: today's full summary + 14-day compact window + 7-day workouts + previous briefing + a `briefingTemplate` string. Call this first for any briefing/status request. |
| `save_briefing` **(write)** | `{ content, date?, type? }` | Persists a briefing you just composed so the web dashboard shows it. `type` ∈ `daily`/`weekly`/`query_response`. |
| `get_daily_summary` | `{ date? }` | Metrics for one day: HRV, RHR, SpO2, sleep stages, skin-temp deviation, steps, device availability. |
| `get_trends` | `{ metric, days? }` | A metric's series with a 7-day moving average. `metric` ∈ `hrv`, `rhr`, `sleep_hours`, `deep_hours`, `rem_hours`, `steps`, `spo2`, `temp_deviation`, `respiratory_rate`, `calories_burned`, `calories_in`. |
| `get_sleep_details` | `{ date? }` | Detailed sleep breakdown: stages, scores, per-device comparison. |
| `get_workouts` | `{ days?, sport? }` | Recent workouts with HR zones, duration, and type. |
| `get_device_status` | `{}` | Which devices have data today and their last sync time. |
| `get_correlations` | `{ metric?, min_days? }` | Correlations between habits/behaviors and health metrics, ranked by \|r\|. |
| `get_habit_streaks` | `{}` | Current and longest streaks for all tracked habits. |
| `log_habit_entry` **(write)** | `{ habit_name, value, date? }` | Logs a habit check-in value. |
| `get_briefing` | `{ date? }` | Retrieves a previously-stored briefing's markdown for a date. |

> **Note:** workout/run detail (VO₂max, splits) is not in this server — those
> live in your Strava connector. The server instructions tell Claude to
> correlate recovery data here against training in Strava.

---

## Security notes

- **Local (stdio):** runs as your user, on your machine, over a pipe — no
  network exposure at all.
- **Remote (HTTP):** designed for public exposure but layered:
  - OAuth 2.1 with PKCE; tokens persist to `MCP_OAUTH_FILE` (gitignored under
    `data/`). Registered clients are capped (25) and abandoned ones evicted.
  - HTML password gate on `/authorize`; constant-time credential comparison;
    per-IP lockout after 5 failures.
  - Rate limit (60 requests / 15 min) on `/register`, `/authorize`, `/token`.
  - Read-only database handle + write tools removed from the catalog.
  - Binds `127.0.0.1` only; the only way in is the Tailscale Funnel proxy.
- Because Funnel publishes the endpoint to the internet, the **login password is
  the main thing standing between the world and your data** — use a long,
  random `MCP_AUTH_PASSWORD`. See [`../SECURITY.md`](../SECURITY.md).

For the AI brief and dashboard Ask (which don't use MCP), see [`AI.md`](./AI.md).
