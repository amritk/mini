import { appendChildren } from '../append-children'
import { applyProp } from '../apply-prop'
import type { LynxElement } from '../engine/element-api'
import { reducedMotion } from '../reduced-motion'
import { createElement } from '../tree'
import type { ClassValue, ContainerChildren, MaybeReactive, StyleValue } from '../types'
import { focusedField } from './avoid-keyboard'
import { keepAboveKeyboard } from './keep-above-keyboard'
import { keyboardLift } from './keyboard-lift'

/**
 * How a container gets out of the keyboard's way.
 *
 * - `translate` moves the whole container up, by exactly what the focused field
 *   needs and no more. The guarantee is direct — the field is above the keyboard
 *   because the container was moved until it was — and it needs no scroller,
 *   which is why it is the default. The cost is that content at the top moves
 *   off the top.
 * - `padding` leaves the container where it is and reserves the keyboard's
 *   height at the bottom, so a `<scroll-view>` inside it keeps a viewport that
 *   ends where the keys begin. Nothing is pushed off screen, and reaching a
 *   field low in a long form is then a scroll — the app's, or the user's.
 */
export type KeyboardAvoidingBehavior = 'translate' | 'padding'

/** Props for {@link KeyboardAvoiding}. */
export type KeyboardAvoidingProps = {
  /** How to move out of the way. Defaults to `'translate'`. */
  behavior?: KeyboardAvoidingBehavior
  /** An extra gap to keep above the keyboard. */
  offset?: MaybeReactive<number>
  /**
   * How much of the keyboard's height an ancestor already pads for — the bottom
   * safe-area inset, and on a non-immersive Android app the navigation bar.
   * See {@link KeyboardLiftOptions.inset}, which this is.
   */
  inset?: MaybeReactive<number>
  /**
   * Which element must stay visible, for `translate`. Defaults to the focused
   * field, which is whatever control carries `ref={avoidKeyboard}`.
   */
  field?: () => LynxElement | null
  /** What counts as the bottom of the screen when measuring. Defaults to the page element. */
  bounds?: LynxElement
  /**
   * The CSS transition the movement runs with, or `false` for none. Defaults to
   * a quarter-second on whichever property the behaviour moves.
   *
   * A reduced-motion preference drops it either way — the runtime consults
   * {@link reducedMotion} here so an app does not have to, exactly as
   * `RouteStack` does.
   */
  transition?: string | false
  /** Class for the container. */
  class?: MaybeReactive<ClassValue>
  /**
   * Style for the container. The declaration this component owns —
   * `transform` or `padding-bottom`, plus the transition — is laid OVER it, so
   * a transform of your own belongs on a child rather than here.
   */
  style?: MaybeReactive<StyleValue | null>
  /** Called with the container once built. */
  ref?: (element: LynxElement) => void
  children: ContainerChildren
}

/**
 * A container that keeps the soft keyboard from covering what is inside it.
 *
 * ```tsx
 * // once, at startup
 * setEngine(globalEngine())
 * trackKeyboard()
 *
 * // anywhere a form is
 * <KeyboardAvoiding>
 *   <input ref={avoidKeyboard} placeholder="email" />
 *   <input ref={avoidKeyboard} type="password" />
 * </KeyboardAvoiding>
 * ```
 *
 * That is the whole wiring. The inputs report their own focus through `ref`,
 * this reads the keyboard height as a signal, and the container rises by the
 * measured overlap — no context, no provider, and no prop threaded from the
 * input to the thing that moves.
 *
 * Nothing happens until {@link trackKeyboard} has been called, because nothing
 * is feeding {@link keyboardHeight} until then. That is the one line an app
 * owes this subpath, and forgetting it looks like a container that never moves.
 *
 * ## Why a plain `view` with no layout opinion
 *
 * Because a container that quietly became a flex column would change the layout
 * of everything an app wrapped in it, and Lynx's default display is `linear`
 * rather than `flex` — so any default picked here would be wrong for somebody in
 * the quiet way where children lay out along the other axis. The only
 * declaration this component writes is the one that moves it. Style the
 * container yourself, exactly as you would style any other `view`.
 *
 * ## One mover per subtree
 *
 * A field inside two of these rises twice. When a screen has both a scrolling
 * body and a composer bar pinned to the bottom, the body is the `padding` one
 * and the bar is the `translate` one — siblings, never nested.
 */
export const KeyboardAvoiding = (props: KeyboardAvoidingProps): LynxElement => {
  const container = createElement('view')
  const behavior = props.behavior ?? 'translate'
  const lift = keyboardLift({ inset: props.inset ?? 0, offset: props.offset ?? 0 })

  // `padding` reserves the keyboard's whole height, so it wants the lift itself.
  // `translate` moves the container, so it wants the measured overlap — which is
  // the lift when nothing has said which field matters.
  const distance =
    behavior === 'padding'
      ? lift
      : keepAboveKeyboard({
          field: props.field ?? focusedField,
          lift,
          ...(props.bounds ? { bounds: props.bounds } : {}),
        })

  const transition = props.transition ?? DEFAULT_TRANSITION[behavior]

  applyProp(container, 'style', () => {
    const base = typeof props.style === 'function' ? props.style() : props.style
    const value = distance()
    const motion = transition === false || reducedMotion() ? {} : { transition }

    return {
      ...base,
      ...motion,
      // A bare number is density-independent pixels here, which is what
      // `padding-bottom` wants; `translateY` is a CSS function and takes its own
      // unit, so that one is spelled out.
      ...(behavior === 'padding' ? { paddingBottom: value } : { transform: `translateY(${-value}px)` }),
    }
  })

  if (props.class !== undefined) applyProp(container, 'class', props.class)
  props.ref?.(container)
  appendChildren(container, props.children)

  return container
}

/**
 * The transition each behaviour moves with by default.
 *
 * Named per property rather than as `all`, because `all` on a container also
 * animates whatever else an app's own style writes to it — and a padding change
 * dragging an unrelated colour change along with it is a bug nobody would think
 * to look for here.
 */
const DEFAULT_TRANSITION: Record<KeyboardAvoidingBehavior, string> = {
  translate: 'transform 0.25s',
  padding: 'padding-bottom 0.25s',
}
