import { type HostElement, signal } from '@amritk/mini-native'
import { Show } from '@amritk/mini-native/flow'
import { pan, swipe } from '@amritk/mini-native/gestures'
import { Row, Stack, Text } from '@amritk/mini-native/ui'

import { Action, Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext, RADIUS } from '../theme'

/**
 * `@amritk/mini-native/gestures` — two layers, and the split is what makes
 * gestures portable at all. The HOST normalises a browser's Pointer Events and
 * an engine's touch events into one shape; the RECOGNISERS are arithmetic over
 * that stream and know nothing about any platform.
 */
export const GesturesScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      Drag with a mouse or a finger — both arrive as the same PointerEvent, because normalising them is the one part
      that cannot be written once and the host already did it. Adding gestures cost the Host contract nothing:
      addEventListener was already there.
    </Text>
    <PanDemo />
    <SwipeDemo />
    <RawStream />
  </Stack>
)

/** `pan` — subtraction over the pointer stream, with a real cancel case. */
const PanDemo = (): HostElement => {
  const palette = PaletteContext.use()
  const dx = signal(0)
  const dy = signal(0)
  const phase = signal('idle')

  return (
    <Panel
      title="pan"
      blurb="onEnd reports whether the gesture was CANCELLED — the target taking it away, a scroll container claiming the drag, a phone call arriving — rather than completed. Committing on a cancel means committing gestures nobody made."
    >
      <view
        label="Drag me"
        style={() => ({
          height: 140,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.md,
          background: palette().surfaceAlt,
          overflow: 'hidden',
          touchAction: 'none',
        })}
      >
        <view
          ref={(element) => {
            pan(element, {
              onStart: () => phase('dragging'),
              onMove: (event) => {
                dx(Math.round(event.dx))
                dy(Math.round(event.dy))
              },
              onEnd: (event) => {
                phase(event.cancelled ? 'cancelled' : 'ended')
                dx(0)
                dy(0)
              },
            })
          }}
          style={() => ({
            width: 88,
            height: 88,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: RADIUS.md,
            background: palette().accent,
            transform: `translate(${dx()}px, ${dy()}px)`,
            touchAction: 'none',
          })}
        >
          <text style={() => ({ color: palette().onAccent, fontSize: 13 })}>drag me</text>
        </view>
      </view>
      <Readout>{() => `phase: ${phase()}\ndx: ${dx()}  dy: ${dy()}`}</Readout>
    </Panel>
  )
}

/** `swipe` — `pan` plus a threshold, and one direction per flick. */
const SwipeDemo = (): HostElement => {
  const palette = PaletteContext.use()
  const present = signal(true)
  const last = signal('—')

  return (
    <Panel
      title="swipe"
      blurb="Built on pan, so a pinch or a rotate would be built on the same stream. The dominant axis wins outright: a diagonal flick is one swipe, not two, or every handler would be deduplicating them. Distance alone is not enough — a slow careful drag is a long pan, not a flick."
    >
      <Show
        when={present}
        fallback={() => (
          <Row gap="sm">
            <Chip tone="bad">dismissed</Chip>
            <Action onTap={() => present(true)}>bring it back</Action>
          </Row>
        )}
      >
        {() => (
          <view
            ref={(element) => {
              swipe(element, {
                onSwipe: (event) => {
                  last(`${event.direction} · ${Math.round(event.distance)}dp · ${event.velocity.toFixed(2)}dp/ms`)
                  if (event.direction === 'left') present(false)
                },
              })
            }}
            style={() => ({
              padding: 16,
              borderRadius: RADIUS.md,
              background: palette().surfaceAlt,
              touchAction: 'none',
            })}
          >
            <text style={() => ({ color: palette().text, fontSize: 14 })}>
              flick me — left dismisses, the others just report
            </text>
          </view>
        )}
      </Show>
      <Readout>{() => `last swipe: ${last()}`}</Readout>
    </Panel>
  )
}

/** `onPointer` — the raw material, and why the recognisers exist above it. */
const RawStream = (): HostElement => {
  const palette = PaletteContext.use()
  const log = signal<readonly string[]>([])

  return (
    <Panel
      title="onPointer"
      blurb="One handler covers all four phases, because a gesture is a sequence and splitting it across four props would mean reassembling it at every call site. Reach for pan and swipe before reaching for this."
    >
      <view
        label="Pointer surface"
        onPointer={(event) =>
          log(
            [
              `${event.phase.padEnd(6)} id=${event.id} (${Math.round(event.x)}, ${Math.round(event.y)})`,
              ...log(),
            ].slice(0, 6),
          )
        }
        style={() => ({
          height: 96,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: palette().border,
          touchAction: 'none',
        })}
      >
        <text style={() => ({ color: palette().muted, fontSize: 13 })}>press and move here</text>
      </view>
      <Readout>{() => (log().length === 0 ? '(no pointers yet)' : log().join('\n'))}</Readout>
      <Text size="sm" tone="muted">
        `id` is what makes multi-touch expressible: two fingers are two streams, and without an identity to key them by
        there is no telling a pinch from a fast pan.
      </Text>
    </Panel>
  )
}
