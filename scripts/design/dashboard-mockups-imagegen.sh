#!/usr/bin/env bash
#
# Drive `codex exec` (with the .system/imagegen skill a.k.a. $imagegen) to
# generate high-fidelity UI design comps for the Vitals health dashboard
# redesign. Each run produces ONE PNG via codex's built-in image_gen tool.
#
# Goal: move AWAY from the current "vibe-coded, boxed-card" aesthetic toward a
# sleek, native, modern, data-forward look. We generate THREE distinct
# directions (WHOOP-dark, Google-Health-light, Gemini-neural) so we can pick a
# language before rebuilding the React app.
#
# Output: docs/design/mockups/<NN>-<name>.png
# Skips any name whose PNG already exists, so reruns are cheap.
#
# Requires: codex CLI on PATH (trusted), imagegen system skill available.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/docs/design/mockups"
mkdir -p "${OUT}"

# ---------------------------------------------------------------------------
# Shared product + quality contract appended to every prompt so the set reads
# as the same app. Anchored to the REAL data this dashboard shows.
# ---------------------------------------------------------------------------
read -r -d '' CONTRACT <<'EOF' || true
PRODUCT CONTEXT — this is "Vitals", a personal health command center (a
self-hosted dashboard a single athlete uses every morning). Render a
high-fidelity UI design comp (like a Figma export at 1x), NOT a photograph,
NOT a 3D render, NOT a wireframe, NOT illustrated. It is a real software
screen.

THE SCREEN IS THE MAIN DASHBOARD. It must contain, using realistic numbers:
- A dominant "Morning readiness" score, 0-100 (show e.g. 82), rendered as a
  single elegant progress ring or arc — the hero of the page.
- Three supporting vitals near the hero: Heart Rate Variability (e.g. 64 ms),
  Resting Heart Rate (e.g. 52 bpm), Last night's sleep (e.g. 7h 24m), each
  with a tiny trend delta (+/- vs baseline).
- A secondary row of smaller metrics: Blood oxygen (98%), Respiratory rate
  (14.2 br/min), Skin temp (-0.2 deg), Steps (8,431), Calories burned
  (2,180), Calories eaten (1,940).
- One time-series chart: a 14-day HRV trend (smooth area/line) with a faint
  baseline reference line.
- A sleep-stages breakdown (deep / REM / light / awake) as a slim stacked bar
  or ribbon.
- A left or bottom navigation with 5 items: Dashboard, Sleep, Activity,
  Habits, Ask Claude.
- A small header with the "Vitals" wordmark, a date, and a single connected
  device chip reading "Fitbit Air" (ONLY one device is connected — do NOT
  imply WHOOP / Oura / Apple are connected).

HARD AESTHETIC RULES — this is the whole point of the redesign:
- ABSOLUTELY NO grid of boxed "cards" with heavy borders + drop shadows. Avoid
  the generic bootstrap/tailwind-template "6 rounded rectangles in a grid"
  look. That is the thing we are replacing.
- Instead: an editorial, native, instrument-grade layout. Group information
  with generous whitespace, type hierarchy, thin hairline dividers, and
  alignment — not with outlined containers. Think premium native app, not a
  web component gallery.
- Typography: clean modern geometric sans (Inter / SF / Plus Jakarta feel).
  Big confident numerals for the KPIs (tabular figures). Small, quiet, tracked
  uppercase or sentence-case labels. Strong type hierarchy.
- Restraint with color: mostly neutral surface + ink, with ONE accent used
  sparingly for the live/primary signal. Data-viz colors are calm, not neon
  rainbow.
- It must look genuinely premium and 2026-modern: the kind of UI that would
  ship from WHOOP, Oura, Google Health, Apple Health, or a Gemini-era Google
  product. Cohesive, calm, confident, expensive-feeling.

DO NOT INCLUDE: Figma frame labels, red annotation arrows, measurement guides,
rulers, browser chrome / address bars, lorem ipsum, watermarks, the words
"mockup"/"template", any stock-photo people, or any device that isn't the
Fitbit Air. No spelling errors in any visible label.

Render at exactly 1536x1024 (landscape, desktop dashboard).
EOF

# ---------------------------------------------------------------------------
# Three style directions. name|style-spec  (pipe-delimited)
# ---------------------------------------------------------------------------
DIRECTIONS=(
"01-whoop-dark|DIRECTION A — \"WHOOP instrument\". Near-black charcoal canvas (#0a0c10 ~ #101317), edge-to-edge, almost no visible containers. Monochrome and severe, athletic and premium. ONE accent only: an electric teal/cyan (#22d3ee ~ #2dd4bf) reserved for the live readiness signal and the active nav item. The readiness ring is thin, large, and luminous against the dark. KPIs are huge, ultra-legible white tabular numerals with quiet grey labels. The HRV chart is a single calm glowing line on a near-invisible grid. Sections are separated by pure space and 1px low-opacity hairlines, never by boxes. Dense but breathing. Feels like a high-end performance cockpit."
"02-google-health-light|DIRECTION B — \"Google Health / Material You\". Bright, airy, friendly. Soft off-white canvas (#f7f8fa) with very gentle tonal surfaces (no harsh borders, no drop shadows — separation comes from soft tonal blocks and whitespace). Rounded, generous, optimistic. A calm multi-hue but tasteful data palette (soft teal, soft indigo, soft amber) used as gentle fills. Big rounded friendly numerals. The readiness ring is a smooth gradient arc. Pill-shaped quiet chips. Feels like a 2026 Google / Fitbit consumer health app: clean, humane, accessible, light."
"03-gemini-neural|DIRECTION C — \"Gemini neural\". Dark, but alive: a deep slate canvas (#0b0f17) washed with a subtle luminous gradient-mesh / aurora in the background (indigo -> teal -> violet), very soft, low-contrast, never busy. Faint flowing 'neural' threads/contour lines drift behind the content. Foreground panels are barely-there glass (subtle blur, 1px luminous edge) — present but not boxy. The readiness ring glows with a multi-stop gradient. Accent text uses a gentle indigo->teal gradient. Soft depth, soft glow, calm and futuristic — the Gemini-era 'neural UI' feel. Still a serious data dashboard, not a sci-fi prop."
)

for entry in "${DIRECTIONS[@]}"; do
  name="${entry%%|}"
  name="${entry%%\|*}"
  style="${entry#*|}"
  target="${OUT}/${name}.png"

  if [[ -f "${target}" ]]; then
    echo "==== SKIP ${name} (exists) ===="
    continue
  fi

  prompt="Use your imagegen skill (use case: ui-mockup) to generate ONE high-fidelity UI design comp.

${style}

${CONTRACT}

After generating, save/copy the FINAL png to exactly this absolute path: ${target}
Then reply with that path. Do not ask any questions; proceed autonomously."

  echo "==== generating ${name} via codex /imagegen ===="
  codex exec --skip-git-repo-check "${prompt}" || {
    echo "WARN: codex exec failed for ${name}" >&2
    continue
  }

  if [[ ! -f "${target}" ]]; then
    echo "WARN: codex did not write ${target} (will need a retry)" >&2
  else
    echo "OK: wrote ${target}"
  fi
done

echo
echo "==== mockups in ${OUT} ===="
ls -la "${OUT}"/*.png 2>/dev/null || echo "(none yet)"
