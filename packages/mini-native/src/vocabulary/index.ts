/**
 * The element vocabulary — every tag Lynx's engine builds, derived from
 * `@lynx-js/types` rather than transcribed from it.
 *
 * `jsx-runtime.ts` reaches in here for `JSX.IntrinsicElements`, so importing
 * this barrel is not something an app normally has to do. It is exported for
 * the case that does need a name: a component that forwards a tag's props.
 *
 * @example
 * ```tsx
 * import type { IntrinsicElements } from '@amritk/mini-native'
 *
 * type CardProps = IntrinsicElements['view'] & { title: string }
 *
 * const Card = ({ title, ...rest }: CardProps) => (
 *   <view {...rest}>
 *     <text>{title}</text>
 *   </view>
 * )
 * ```
 */

export type { IntrinsicElements } from './intrinsic'
export type { MiniProps } from './mini-props'
