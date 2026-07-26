/**
 * The event payloads this framework defines, as opposed to the ones a host
 * happens to emit.
 *
 * There is a real distinction here and it decides who owns the type. An event
 * this vocabulary NAMES — a tap, a scroll, a text input — has a meaning the
 * framework is asserting, so it has to arrive in the same shape on every target
 * or `onScroll={(e) => …}` cannot be written once. An event the vocabulary has
 * never heard of belongs to whoever installed the host, and guessing at it would
 * be wrong on some target.
 *
 * So hosts normalise these, exactly as they already normalise a `class` array
 * into a string and a bare `100` into `100px`. It is the same principle applied
 * to the half of the contract that flows back out.
 */

/**
 * What every normalised event carries.
 *
 * `raw` is the deliberate escape hatch, and it is deliberately `unknown`. The
 * fields above it are portable *because* they discard everything target-specific
 * — modifier keys on the web, touch force on a device — and an app that needs
 * one of those has nowhere else to go. Typing it `unknown` means reaching for it
 * costs a cast, which is exactly the visibility it should have: touching `raw`
 * is writing platform-specific code, and that should be greppable rather than
 * ambient.
 */
export type NativeEvent = {
  readonly raw: unknown
}

/**
 * A tap or a long press.
 *
 * The coordinates are OPTIONAL, and that is the honest part rather than an
 * oversight. Not every activation has a position: pressing Enter on a focused
 * button on the web, or triggering it through an assistive technology on a
 * device, produces a genuine tap with no point attached. Reporting `0, 0` for
 * those would be a lie that lands a ripple in the corner, so the absence is
 * modelled instead — and a component that wants a position can fall back to its
 * own centre, which is what it wanted anyway.
 *
 * Coordinates are relative to the element's OWN box on every target. A
 * viewport-relative point means something different once a native screen has
 * safe-area insets, so the only frame both targets can agree on is the local
 * one.
 */
export type TapEvent = NativeEvent & {
  readonly x?: number
  readonly y?: number
}

/** A scroll position, in the scroll container's own content coordinates. */
export type ScrollEvent = NativeEvent & {
  readonly x: number
  readonly y: number
}

/**
 * Text changing in an `input`.
 *
 * The value is on the event because reading it back off the element is the one
 * thing a handler always wants and the one thing that differs per target.
 */
export type InputEvent = NativeEvent & {
  readonly value: string
}
