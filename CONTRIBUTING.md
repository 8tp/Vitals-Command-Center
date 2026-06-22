# Contributing to Vitals

Thanks for taking a look. Vitals is an open-source, self-hosted, privacy-first
personal health command center, and contributions of all sizes are welcome —
bug fixes, new device adapters, docs, or ideas.

This is a friendly, low-ceremony project. If you're unsure about anything, open
an issue and ask.

## Dev setup

Prerequisites: **Node 20+** (the repo targets Node 22 for some tooling) and npm.

```bash
git clone https://github.com/8tp/Vitals-Command-Center.git
cd vitals-command-center
npm install
cp .env.example .env        # fill in only what you need
npm run db:migrate          # create the local SQLite database
npm run db:seed             # optional: load demo data so the UI has something
npm run dev                 # api (3001) + web (5173) + mcp-server, all at once
```

Then open <http://localhost:5173>. You can develop most of the app against
seeded demo data without connecting any real device or credentials.

## Monorepo layout

It's a TypeScript monorepo using npm workspaces:

```
apps/
  api/          Fastify API: sync jobs, AI brief/Ask, REST routes
  web/          Vite/React dashboard
  mcp-server/   MCP server (stdio + HTTP transports) — see docs/MCP.md
packages/
  db/           SQLite schema, migrations, and queries (@vcc/db)
  shared/       Shared types and Zod schemas (@vcc/shared)
docs/           Architecture, device setup, MCP, AI, API reference
```

## Scripts

Run from the repo root:

| Script | What it does |
|--------|--------------|
| `npm run dev` | Run api + web + mcp-server together |
| `npm run dev:api` / `dev:web` / `dev:mcp` | Run one app |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | `tsc -b` across the monorepo |
| `npm run lint` | ESLint over `apps`, `packages`, `scripts` |
| `npm run format` | Prettier write |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Load demo data |

Before opening a PR, please make sure **`npm run typecheck` and `npm run lint`
pass**, and run `npm run format` to keep style consistent.

## Code style

- TypeScript, ESM, strict. Prefer explicit types at module boundaries.
- Formatting and linting are enforced by Prettier + ESLint — don't hand-format;
  run `npm run format`.
- Keep comments focused on *why*, not *what*. Match the surrounding style.
- Don't commit secrets. `.env`, the `data/` directory, and token files are
  gitignored — keep it that way.

## Adding a device adapter

Pulling in a new wearable or data source is the most common contribution. The
sync pipeline normalizes every source into the shared `daily_summary` shape, so
an adapter is mostly: authenticate, fetch, map to the normalized rows. See
[`docs/ADAPTERS.md`](./docs/ADAPTERS.md) for the adapter contract and a
walkthrough (existing adapters under `apps/api/src` are good references).

## Commits & PRs

- Branch off `main`; keep PRs focused on one change.
- Write clear commit messages (a short imperative subject; a body explaining
  *why* when it isn't obvious).
- In the PR description, say what changed and how you tested it. Screenshots help
  for UI changes.
- Link any related issue.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
