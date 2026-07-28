/**
 * `@amritk/mini-lynx/gestures` — declaring one recogniser as related to another.
 *
 * This subpath is **not** how you handle a tap. `bindtap`, `catchtap`, the
 * capture phase and the touch stream are all ordinary props on an element and
 * cover recognising a gesture perfectly well, including by hand.
 *
 * What they cannot express is arbitration: a tap that must lose to a pan already
 * under way, a pinch and a rotation sharing one pair of fingers, a pan that
 * hands off to a fling. That is what the engine's gesture system is actually
 * for, and it is all this module exposes.
 *
 * @example
 * ```tsx
 * import { GestureType, nextGestureId, setGestureDetector } from '@amritk/mini-lynx/gestures'
 * ```
 */

export {
  type GestureDetector,
  type GestureRelations,
  GestureType,
  type GestureTypeValue,
  nextGestureId,
  setGestureDetector,
} from './set-gesture-detector'
