import { afterEach, describe, expect, it } from 'vitest'

import { keyboardHeight, setKeyboardHeight } from './keyboard-height'
import { type KeyboardEmitter, type KeyboardStatusListener, trackKeyboard } from './track-keyboard'

afterEach(() => {
  setKeyboardHeight(0)
})

/**
 * A stand-in for the engine's `GlobalEventEmitter`.
 *
 * The emitter is an option rather than something to mock precisely so that this
 * is possible — the seam exists for the web, where Lynx emits no keyboard event
 * at all, and a test gets it for free.
 */
const createEmitter = (): KeyboardEmitter & { emit: KeyboardStatusListener; count: () => number } => {
  const listeners = new Set<KeyboardStatusListener>()
  return {
    addListener: (_event, listener) => {
      listeners.add(listener)
    },
    removeListener: (_event, listener) => {
      listeners.delete(listener)
    },
    emit: (status, height, compatHeight) => {
      for (const listener of [...listeners]) listener(status, height, compatHeight)
    },
    count: () => listeners.size,
  }
}

describe('track-keyboard', () => {
  it('reports the height the engine sends when the keyboard opens', () => {
    const emitter = createEmitter()
    trackKeyboard({ emitter })

    emitter.emit('on', 336)

    expect(keyboardHeight()).toBe(336)
  })

  it('goes back to zero when the keyboard closes', () => {
    const emitter = createEmitter()
    trackKeyboard({ emitter })

    emitter.emit('on', 336)
    emitter.emit('off', 336)

    expect(keyboardHeight()).toBe(0)
  })

  it('follows a change of height while the keyboard is already open', () => {
    // A taller IME, an emoji panel, split-screen: the engine reports the new
    // height with the status still `on`, and a layout that only watched the
    // status would stay at the old one.
    const emitter = createEmitter()
    trackKeyboard({ emitter })

    emitter.emit('on', 336)
    emitter.emit('on', 402)

    expect(keyboardHeight()).toBe(402)
  })

  it('ignores the engine compatibility height', () => {
    // The third argument exists for hosts that measure differently, and picking
    // between the two on an app's behalf would be guessing.
    const emitter = createEmitter()
    trackKeyboard({ emitter })

    emitter.emit('on', 336, 291)

    expect(keyboardHeight()).toBe(336)
  })

  it('unsubscribes and settles at zero when stopped', () => {
    const emitter = createEmitter()
    const stop = trackKeyboard({ emitter })

    emitter.emit('on', 336)
    stop()

    expect(emitter.count()).toBe(0)
    // A page that stopped listening can never hear the keyboard close, so
    // leaving the last height behind would strand every layout reading it.
    expect(keyboardHeight()).toBe(0)
  })

  it('reports nothing rather than throwing on a host with no emitter', () => {
    // A host that cannot report the keyboard has a layout problem, not a reason
    // to refuse to start.
    const stop = trackKeyboard()

    expect(keyboardHeight()).toBe(0)
    expect(() => stop()).not.toThrow()
  })

  it('keeps a nonsense height off the style channel', () => {
    // `NaN` reaches a binding as `padding-bottom: NaNpx`, which the engine drops
    // in silence — the layout stops responding with nothing to explain why.
    const emitter = createEmitter()
    trackKeyboard({ emitter })

    emitter.emit('on', Number.NaN)
    expect(keyboardHeight()).toBe(0)

    emitter.emit('on', -12)
    expect(keyboardHeight()).toBe(0)
  })
})
