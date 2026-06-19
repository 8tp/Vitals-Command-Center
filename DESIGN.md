# Vitals — Design System

**"Calm consumer health."** Warm, calm, premium, mainstream — think Oura, Apple
Health, Calm, Fitbit. Friendly, rounded, spacious, soft, human. This replaces
the old "instrument / cockpit / terminal" aesthetic.

This doc is the source of truth for `apps/web`. The tokens live in
`src/styles/tokens.css` (values) + `tailwind.config.ts` (names) + reusable
classes in `src/styles/globals.css`. **Token/class NAMES are stable across both
themes** — pages re-skin automatically by consuming names, never raw hexes.

---

## 1. Voice & tone

Warm, clear, human, concise. Sentence case everywhere. No uppercase
letter-spaced "instrument labels", no military terseness, no emoji in UI.

- Say *"Recovery is lagging your baseline — keep intensity moderate today."*
- Labels are friendly + sentence case: `Readiness`, `Sleep`, `Energy`, `Status`.
- Empty/error states are gentle and helpful, not directives.

---

## 2. Color

Brand gradient: **teal `#14B8A6` → emerald `#10B981`**. Used for the mark, the
readiness ring, primary accents, and the ONE primary CTA per view. Color is
spent deliberately — most of the UI is calm surface + ink.

State scale: **good** = teal/emerald · **caution** = amber · **alert** = rose ·
**info** = blue.

### Dark (default — soft premium, NOT terminal black)

| Role | Token | Value |
|---|---|---|
| Page bg | `--base` | `#12161D` |
| Surface (cards) | `--surface` | `#1A1F28` |
| Surface raised | `--surface-2` | `#222934` |
| Inset (wells/inputs) | `--surface-inset` | `#161B22` |
| Hairline | `--hairline` | `rgba(160,175,195,0.10)` |
| Hairline strong | `--hairline-strong` | `rgba(160,175,195,0.18)` |
| Ink | `--ink` | `#EAEEF3` |
| Ink dim | `--ink-dim` | `#9BA7B6` |
| Ink mute | `--ink-mute` | `#6B7888` |
| Signal (brand teal) | `--signal` | `#2DD4BF` |
| Emerald | `--signal-emerald` | `#34D399` |
| Warn (amber) | `--warn` | `#FBBF24` |
| Alert (rose) | `--alert` | `#FB7185` |
| Info (blue) | `--info` | `#60A5FA` |
| Brand grad from→to | `--brand-from` / `--brand-to` | `#2DD4BF` → `#34D399` |

### Light (warm calm consumer)

| Role | Token | Value |
|---|---|---|
| Page bg | `--base` | `#F6F7F9` |
| Surface (cards) | `--surface` | `#FFFFFF` |
| Surface raised | `--surface-2` | `#F1F3F6` |
| Inset | `--surface-inset` | `#F1F4F7` |
| Hairline | `--hairline` | `rgba(20,30,40,0.07)` |
| Hairline strong | `--hairline-strong` | `rgba(20,30,40,0.14)` |
| Ink | `--ink` | `#1A2330` |
| Ink dim | `--ink-dim` | `#5B6776` |
| Ink mute | `--ink-mute` | `#8A96A6` |
| Signal (teal, AA on white) | `--signal` | `#0E9C8C` |
| Warn (amber, AA) | `--warn` | `#B45309` |
| Alert (rose, AA) | `--alert` | `#E11D62` |
| Info (blue, AA) | `--info` | `#2563EB` |
| Brand grad from→to | `--brand-from` / `--brand-to` | `#14B8A6` → `#10B981` |

Each state has a soft tint variant: `--signal-soft`, `--warn-soft`,
`--alert-soft`, `--info-soft` (≈10–14% alpha) for chip/pill backgrounds.

**Contrast:** ink/dim/mute and all state text colors are tuned for AA on their
intended surface in both themes. The vivid `--brand-from/to` endpoints are for
**fills/strokes only** (ring, icon, CTA) — never small text on white.

---

## 3. Type

**One friendly geometric family — Plus Jakarta Sans — for everything**
(headings, body, numbers). Loaded via Google Fonts (preconnect + `<link>` in
`index.html`). **No monospace anywhere.**

- `font-display` / `font-body` / `font-mono` all map to Plus Jakarta Sans.
  `font-mono` is kept only as an alias so legacy usages don't break.
- Numbers use `.num` → `font-variant-numeric: tabular-nums` for column
  alignment, in the sans (not mono).
- Labels are **sentence case, normal tracking**. `.label-micro` is now a
  friendly 12px semibold dim label (NOT uppercase/tracked/mono).
- Weights: 400/500/600/700/800. Headings 700–800, tight tracking
  (`-0.01em`/`-0.02em`); body 400–500; labels/CTAs 600.

---

## 4. Shape & elevation

Large radii, soft shadows, generous whitespace.

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `10px` | small chips, nav items |
| `--radius-md` | `14px` | inputs, controls, inset wells |
| `--radius-lg` | `20px` | cards / panels |
| `--radius-pill` | `999px` | pills, buttons, tracks, toggles |

Shadows: `--shadow-card` / `--shadow-card-hover` (Tailwind `shadow-card` /
`shadow-card-hover`). Both themes use real soft shadows; dark adds gentle
elevation (lifted surfaces) rather than hairlines-only.

---

## 5. Components & class contract

Class names are stable; values are the new system.

- `.card` — the base soft, rounded (`20px`), shadowed surface. **New, preferred**
  for page authors. `.panel` and `.instrument` are kept as aliases of the same
  soft card; `.instrument` adds a subtle hover lift. `.panel-inset` = inset well.
- `.pill` — rounded (pill), sentence-case, semibold chip. Add `.pill-tap` /
  `.pill-tap-sq` for 44px touch targets that collapse at md+.
- `.btn-primary` — the ONE brand-gradient CTA (teal→emerald, pill, white text,
  soft glow). Use at most once per view.
- `.btn-soft` — quiet secondary button (surface-2 + hairline, pill).
- `.track` / `.track-fill` — soft rounded 8px progress bar; fill animates.
- `.num` — tabular sans numerics.
- `.label-micro` — friendly small label (12px, semibold, dim).
- `.section-heading` — bold display heading, tight tracking.
- `.text-gradient-brand` — utility: teal→emerald gradient text.
- `.device-dot`, `.rule`, `.scrollbar-thin` — unchanged names, restyled.

### Tailwind tokens (names kept)

`bg-bg-base` / `bg-bg-surface` / `bg-bg-surface2` / `bg-bg-inset` ·
`text-ink` / `text-ink-dim` / `text-ink-mute` · `signal` / `warn` / `alert` /
`info` (+ `-soft`, e.g. `bg-signal-soft`) · `signal-emerald` · `brand-from` /
`brand-to` · `device-*` · `border-hairline` / `border-hairline-strong` ·
`rounded-sm|md|lg|pill` · `shadow-card` / `shadow-card-hover`.

---

## 6. Icons — `src/components/shared/icons.tsx`

Friendly rounded line icons (lucide/feather style): 24×24, `currentColor`,
round caps + joins, `size` (default 20) + `strokeWidth` (default 1.75) props.
Replaces all unicode glyphs (◎ ☾ ⇡ ▦ ✶ ▲ ▼ ◆).

Exports: `IconHome`, `IconSleep`, `IconActivity`, `IconHabits`, `IconSparkle`,
`IconArrowUp`, `IconArrowDown`, `IconFlat`, `IconTrendingUp`,
`IconTrendingDown`, `IconSun`, `IconMoon`, `IconMonitor`, `IconReadiness`,
`IconHeart`, `IconPulse`, `IconFlame`, `IconCheck`, `IconX`,
`IconChevronRight`, `IconChevronDown`, `IconCopy`, `IconInfo`, `IconAlert`,
`BrandMark` (the gradient pulse-into-ring mark), plus `NAV_ICONS` /
`NavIconKey`. All accept `IconProps` (`size`, `strokeWidth`, + SVG props).

---

## 7. Data viz

- **Readiness** is a friendly **progress ring** (`ReadinessRing`), not a ticked
  gauge: rounded line cap, teal→emerald gradient stroke, soft track, big
  friendly centered number. See §8.
- **Charts** (Recharts): soft rounded lines/areas, gentle gridlines, calm.
  All chrome comes from `lib/colors.ts` `CHART` (theme-aware CSS vars); font is
  Plus Jakarta Sans. Prefer rounded line caps, low-contrast grid, soft fills.

---

## 8. `ReadinessRing` — `src/components/shared/ReadinessRing.tsx`

```ts
interface ReadinessRingProps {
  value: number | null;            // 0–100; null = empty track
  tone?: 'brand' | 'signal' | 'warn' | 'alert' | 'info' | 'mute'; // default 'brand' (gradient)
  size?: number;                   // px diameter, default 200
  thickness?: number;              // stroke px, default ~9% of size
  label?: ReactNode;               // big centered value (default = rounded value)
  sublabel?: ReactNode;            // small caption (e.g. "Primed")
  showTrack?: boolean;             // faint bg track, default true
  animate?: boolean;               // sweep on mount, default true (reduced-motion safe)
  ariaLabel?: string;
  className?: string;
}
```

Map readiness tone → ring tone with `READINESS_TONE_RING` from
`lib/readiness.ts`. Friendly state words come from `READINESS_STATE_LABEL`.

---

## 9. Motion

Gentle, smooth, ~200–300ms ease. The readiness ring sweeps on mount
(`.ring-anim`, gated by `prefers-reduced-motion`). Hover lifts are subtle
(1px translate). All transitions/animations collapse under
`prefers-reduced-motion: reduce`. Theme cross-fades softly; no theme flash
(inline bootstrap in `index.html` sets `data-theme` before paint).

---

## 10. Do / Don't

**Do:** sentence case · soft rounded cards + pills · one brand CTA per view ·
tabular sans numbers · friendly rounded SVG icons · generous whitespace ·
AA contrast in both themes · respect reduced-motion.

**Don't:** uppercase letter-spaced labels · monospace anywhere · sharp hairline
"instrument" chrome · ticked gauges · phosphor-on-black terminal dark · unicode
glyph icons · neon fields of color · multiple competing accents · emoji in UI.
