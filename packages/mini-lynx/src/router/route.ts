import type { PathParams } from '@amritk/mini-helpers'

import type { LynxElement } from '../types'
import type { Route } from './create-router'

/**
 * Defines one route, keeping its pattern's literal type alive so the view is
 * handed params typed from it.
 *
 * A bare object literal in a route table loses that the moment the table is
 * annotated — `readonly Route[]` widens every `path` to `string`, and
 * `PathParams<string>` is the flat record. Nothing is wrong with that; it is
 * what the router always returned. This is the opt-in that does better:
 *
 * ```tsx
 * route('/users/:id', (params) => <User id={() => params().id} />)
 * //                                                     ^ string, and `params().di` will not compile
 * ```
 *
 * ## Why three arguments rather than one object
 *
 * The pattern has to be inferred BEFORE the view can be contextually typed
 * against it, and separate arguments are the shape where that is simply how
 * inference runs rather than a trick that happens to work. Folded into one
 * object literal, the pattern and the metadata compete for inference against an
 * intersection — TypeScript declines to infer through one, so the metadata
 * widens to `Record<string, unknown>` and a tab bar reading `route.label` gets
 * `unknown` back. The three-argument form is uglier for about four characters
 * and keeps both halves.
 *
 * Metadata is the third argument and is opaque to the router, exactly as it is
 * on a hand-written route: `route('/', Home, { label: 'Home', badge: '◻' })`
 * carries `label` and `badge` through to `router.route().route`.
 */
export const route = <P extends string, M extends Record<string, unknown>>(
  path: P,
  view: (params: () => PathParams<P>) => LynxElement,
  meta?: M,
): Route<P> & M => ({ ...meta, path, view }) as Route<P> & M
