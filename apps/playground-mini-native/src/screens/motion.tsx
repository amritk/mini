import { type HostElement, signal } from '@amritk/mini-native'
import { type Animation, animate } from '@amritk/mini-native/animate'
import { Show } from '@amritk/mini-native/flow'
import { reduceMotion } from '@amritk/mini-native/platform'
import { Row, Stack, Text } from '@amritk/mini-native/ui'

import { Action, Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext, RADIUS } from '../theme'

/**
 * `@amritk/mini-native/animate` — a timeline described once and handed to the
 * engine.
 *
 * The obvious way to animate in a signals runtime is to write the value sixty
 * times a second and let the bindings carry it to the screen. It is about ten
 * lines and it is the wrong shape: every frame becomes a property write from
 * JavaScript, and on a device every property write is a bridge crossing — so
 * the animation runs at whatever rate the JavaScript thread has left over,
 * which is least exactly when something is transitioning.
 *
 * So the whole timeline goes over in one call. The DOM host hands it to the Web
 * Animations API; the Lynx host expresses it as inline transitions. Both then
 * run it off the JavaScript thread entirely.
 */
export const MotionScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      One rule makes the rest of it safe: the signal is the state, and the animation is only how it gets there. An
      animation never leaves a style behind — the element is released back to its own style bag when the timeline ends,
      however it ends.
    </Text>
    <Settling />
    <Cancelling />
    <Looping />
    <Reduced />
  </Stack>
)

/** The ordinary case: write the settled value, then animate from where it was. */
const Settling = (): HostElement => {
  const palette = PaletteContext.use()
  const open = signal(false)
  const outcome = signal('—')
  let sheet!: HostElement

  const toggle = async (): Promise<void> => {
    if (open()) {
      // Animate FIRST on the way out, because the element has to still exist to
      // be animated. Awaiting `finished` is what sequences the removal after it.
      const end = await animate(sheet, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(10px)' }], {
        duration: 180,
        easing: 'ease-in',
      }).finished
      outcome(end)
      open(false)
      return
    }

    // The state first, so the sheet is genuinely open before anything moves. If
    // this host could not animate, or the user had asked for less motion, the
    // sheet would simply be open — which is the correct outcome, not a
    // degraded one.
    open(true)
    const end = await animate(sheet, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1 }], {
      duration: 220,
      easing: 'ease-out',
    }).finished
    outcome(end)
  }

  return (
    <Panel
      title="animate"
      blurb="Two or more keyframes, always: one keyframe describes a destination with no stated origin, which the web can fill in from computed style and a native view tree generally cannot. Requiring the origin is what makes an animation mean the same thing on both, and a tuple makes leaving it out a compile error."
    >
      <Action onTap={() => void toggle()}>{() => (open() ? 'hide the sheet' : 'show the sheet')}</Action>
      <view
        ref={(element) => {
          sheet = element
        }}
        show={open}
        style={() => ({
          padding: 12,
          borderRadius: RADIUS.sm,
          background: palette().surfaceAlt,
          gap: 4,
        })}
      >
        <text style={() => ({ color: palette().text, fontSize: 14 })}>A sheet</text>
        <text style={() => ({ color: palette().muted, fontSize: 12, lineHeight: 18 })}>
          `show` is the state. The fade is only how this arrived, which is why removing the animation entirely would
          leave the screen looking exactly the same once the dust settled.
        </text>
      </view>
      <Readout>{() => `last timeline ended: ${outcome()}`}</Readout>
    </Panel>
  )
}

/** `cancel` / `finish`, and why `finished` resolves rather than rejecting. */
const Cancelling = (): HostElement => {
  const palette = PaletteContext.use()
  const outcome = signal('—')
  let bar!: HostElement
  let running: Animation | null = null

  const start = (): void => {
    running?.cancel()
    outcome('running…')
    const animation = animate(
      bar,
      [
        { opacity: 0.25, width: 40 },
        { opacity: 1, width: 220 },
      ],
      {
        duration: 2_400,
        easing: 'linear',
      },
    )
    running = animation
    void animation.finished.then((end) => {
      outcome(end)
      running = null
    })
  }

  return (
    <Panel
      title="cancel · finish"
      blurb="`finished` RESOLVES on a cancel and reports which happened, rather than rejecting. A rejection would make the ordinary clean-up-afterwards case need a catch that exists only to swallow something that is not an error — and forgetting it costs an unhandled rejection."
    >
      <Row gap="sm">
        <Action onTap={start}>start (2.4s)</Action>
        <Action onTap={() => running?.cancel()}>cancel</Action>
        <Action onTap={() => running?.finish()}>finish</Action>
      </Row>
      <view
        ref={(element) => {
          bar = element
        }}
        style={() => ({ width: 40, height: 12, borderRadius: 999, background: palette().accent })}
      />
      <Readout>{() => `finished → ${outcome()}`}</Readout>
      <Text size="sm" tone="muted">
        Whichever way it ends, the bar snaps back to the 40dp its own style bag asks for. That is the release rule
        working: nothing that ran is still holding the element, so the next `setStyle` has nothing to fight.
      </Text>
    </Panel>
  )
}

/** An infinite timeline, and the cleanup it owes. */
const Looping = (): HostElement => {
  const palette = PaletteContext.use()
  const spinning = signal(false)
  let disc!: HostElement
  let spin: Animation | null = null

  const toggle = (): void => {
    if (spinning()) {
      spin?.cancel()
      spin = null
      spinning(false)
      return
    }
    spinning(true)
    spin = animate(disc, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: 900,
      iterations: Number.POSITIVE_INFINITY,
      easing: 'linear',
    })
  }

  return (
    <Panel
      title="iterations: Infinity"
      blurb="`finish` on an endless animation behaves as `cancel` and reports `cancelled`, because there is no final frame to jump to. Anything endless should be cancelled when its owner goes away — an animation the engine is still running for a disposed subtree is the native equivalent of a leaked interval."
    >
      <Row gap="sm">
        <Action onTap={toggle}>{() => (spinning() ? 'stop' : 'spin')}</Action>
        <Chip tone={() => (spinning() ? 'good' : 'neutral')}>{() => (spinning() ? 'running' : 'idle')}</Chip>
      </Row>
      <view
        ref={(element) => {
          disc = element
        }}
        style={() => ({
          width: 34,
          height: 34,
          borderRadius: 999,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: palette().border,
          borderTopColor: palette().accent,
        })}
      />
      <Readout>
        {[
          'const spin = animate(disc, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {',
          '  duration: 900,',
          '  iterations: Infinity,',
          '})',
          'onCleanup(() => spin.cancel())   // in a component, this is the whole obligation',
        ].join('\n')}
      </Readout>
    </Panel>
  )
}

/** `reduceMotion` — the accessibility signal, and the one flag that overrides it. */
const Reduced = (): HostElement => {
  const palette = PaletteContext.use()
  const still = reduceMotion()
  const log = signal<readonly string[]>([])
  let essential!: HostElement
  let decorative!: HostElement

  const run = async (element: HostElement, name: string, options: { essential?: boolean }): Promise<void> => {
    const started = Date.now()
    await animate(element, [{ opacity: 0.2 }, { opacity: 1 }], { duration: 600, ...options }).finished
    log([`${name}: settled after ${Date.now() - started}ms`, ...log()].slice(0, 4))
  }

  return (
    <Panel
      title="reduceMotion · essential"
      blurb="A user who asked the system for less motion and a host with no animate at all take exactly the same path: nothing moves, `finished` resolves immediately, and the element already shows what it should. Nobody has to branch on either — which is the whole reason skipping is safe."
    >
      <Chip tone={() => (still() ? 'bad' : 'good')}>{() => `reduceMotion: ${still()}`}</Chip>
      <Row gap="sm">
        <Action onTap={() => void run(decorative, 'decorative', {})}>run a decorative fade</Action>
        <Action onTap={() => void run(essential, 'essential', { essential: true })}>run an essential one</Action>
      </Row>
      <Row gap="sm">
        <view
          ref={(element) => {
            decorative = element
          }}
          style={() => ({ width: 60, height: 24, borderRadius: RADIUS.sm, background: palette().surfaceAlt })}
        />
        <view
          ref={(element) => {
            essential = element
          }}
          style={() => ({ width: 60, height: 24, borderRadius: RADIUS.sm, background: palette().accent })}
        />
      </Row>
      <Readout>{() => (log().length === 0 ? '(nothing has run yet)' : log().join('\n'))}</Readout>
      <Show
        when={still}
        fallback={() => (
          <Text size="sm" tone="muted">
            Turn on “reduce motion” in your OS settings and run both again — the decorative one settles in about a
            millisecond and the essential one still takes its 600.
          </Text>
        )}
      >
        {() => (
          <Text size="sm" tone="muted">
            Reduced motion is on right now, so only the essential animation ran. The bar for `essential` is the
            accessibility guidelines' own: motion is essential when removing it would remove INFORMATION, not when
            removing it would make the app feel cheaper. A progress indicator qualifies; a screen transition does not,
            however much work went into it.
          </Text>
        )}
      </Show>
    </Panel>
  )
}
