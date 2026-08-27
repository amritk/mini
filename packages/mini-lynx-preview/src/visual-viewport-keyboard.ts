import type { KeyboardEmitter, KeyboardStatusListener } from '@amritk/mini-lynx/keyboard'

/**
 * The browser standing in for Lynx's keyboard reporting.
 *
 * On a device the runtime hears about the keyboard through one global event —
 * `keyboardstatuschanged` on the engine's `GlobalEventEmitter`. Lynx's own
 * compatibility data lists that event as **unsupported on the web**, so a page
 * running this runtime through a DOM Element PAPI would otherwise never hear
 * about the keyboard at all: `<KeyboardAvoiding>` would sit there, correct and
 * motionless, and the preview would look like the feature was broken.
 *
 * The web has its own answer, and it is a good one. `visualViewport` is the part
 * of the layout viewport actually visible, and a soft keyboard is exactly what
 * shrinks it — so the difference between the layout height and the visual one is
 * the keyboard's height, which is precisely what the engine reports.
 *
 * ```ts
 * trackKeyboard({ emitter: createVisualViewportEmitter() })
 * ```
 *
 * Everything downstream of the height — the lift arithmetic, the measured
 * overlap, the component — is then the same code on both targets, which is the
 * whole reason the emitter is a seam rather than a constant.
 *
 * ## The threshold, and why there is one
 *
 * A visual viewport shrinks for things that are not keyboards: the URL bar
 * collapsing on scroll is the common one, and it is worth about sixty pixels on
 * a phone. Treating that as a keyboard would lift a form for a scroll gesture.
 * Anything under the threshold is therefore reported as closed — which is the
 * same judgement call Lynx's own hosts make one layer down, just visible here.
 */
export const createVisualViewportEmitter = (): KeyboardEmitter => {
  const listeners = new Set<KeyboardStatusListener>()
  const viewport = globalThis.visualViewport

  const height = (): number => {
    if (!viewport) return 0
    const covered = document.documentElement.clientHeight - viewport.height - viewport.offsetTop
    return covered > KEYBOARD_THRESHOLD ? Math.round(covered) : 0
  }

  const publish = (): void => {
    const covered = height()
    for (const listener of [...listeners]) {
      listener(covered > 0 ? 'on' : 'off', covered, covered)
    }
  }

  // One DOM subscription for the emitter's whole life rather than one per
  // listener, because `resize` and `scroll` on the visual viewport are noisy and
  // the fan-out is free.
  viewport?.addEventListener('resize', publish)
  viewport?.addEventListener('scroll', publish)

  return {
    addListener: (_event, listener) => {
      listeners.add(listener)
    },
    removeListener: (_event, listener) => {
      listeners.delete(listener)
    },
  }
}

/** Below this, a shrunken viewport is a collapsing URL bar rather than a keyboard. */
const KEYBOARD_THRESHOLD = 120
