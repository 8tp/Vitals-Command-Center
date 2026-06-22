#!/bin/zsh
# Guarded daily-briefing runner.
#
# Fires every 30 min in the morning (via launchd). Idempotent — exits if
# today's briefing already exists, or if the underlying data isn't there yet.
# Uses Claude Code CLI against the user's Claude subscription; does NOT hit
# the Anthropic API.

set -euo pipefail

# Repo root: override with VCC_REPO, else derive from this script's location.
REPO="${VCC_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO"

DB="$REPO/data/vitals.db"
TODAY=$(date +%Y-%m-%d)
LOG_DIR="$REPO/data/briefings"
LOG="$LOG_DIR/cron-$TODAY.log"
mkdir -p "$LOG_DIR"

log() { print -- "[$(date +%H:%M:%S)] $*" >> "$LOG"; }

# 1. Short-circuit if today's briefing already exists.
if [ "$(sqlite3 "$DB" "SELECT COUNT(*) FROM briefings WHERE date='$TODAY' AND type='daily'")" -gt 0 ]; then
  log "briefing already exists — exit"
  exit 0
fi

# 2. Refresh the data so today's row is current.
log "running sync"
npm run --silent sync:manual -- --days 2 >> "$LOG" 2>&1 || log "sync failed (continuing)"

# 3. Only brief once there's data for today (any source). Adjust this gate to
#    your primary source if you want to wait for a specific metric.
ROWS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM daily_summary WHERE date='$TODAY'")
if [ "$ROWS" -eq 0 ]; then
  log "no data for $TODAY yet — will retry next window"
  exit 0
fi

# 4. Fire Claude Code with the MCP wired up. Subscription quota, not API.
log "generating briefing via claude code"
claude -p "Give me today's vitals briefing." \
  --mcp-config "$REPO/scripts/vcc-mcp.json" \
  --allowedTools "mcp__vitals-command-center__get_full_context,mcp__vitals-command-center__save_briefing,mcp__vitals-command-center__get_daily_summary,mcp__vitals-command-center__get_trends,mcp__vitals-command-center__get_workouts" \
  --permission-mode bypassPermissions \
  --output-format json >> "$LOG" 2>&1

log "briefing complete"
