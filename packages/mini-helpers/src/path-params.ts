import type { RouteParams } from './match-route'

/**
 * What a route pattern captures, as a type — the compile-time half of
 * {@link matchRoute}.
 *
 * `matchRoute('/users/:id', path)` returns `{ id: '42' }` at runtime, and this
 * is the same statement made to the compiler: `PathParams<'/users/:id'>` is
 * `{ id: string }`. A view written against it reads `params().id` rather than
 * `params()['id']`, and a typo stops being a value that is `string` at compile
 * time and `undefined` at runtime.
 *
 * It lives here rather than in either router because the grammar it mirrors
 * lives here. The two are one definition of what a pattern means, split across
 * the value and type worlds, and they would drift the moment they sat in
 * different packages — which is the whole reason this package exists.
 *
 * ```ts
 * type A = PathParams<'/users/:id'>          // { id: string }
 * type B = PathParams<'/users/:id/posts/:p'> // { id: string; p: string }
 * type C = PathParams<'/files/*'>            // { rest: string }
 * type D = PathParams<'/about'>              // {} — nothing to read
 * ```
 *
 * ## The widening escape hatch
 *
 * `PathParams<string>` is `RouteParams`, deliberately. A route table typed as
 * `Route[]` — or built at runtime, or read from a manifest — has no literal to
 * extract anything from, and the honest answer there is the record the router
 * has always returned. That fallback is what makes this a strict addition:
 * every table that compiled before still compiles, and only the ones that keep
 * their literals get the narrower type.
 */
export type PathParams<P extends string> = string extends P ? RouteParams : { [Key in ParamKeys<P>]: string }

/**
 * The names a pattern captures, as a union — `never` when it captures nothing,
 * which maps to `{}` above.
 *
 * Recursion is over `/`-separated segments rather than over `:` occurrences,
 * because the grammar is per-segment: `/v:major` is a literal to
 * {@link matchRoute}, which tests `startsWith(':')`, and splitting on `:` would
 * make it a param here. A type that disagreed with the matcher about that would
 * be worse than no type at all.
 */
type ParamKeys<P extends string> = P extends `${infer Head}/${infer Rest}`
  ? SegmentKey<Head> | ParamKeys<Rest>
  : SegmentKey<P>

/** The name one segment captures, or `never` when it is a literal to match. */
type SegmentKey<S extends string> = S extends `:${infer Name}` ? Name : S extends '*' ? 'rest' : never
