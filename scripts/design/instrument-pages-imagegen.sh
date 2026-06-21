#!/usr/bin/env bash
#
# Instrument-direction (locked) per-PAGE concept comps. Same daylight base as
# the dashboard, now for Sleep / Activity / Ask-AI so we can see each surface.
# Output: docs/design/mockups/concepts/<name>.png  (skips if it exists)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/docs/design/mockups/concepts"
mkdir -p "${OUT}"

read -r -d '' CONTRACT <<'EOF' || true
PRODUCT — "Vitals", a self-hosted personal health command center. Render a
high-fidelity UI design comp of a REAL desktop web app (1x Figma export), NOT a
photo / 3D / wireframe / illustration.

LOCKED DIRECTION — "Instrument" (data-forward daylight, WHOOP-grade):
- Cool silver-white daylight canvas (#F4F6F8 / #FAFBFC). Bright, airy.
- LEFT RAIL navigation, 5 items: Dashboard, Sleep, Activity, Habits, Ask AI.
  ("Ask AI", never "Ask Claude".) Active item tinted electric blue.
- EDGE-TO-EDGE. NO boxed cards. Group with WHITESPACE + 1px HAIRLINE rules and
  TYPOGRAPHIC HIERARCHY only. The generic "rounded rectangles in a grid" look is
  banned — this is the whole point.
- HUGE confident tabular numerals for every metric; small quiet grey labels.
- ONE accent: electric blue #2563EB (+#60A5FA). Calm single-line charts on a
  near-invisible grid. Thin luminous rings, never thick.
- Clean modern neutral grotesk (Geist / Inter-Tight feel) — NOT Space Grotesk,
  NOT a quirky display face.
- Header: a quiet greeting/title + date + a single STATIC "Fitbit Air" device
  chip (no glowing/pulsing dot). NO "morning briefing" eyebrow label anywhere.
- Soft TINTED shadows (cool blue-grey) only on the rare element that earns
  elevation; never harsh black. One consistent ~22px radius where any radius.

DO NOT INCLUDE: Figma frame labels, arrows, rulers, browser chrome, lorem ipsum,
watermarks, the words mockup/template, stock people, or any device but Fitbit
Air. No spelling errors. Render exactly 1536x1024, landscape.
EOF

DIRECTIONS=(
"page-sleep|SCREEN = the SLEEP page. Left rail with 'Sleep' active. Hero strip: last night 7h 24m (+18m vs baseline) as a huge numeral, sleep efficiency 94%, a slim stage RIBBON (Deep / REM / Light / Awake). Below, hairline-separated: a full-width HYPNOGRAM timeline across the night (~22:50 to 06:14) showing the stage steps, a 14-day sleep-hours trend as one calm blue line with an 8h goal reference line, a sleep-debt readout (-1h 12m) and resting-HR dip overnight. All edge-to-edge, big numerals, quiet labels, hairlines not boxes."
"page-activity|SCREEN = the ACTIVITY page. Left rail with 'Activity' active. Hero strip: today's Strava run 'Morning Run' with huge stats 5.02 km / 37:13 / 7:25 per km / 400 cal and a small pace line. Below, hairline-separated: a RECENT WORKOUTS list as clean hairline rows (date, run name, distance, time, pace) — NOT cards; a Steps readout 8,431 (84% of 10,000) with a 7-day bar trend; an Energy balance row burned 2,180 / eaten 1,940 / net +240. Edge-to-edge, data-forward."
"page-ask-ai|SCREEN = the 'Ask AI' page — a modern AI health-COACH CHAT (think Gemini / Grok / Google Health coach), on the SAME bright daylight canvas with the same left rail ('Ask AI' active). NOT a dashboard of cards. A friendly assistant greeting at top, a row of suggestion CHIPS ('How should I train today?', 'Why is my HRV up?', 'Plan my recovery week'), then a clean conversation thread: a user question bubble and a calm assistant answer that references real metrics (readiness 82, HRV 64 ms, sleep 7h 24m) — the answer may contain one small inline sparkline or a tiny metric chip. A clean chat COMPOSER input pinned at the bottom ('Ask about your health…') with a send button. Luminous, conversational, friendly; one electric-blue accent; lots of calm whitespace."
)

for entry in "${DIRECTIONS[@]}"; do
  name="${entry%%\|*}"; style="${entry#*|}"; target="${OUT}/${name}.png"
  if [[ -f "${target}" ]]; then echo "==== SKIP ${name} (exists) ===="; continue; fi
  prompt="Use your imagegen skill (use case: ui-mockup) to generate ONE high-fidelity UI design comp.

${style}

${CONTRACT}

After generating, copy the FINAL png to exactly this absolute path: ${target}
Then reply with that path. Do not ask any questions; proceed fully autonomously."
  echo "==== generating ${name} ===="
  codex exec --skip-git-repo-check "${prompt}" || { echo "WARN: codex failed for ${name}" >&2; continue; }
  [[ -f "${target}" ]] && echo "OK: ${target}" || echo "WARN: ${target} missing" >&2
done
echo; echo "==== page concepts ===="; ls -la "${OUT}"/page-*.png 2>/dev/null || echo "(none)"
