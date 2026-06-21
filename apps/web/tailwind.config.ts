import type { Config } from 'tailwindcss';

/*
 * Design system: "Vitals — Instrument (Soft Daylight)". Token names map 1:1 to
 * tokens.css CSS vars so components consume by name (values change per theme,
 * names stay stable):
 *   bg.base / bg.surface / bg.surface2 / bg.inset
 *   ink / ink-dim / ink-mute
 *   signal / accent / warn / alert / info  (+ *-soft)
 *   sleep.deep / sleep.rem / sleep.light / sleep.awake (+ *-soft) — data palette
 *   device.fitbit / whoop / oura / apple / strava (series colors)
 *   hairline / hairline-strong (border colors)
 * Fonts: display/body = Geist, mono = Geist Mono.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--base)',
          surface: 'var(--surface)',
          surface2: 'var(--surface-2)',
          inset: 'var(--surface-inset)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          dim: 'var(--ink-dim)',
          mute: 'var(--ink-mute)',
        },
        signal: {
          DEFAULT: 'var(--signal)',
          soft: 'var(--signal-soft)',
          emerald: 'var(--signal-emerald)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          2: 'var(--accent-2)',
          deep: 'var(--accent-deep)',
          soft: 'var(--accent-soft)',
          wash: 'var(--accent-wash)',
        },
        good: 'var(--good)',
        brand: {
          from: 'var(--brand-from)',
          to: 'var(--brand-to)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          soft: 'var(--warn-soft)',
        },
        alert: {
          DEFAULT: 'var(--alert)',
          soft: 'var(--alert-soft)',
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
        },
        sleep: {
          deep: 'var(--sleep-deep)',
          rem: 'var(--sleep-rem)',
          light: 'var(--sleep-light)',
          awake: 'var(--sleep-awake)',
          'deep-soft': 'var(--sleep-deep-soft)',
          'rem-soft': 'var(--sleep-rem-soft)',
          'light-soft': 'var(--sleep-light-soft)',
          'awake-soft': 'var(--sleep-awake-soft)',
        },
        device: {
          fitbit: 'var(--device-fitbit)',
          whoop: 'var(--device-whoop)',
          oura: 'var(--device-oura)',
          apple: 'var(--device-apple)',
          strava: 'var(--device-strava)',
        },
        hairline: {
          DEFAULT: 'var(--hairline)',
          strong: 'var(--hairline-strong)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--hairline)',
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
      },
      divideColor: {
        DEFAULT: 'var(--hairline)',
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
      },
      fontFamily: {
        display: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        sm: '12px',
        md: '16px',
        lg: '22px',
        xl: '26px',
        pill: '999px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        '3xs': ['10px', '14px'],
      },
      letterSpacing: {
        label: '0.085em',
        tightest: '-0.045em',
      },
      keyframes: {
        'arc-sweep': {
          from: { strokeDashoffset: 'var(--arc-len)' },
          to: { strokeDashoffset: 'var(--arc-target)' },
        },
        'ring-sweep': {
          from: { strokeDashoffset: 'var(--ring-len)' },
          to: { strokeDashoffset: 'var(--ring-target)' },
        },
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 0.6s cubic-bezier(0.16,1,0.3,1) both',
        'spin-slow': 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;
