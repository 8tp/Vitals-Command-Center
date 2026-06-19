#!/usr/bin/env bash
# Vitals Command Center — one-shot setup
#
# - verifies prerequisites (node 20+, python 3.12+, sqlite3)
# - copies .env.example → .env if missing
# - installs workspace dependencies
# - runs database migrations
# - offers to seed 90 days of demo data
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
say() { printf "${CYAN}[setup]${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}[setup]${RESET} %s\n" "$*"; }
fail() { printf "${RED}[setup]${RESET} %s\n" "$*" >&2; exit 1; }
ok() { printf "${GREEN}[setup]${RESET} %s\n" "$*"; }

# -- prerequisites --------------------------------------------------------
command -v node >/dev/null || fail 'Node 20+ required'
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then fail "Node 20+ required (found $(node -v))"; fi
ok "node $(node -v)"

if command -v python3 >/dev/null; then
  ok "python $(python3 -V | cut -d' ' -f2)"
else
  warn 'python3 not installed — needed for scripts/import_apple_health.py only'
fi

command -v sqlite3 >/dev/null && ok "sqlite3 $(sqlite3 -version | cut -d' ' -f1)" || warn 'sqlite3 CLI not installed (optional)'

# -- .env -----------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  warn 'created .env from template — fill in API credentials before running sync'
else
  ok '.env already present'
fi

# -- dependencies ---------------------------------------------------------
say 'installing workspace dependencies (npm install)...'
npm install

# -- migrations -----------------------------------------------------------
say 'running database migrations...'
npm run db:migrate

# -- optional demo data ---------------------------------------------------
if [ "${CI:-0}" = "1" ]; then
  ok 'CI detected, skipping interactive demo-data prompt'
else
  read -r -p "Seed 90 days of demo data so the UI has something to render? [Y/n] " ans || ans='y'
  case "${ans:-Y}" in
    [Nn]*) say 'skipping seed' ;;
    *)     npm run db:seed ;;
  esac
fi

cat <<BANNER
${GREEN}
✓ setup complete${RESET}
next steps:
  1. Edit .env — at minimum WHOOP, OURA, ANTHROPIC creds
  2. npm run dev       # api (3001) + web (5173) + mcp-server concurrently
  3. Open http://localhost:5173
BANNER
