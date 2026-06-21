#!/usr/bin/env bash
#
# Phase-1 concept comps for the "Soft Daylight" redesign refinement.
# Drives `codex exec` (built-in image_gen / imagegen skill) to render THREE
# LESS-CARD-FOCUSED concepts, all sharing the locked Soft Daylight base
# (cool silver-white canvas, bold grotesk, ONE electric-blue accent), each
# blending in one inspiration: Google Health, Gemini neural, WHOOP.
#
# Output: docs/design/mockups/concepts/<name>.png   (skips if it already exists)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/docs/design/mockups/concepts"
mkdir -p "${OUT}"

# --------------------------------------------------------------------------
# Shared contract — the locked Soft Daylight base + real data + anti-card law.
# --------------------------------------------------------------------------
read -r -d '' CONTRACT <<'EOF' || true
PRODUCT — "Vitals", a self-hosted personal health command center one athlete
opens every morning. Render a high-fidelity UI design comp (like a 1x Figma
export of a real desktop web app), NOT a photo, NOT a 3D render, NOT a
wireframe, NOT an illustration.

LOCKED VISUAL BASE — "Soft Daylight" (identical across all concepts):
- Canvas: cool silver-white daylight (#F4F6F8 / #FAFBFC), bright and airy.
- Type: bold modern grotesk (Space Grotesk / Sora feel). Big confident tabular
  numerals for KPIs; small quiet tracked labels. Strong type hierarchy.
- Accent: exactly ONE — electric blue #2563EB (with a #60A5FA highlight pair).
  No other hue except calm data tints and a single Strava-orange run accent.
- Shadows: soft, highly diffused, TINTED to the cool background (cool blue-grey,
  ~rgba(30,50,80,.18)) — NEVER harsh black drop shadows.
- Radius: one consistent large squircle (~22px).

THE SCREEN IS THE MAIN DASHBOARD. Use these REAL numbers, spelled correctly:
- Dominant "Morning readiness" 82 / 100, "Primed for training", as one elegant
  gradient progress ring/arc — the hero.
- Near the hero: HRV 64 ms (+6%), Resting HR 52 bpm (-3), Sleep 7h 24m (+18m).
- Secondary vitals: SpO2 98%, Respiratory 14.2 br/min, Skin temp -0.2 deg,
  Steps 8,431, Calories burned 2,180, eaten 1,940.
- A 14-day HRV trend (smooth area/line, faint baseline at 60).
- Sleep stages: Deep 1h32m, REM 1h48m, Light 3h41m, Awake 23m (slim ribbon).
- Today's run from Strava: "Morning Run · 5.02 km · 37:13 · 400 cal · 7:25/km".
- Left or top nav, 5 items: Dashboard, Sleep, Activity, Habits, Ask Claude.
- Header: "Vitals" wordmark, the date, ONE connected device chip "Fitbit Air".
  ONLY one device is connected — do NOT imply WHOOP / Oura / Apple are on.

THE ANTI-CARD LAW (this is the whole point of the refinement):
- Do NOT draw a grid of boxed cards with borders + drop shadows. That generic
  "6 rounded rectangles in a grid" look is exactly what we are killing.
- Lean on WHITESPACE, thin HAIRLINE dividers, and TYPOGRAPHIC HIERARCHY to
  group information. Edge-to-edge sections separated by space and 1px rules,
  not outlined containers. Elevation/cards appear ONLY where they earn real
  hierarchy (the readiness hero). Everything else breathes in open layout.

DO NOT INCLUDE: Figma frame labels, red arrows, rulers, browser chrome, lorem
ipsum, watermarks, the words mockup/template, stock-photo people, or any device
that isn't Fitbit Air. No spelling errors. Render exactly 1536x1024, landscape.
EOF

DIRECTIONS=(
"concept-1-google-health|BLEND — Soft Daylight x GOOGLE HEALTH. Friendly, approachable, accessible. Group information with soft TONAL SECTIONS (very gentle blue-grey tinted background zones and whitespace) rather than bordered cards. Rounded, optimistic, humane. The readiness ring is a smooth gradient arc. Calm, mostly-neutral data tints used as gentle fills. Quiet pill labels. Feels like a 2026 Google / Fitbit consumer health app — clean, light, human — but built on the cool silver-white Soft Daylight base with the single electric-blue accent."
"concept-2-gemini-neural|BLEND — Soft Daylight x GEMINI NEURAL, kept BRIGHT (not dark). Same cool silver-white daylight canvas, now washed with a very soft luminous aurora in the background (indigo -> electric-blue -> cyan), low-contrast, never busy. Faint flowing 'neural' threads / contour lines drift behind the content. The readiness ring glows with a multi-stop blue gradient. A few foreground surfaces read as barely-there bright glass (subtle light blur, 1px luminous edge) — present but not boxy, edge-to-edge. Luminous, fluid, futuristic, yet calm and legible in full daylight."
"concept-3-whoop|BLEND — Soft Daylight x WHOOP, inverted to LIGHT. Data-forward instrument feel but on the bright cool canvas. Edge-to-edge, almost no containers: sections divided by pure whitespace and 1px hairlines. HUGE confident tabular numerals for every metric, quiet grey labels. The readiness ring is thin, large, luminous electric-blue. The HRV chart is a single calm blue line on a near-invisible grid. Dense but breathing — a high-end performance cockpit rendered in daylight, not darkness."
)

for entry in "${DIRECTIONS[@]}"; do
  name="${entry%%\|*}"
  style="${entry#*|}"
  target="${OUT}/${name}.png"
  if [[ -f "${target}" ]]; then echo "==== SKIP ${name} (exists) ===="; continue; fi

  prompt="Use your imagegen skill (use case: ui-mockup) to generate ONE high-fidelity UI design comp.

${style}

${CONTRACT}

After generating, copy the FINAL png to exactly this absolute path: ${target}
Then reply with that path. Do not ask any questions; proceed fully autonomously."

  echo "==== generating ${name} via codex imagegen ===="
  codex exec --skip-git-repo-check "${prompt}" || { echo "WARN: codex failed for ${name}" >&2; continue; }
  [[ -f "${target}" ]] && echo "OK: wrote ${target}" || echo "WARN: ${target} not written" >&2
done

echo
echo "==== concepts in ${OUT} ===="
ls -la "${OUT}"/*.png 2>/dev/null || echo "(none yet)"
