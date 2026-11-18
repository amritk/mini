import { describe, expectTypeOf, it } from 'vitest'

import { matchRoute } from './match-route'
import type { PathParams } from './path-params'

/**
 * A type has no runtime, so every assertion here is checked by `types:check`
 * rather than by running — `expectTypeOf` compiles to nothing. The `it` blocks
 * are what make a failure name the case that broke.
 *
 * The pairing with `match-route.test.ts` is the point: that file pins what the
 * matcher DOES, this one pins what the compiler is told it does, and a change
 * to the grammar that updated only one of them should fail here.
 */
describe('PathParams', () => {
  it('captures a named param', () => {
    expectTypeOf<PathParams<'/users/:id'>>().toEqualTypeOf<{ id: string }>()
  })

  it('captures several params across segments', () => {
    expectTypeOf<PathParams<'/users/:id/posts/:postId'>>().toEqualTypeOf<{ id: string; postId: string }>()
  })

  it('captures a trailing wildcard as `rest`', () => {
    expectTypeOf<PathParams<'/files/*'>>().toEqualTypeOf<{ rest: string }>()
  })

  it('captures a param and a wildcard together', () => {
    expectTypeOf<PathParams<'/users/:id/*'>>().toEqualTypeOf<{ id: string; rest: string }>()
  })

  it('has nothing to read on a literal pattern', () => {
    expectTypeOf<PathParams<'/about'>>().toEqualTypeOf<Record<never, string>>()
    expectTypeOf<PathParams<'/'>>().toEqualTypeOf<Record<never, string>>()
  })

  it('treats a colon inside a segment as a literal, exactly as the matcher does', () => {
    // `matchRoute` tests `startsWith(':')`, so `/v:major` is a literal segment.
    // A type that split on `:` instead would disagree with the runtime.
    expectTypeOf<PathParams<'/v:major'>>().toEqualTypeOf<Record<never, string>>()
  })

  it('widens to the flat record when the pattern is only a string', () => {
    // The escape hatch for a table with no literals left — a `Route[]`
    // annotation, a manifest, anything built at runtime.
    expectTypeOf<PathParams<string>>().toEqualTypeOf<Record<string, string>>()
  })

  it('types what matchRoute hands back', () => {
    expectTypeOf(matchRoute('/users/:id', '/users/42')).toEqualTypeOf<{ id: string } | null>()
    expectTypeOf(matchRoute('/about', '/about')).toEqualTypeOf<Record<never, string> | null>()

    const pattern: string = '/users/:id'
    expectTypeOf(matchRoute(pattern, '/users/42')).toEqualTypeOf<Record<string, string> | null>()
  })
})
