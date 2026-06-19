import type { Config } from 'tailwindcss';

/*
 * Design system: "Vitals — calm consumer health". Token names map 1:1 to
 * tokens.css CSS vars so the page agents consume by name (values change per
 * theme, names stay stable):
 *   bg.base / bg.surface / bg.surface2 / bg.inset
 *   ink / ink-dim / ink-mute
 *   signal / warn / alert / info  (+ *-soft via bg-signal-soft etc.)
 *   device.fitbit (series color, used sparingly)
 *   hairline / hairline-strong (border colors)
 * Fonts: display/body/mono ALL map to Plus Jakarta Sans (mono kept as alias).
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
        device: {
          fitbit: 'var(--device-fitbit)',
          whoop: 'var(--device-whoop)',
          oura: 'var(--device-oura)',
          apple: 'var(--device-apple)',
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
      fontFamily: {
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '20px',
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
        label: '0',
        labelWide: '0',
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
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
