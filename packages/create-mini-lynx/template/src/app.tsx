import { type LynxElement, signal } from '@amritk/mini-lynx'
import { For, Show } from '@amritk/mini-lynx/flow'

/**
 * The app. Every line of this file runs unchanged on a device.
 *
 * The tags, the attribute names and the event names are Lynx's own — there is
 * no vocabulary in between — so the engine's documentation applies to this code
 * verbatim. Styling is a stylesheet (`styles.css`), because Lynx has real CSS.
 *
 * The model to hold on to: a component runs **once**. It creates real elements
 * and returns them, and the signals it read along the way keep mutating those
 * same elements forever. There is no virtual tree, no diff and no re-render, so
 * a value that changes has to reach the element as a *getter* — `() => count()`
 * — and never as a called value.
 */
export const App = (): LynxElement => {
  const count = signal(0)
  const taps = signal<Tap[]>([])

  const bump = (by: number) => (): void => {
    const next = count() + by
    count(next)
    // Newest first, and capped: a list is the one place a starter is worth
    // showing keyed, because that is what the reconciler needs to move a row
    // rather than rebuild it.
    taps([{ id: nextId(), label: `${by > 0 ? '+' : '−'}1 → ${next}` }, ...taps()].slice(0, 6))
  }

  return (
    <view class="app">
      <view class="header">
        <text class="title">
          <raw-text text="mini-lynx" />
        </text>
        <text class="subtitle">
          <raw-text text="signals over Lynx — no virtual tree" />
        </text>
      </view>

      <view class="card">
        <text class="count">
          {/* A getter, not `count()`. Calling it here would read the value once
              and pin the text to it forever. */}
          <raw-text text={() => String(count())} />
        </text>

        <view class="row">
          <Button label="−1" onTap={bump(-1)} />
          <Button label="+1" onTap={bump(1)} />
        </view>
      </view>

      <view class="card">
        <text class="card-title">
          <raw-text text="Recent taps" />
        </text>
        <Show when={() => taps().length > 0} fallback={() => <Empty />}>
          <For each={taps} key={(tap) => String(tap.id)}>
            {(tap) => (
              <view class="tap">
                <text class="tap-label">
                  <raw-text text={tap.label} />
                </text>
              </view>
            )}
          </For>
        </Show>
      </view>
    </view>
  )
}

type Tap = { id: number; label: string }

let id = 0
const nextId = (): number => (id += 1)

type ButtonProps = { label: string; onTap: () => void }

/**
 * Lynx has no `<button>`: a tappable thing is a `<view>` with a `bindtap`, and
 * the accessibility attributes are what make it a button to a screen reader.
 * Handlers run on the main thread, in the same frame as the gesture — which is
 * a gift, and the reason heavy work in one blocks rendering.
 */
const Button = (props: ButtonProps): LynxElement => (
  <view
    class="button"
    accessibility-element={true}
    accessibility-traits="button"
    accessibility-label={props.label}
    bindtap={props.onTap}
  >
    <text class="button-label">
      <raw-text text={props.label} />
    </text>
  </view>
)

const Empty = (): LynxElement => (
  <text class="empty">
    <raw-text text="Nothing yet — tap a button." />
  </text>
)
