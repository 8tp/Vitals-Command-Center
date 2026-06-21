#!/usr/bin/env bash
#
# Brand atmosphere imagery for the "Instrument (Soft Daylight)" rebrand —
# abstract, on-brand backgrounds for the marketing site + brand package.
# Driven by codex exec ($imagegen). Output: docs/design/brand-gen/<name>.png
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/docs/design/brand-gen"
mkdir -p "${OUT}"

read -r -d '' CONTRACT <<'EOF' || true
Abstract PREMIUM BRAND BACKGROUND for "Vitals", a self-hosted personal health
command center. This is atmosphere/texture only — NOT a UI, NOT a dashboard,
NO text, NO logos, NO charts, NO people, NO devices.

LOCKED BRAND LOOK — "Soft Daylight / Instrument":
- Cool silver-white daylight base (#F4F6F8 / #FAFBFC) — bright, airy, lots of
  clean negative space.
- A soft, luminous ELECTRIC-BLUE aurora / gradient-mesh (#2563EB with a #60A5FA
  highlight and a faint #22D3EE cyan edge), low-contrast and gentle — a glow
  pooling through the frame, never harsh or neon.
- Faint, elegant flowing contour lines / "neural threads" drifting through the
  light, very subtle.
- Premium, calm, modern, 2026 — the kind of brand background a high-end SaaS or
  Apple-tier health product would use. Bright (NOT dark), restrained, expensive.
- Subtle film grain / soft depth is welcome; keep it clean and uncluttered.
EOF

DIRECTIONS=(
"brand-atmos-wide|Wide 16:9 composition. The electric-blue aurora pools toward the upper-right, fading into clean silver-white light across the rest of the frame, with a few faint contour threads drifting diagonally. Generous calm empty space on the left for text overlay. Render at exactly 1536x1024."
"brand-atmos-tall|Tall portrait composition. A soft vertical column of electric-blue luminous mesh down one side, dissolving into bright silver-white daylight, faint drifting threads. Calm, airy, lots of light. Render at exactly 1024x1536."
)

for entry in "${DIRECTIONS[@]}"; do
  name="${entry%%\|*}"; style="${entry#*|}"; target="${OUT}/${name}.png"
  if [[ -f "${target}" ]]; then echo "==== SKIP ${name} (exists) ===="; continue; fi
  prompt="Use your imagegen skill (use case: brand-background) to generate ONE abstract premium brand background.

${style}

${CONTRACT}

After generating, copy the FINAL png to exactly this absolute path: ${target}
Then reply with that path. Do not ask any questions; proceed fully autonomously."
  echo "==== generating ${name} ===="
  codex exec --skip-git-repo-check "${prompt}" || { echo "WARN: codex failed for ${name}" >&2; continue; }
  [[ -f "${target}" ]] && echo "OK: ${target}" || echo "WARN: ${target} missing" >&2
done
echo; echo "==== brand atmosphere in ${OUT} ===="; ls -la "${OUT}"/*.png 2>/dev/null || echo "(none)"
