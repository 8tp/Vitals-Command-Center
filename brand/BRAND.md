# Vitals — Brand Guide

> The product's identity, in one place. These tokens are the source of truth for
> `apps/web` (`tokens.css` / `tailwind.config.ts`), the icon set, the marketing
> site (`site/`), and every generated asset.

**Identity:** *Instrument (Soft Daylight)* — a data-forward personal health
command center that reads like a precision instrument, in bright daylight.

**Tagline:** *All your wearables, one clear read.*

---

## Logo

A white **pulse glyph** (EKG line) inside an electric-blue gradient squircle,
optionally ringed by a readiness arc — echoing the dashboard's ring + pulse.

| Asset | File | Use |
|---|---|---|
| App icon (rounded) | `brand/icon.svg` | App, favicon, "any" manifest icon |
| App icon (maskable) | `brand/icon-maskable.svg` | Full-bleed maskable / apple-touch |
| README banner | `brand/banner.png` (`.github/assets/banner.png`) | Repo / docs hero |
| Social card | `brand/og.png` | Open Graph / Twitter (1200×630) |
| Atmosphere | `brand/atmos-wide.png`, `brand/atmos-tall.png` | Section backgrounds |

**Clear space:** keep at least the height of the glyph's squircle around the
mark. Don't recolor the gradient, add a drop shadow on light backgrounds, or
place the mark on a busy photo without a scrim. The `v2/` folder is the archived
previous (teal) brand — do not use.

---

## Color

One locked UI accent (**electric blue**); neutrals do the structural work;
data-viz gets its own calm multi-hue palette.

### Core
| Token | Light (Soft Daylight) | Dark (Soft Midnight) |
|---|---|---|
| Accent | `#2563EB` | `#3B82F6` |
| Accent (deep / hi) | `#1D4ED8` / `#60A5FA` | `#2563EB` / `#60A5FA` |
| Canvas | `#F6F8FA` | `#0B0F17` |
| Surface | `#FFFFFF` | `#131A26` |
| Ink | `#0E1726` | `#E8EDF4` |
| Ink dim / mute | `#3A4658` / `#7A879B` | `#A2B2C7` / `#6F7E93` |
| Hairline | `rgba(31,52,84,.10)` | `rgba(148,170,201,.12)` |
| Positive (good) | `#0EA5A0` | `#2DD4BF` |

### Sleep-stage palette (data-viz only)
Deep `#4F46E5` · REM `#14B8A6` · Light `#60A5FA` · Awake `#E0A155`

### Device identity (series colors, never the UI accent)
Fitbit `#0EA5A0` · Apple `#2563EB` · Strava `#FC5200` · Oura `#6366F1` · WHOOP `#E11D62`

Shadows are **soft and tinted to the cool canvas** (`rgba(30,50,80,…)`), never
harsh black.

---

## Typography

| Role | Family | Notes |
|---|---|---|
| Display / body | **Geist** (300–700) | Big confident tabular numerals for metrics; tight tracking on headings (`-0.035em`+) |
| Technical | **Geist Mono** (400–600) | Axis labels, timestamps, units, eyebrows |

Never Space Grotesk, Inter, or Plus Jakarta (previous-brand tells). Numbers use
`font-variant-numeric: tabular-nums`.

---

## Layout & motion

- **Edge-to-edge, grouped by hairlines + whitespace + type** — not a grid of
  boxed cards. Cards/elevation only where they earn real hierarchy.
- One consistent **squircle radius (~22px)**.
- Motion is restrained: a one-time ring sweep + fade-rise on entry, soft float
  on hover, sync spin. Custom easing `cubic-bezier(0.16,1,0.3,1)`. Always
  respect `prefers-reduced-motion`.

---

## Voice

Confident, clear, and instrument-grade — but human. We help you read your body
like a dial, privately.

- **Do:** "All your wearables, one clear read." · "Primed for training." ·
  "Read like an instrument." · plain, specific, calm-confident.
- **Don't:** hype ("revolutionary", "unleash"), fake-precise stats, or the old
  soft-consumer register ("gently", "calm view", "warm").
- **Always:** private-first — "your box, your data," never "the cloud."
