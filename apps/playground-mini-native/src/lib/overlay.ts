import type { HostElement } from '@amritk/mini-native'
import { createContext } from '@amritk/mini-native/composition'

/**
 * Where overlays go.
 *
 * `Portal` takes an explicit target rather than asking the host for an overlay
 * root, which keeps the `Host` contract at its size and puts the question —
 * where is the top of the screen — to the app. This is the app answering it:
 * the entry point creates the root and provides it here, so no screen has to
 * know what a `document` is to open a modal.
 *
 * The fallback is `null` rather than a fabricated element, so a screen rendered
 * with no overlay root around it (a test, a story) can say so instead of
 * silently portalling into nowhere.
 */
export const OverlayContext = createContext<HostElement | null>(null)
