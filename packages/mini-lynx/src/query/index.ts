/**
 * `@amritk/mini-lynx/query` — a thin adapter bridging `@tanstack/query-core`
 * observers to signals, so an app gets caching, deduplication, retries, and
 * invalidation without this package hand-rolling a resource primitive.
 *
 * It is a verbatim port of `@amritk/mini/query`, and that is worth stating
 * rather than glossing: fetching and caching have nothing underneath them, and
 * query-core has no opinion about what renders the result, so the entire layer
 * crossed over untouched — and then survived the rewrite to a Lynx-only runtime
 * untouched again. Where `/forms` needed one file written twice — a form
 * eventually has to touch a control — nothing here touches an element at all.
 *
 * Its own module graph, and `@tanstack/query-core` is an optional peer: the `.`
 * entry is untouched, and only an app that imports `/query` needs it installed.
 */
export type { QueryResult } from './create-query'
export { createQuery } from './create-query'
