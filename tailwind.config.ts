import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        bone: 'var(--bone)',
        hairline: 'var(--hairline)',
        ink: { DEFAULT: 'var(--ink)', mark: 'var(--ink-mark)', 2: 'var(--ink-2)' },
        sage: { DEFAULT: 'var(--sage)', tint: 'var(--sage-tint)', deep: 'var(--sage-deep)' },
        coral: { DEFAULT: 'var(--coral)', tint: 'var(--coral-tint)', deep: 'var(--coral-deep)' },
        clay: { DEFAULT: 'var(--clay)', tint: 'var(--clay-tint)', deep: 'var(--clay-deep)' },
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      borderRadius: { card: 'var(--radius-card)', input: 'var(--radius-input)', pill: 'var(--radius-pill)' },
      maxWidth: { measure: '640px', frame: '1120px' },
      letterSpacing: { tightest: '-0.025em', label: '0.04em' },
      transitionTimingFunction: { editorial: 'cubic-bezier(0.44, 0, 0.56, 1)' },
      transitionDuration: { editorial: '300ms' },
    },
  },
  plugins: [],
} satisfies Config;
