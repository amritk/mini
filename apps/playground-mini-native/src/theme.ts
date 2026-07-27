import type { ReadonlySignal } from '@amritk/mini-native'
import { createContext } from '@amritk/mini-native/composition'
import { defaultTheme, type Theme } from '@amritk/mini-native/ui'

/**
 * The app's taste, kept separate from the package's semantics.
 *
 * `@amritk/mini-native/ui` ships a `Theme` covering the things whose
 * correctness is portable — a type scale, spacing steps, text tones — and
 * deliberately nothing about surfaces, borders or radii. Those are the app's,
 * they change with it, and holding them here is what keeps the design system
 * from being version-coupled to the package.
 */
export type Palette = {
  readonly background: string
  readonly surface: string
  readonly surfaceAlt: string
  readonly border: string
  readonly text: string
  readonly muted: string
  readonly accent: string
  readonly onAccent: string
  readonly danger: string
  readonly ok: string
}

export const LIGHT: Palette = {
  background: '#f4f6fb',
  surface: '#ffffff',
  surfaceAlt: '#eef1f8',
  border: '#dde2ee',
  text: '#131722',
  muted: '#5c6577',
  accent: '#2f5bd7',
  onAccent: '#ffffff',
  danger: '#c02d47',
  ok: '#12704a',
}

export const DARK: Palette = {
  background: '#0b0e15',
  surface: '#141924',
  surfaceAlt: '#1b2130',
  border: '#28303f',
  text: '#e8ecf4',
  muted: '#98a2b8',
  accent: '#7ea2ff',
  onAccent: '#0b0e15',
  danger: '#ff8098',
  ok: '#5fe0a5',
}

/**
 * The palette, as a SIGNAL rather than a value — the same shape
 * `ThemeContext` uses and for the same reason. A component runs exactly once
 * and therefore reads context exactly once, so a plain palette would be
 * whatever it was at boot, forever. Holding the signal means every component
 * reads it once and goes on tracking it, and a light/dark switch reaches the
 * whole tree with no re-render and no invalidation pass.
 */
export const PaletteContext = createContext<ReadonlySignal<Palette>>(() => LIGHT)

/**
 * The package's theme with this app's tones substituted in. Everything else —
 * the type scale, the spacing steps, the heading outline — is `defaultTheme`'s,
 * because those are decisions that were already right.
 */
export const themeFor = (palette: Palette): Theme => ({
  ...defaultTheme,
  tone: {
    default: palette.text,
    muted: palette.muted,
    accent: palette.accent,
    danger: palette.danger,
    inverse: palette.background,
  },
})

/** Corner radii, in density-independent pixels. A bare number means dp on every target. */
export const RADIUS = { sm: 8, md: 12, lg: 18 } as const
