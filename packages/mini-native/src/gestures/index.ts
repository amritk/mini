/**
 * Gesture recognisers — pure arithmetic over the normalised pointer stream.
 *
 * The design here is two layers, and the split is what makes gestures portable
 * at all.
 *
 * **The host normalises**, turning a browser's Pointer Events and an engine's
 * touch events into one `PointerEvent` shape: an id, a position in the
 * element's own box, and a phase. That is the only part that cannot be written
 * once, and it needed no new host method — `addEventListener` already existed,
 * so this cost the contract nothing.
 *
 * **The recognisers are arithmetic.** `pan` and `swipe` know nothing about any
 * platform; they are subtraction and a threshold over a stream that has already
 * been reconciled. Written once, they run everywhere by construction rather
 * than by anyone maintaining two versions.
 *
 * They live on a subpath because only some apps need them, and they compose:
 * `swipe` is built on `pan`, and a pinch or a rotate would be built on the same
 * stream — `PointerEvent.id` is what makes multi-touch expressible, since two
 * fingers are two streams and without an identity to key them by there is no
 * telling a pinch from a fast pan.
 *
 * ## What is deliberately not here
 *
 * **Pinch and rotate.** Both are writable over the stream above and neither has
 * been written, because the two-finger cases worth shipping are the ones a real
 * screen asked for — a map, a photo viewer — and guessing at their thresholds
 * before then is how a recogniser ends up tuned for nothing.
 *
 * **Anything that fights the scroll container.** A recogniser here observes; it
 * never claims a gesture away from the target's own scrolling, because the two
 * platforms resolve that conflict in genuinely different places and pretending
 * otherwise would be a promise this layer cannot keep.
 *
 * @example
 * ```tsx
 * import { pan, swipe } from '@amritk/mini-native/gestures'
 *
 * const offset = signal(0)
 *
 * <view
 *   ref={(element) => {
 *     pan(element, { onMove: (event) => offset(event.dx), onEnd: () => offset(0) })
 *     swipe(element, { onSwipe: (event) => event.direction === 'left' && dismiss() })
 *   }}
 *   style={() => ({ transform: `translateX(${offset()}px)` })}
 * />
 * ```
 */

export { type PanEvent, type PanHandlers, pan } from './pan'
export { type SwipeDirection, type SwipeEvent, type SwipeOptions, swipe } from './swipe'
