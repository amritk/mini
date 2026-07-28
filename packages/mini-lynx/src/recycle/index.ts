/**
 * `@amritk/mini-lynx/recycle` — `<list>`'s cell recycler.
 *
 * `For` and `list()` build every row. That is right for a collection a screen
 * can show and wrong for the ten thousand rows `<list>` exists for, because
 * every row is a real element on the main thread whether or not anyone can see
 * it. `recycle` hands cell ownership to the engine: it keeps a pool of the dozen
 * or so elements the viewport needs, and answers the engine's requests from it.
 *
 * Reach for it when the collection is unbounded or large enough that realising
 * it costs a visible pause. Below that, `For` is simpler and cheaper.
 *
 * @example
 * ```tsx
 * import { recycle } from '@amritk/mini-lynx/recycle'
 * ```
 */

export { type RecycleProps, recycle } from './recycle'
