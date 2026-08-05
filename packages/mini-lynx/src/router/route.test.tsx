import type { PathParams, RouteParams } from '@amritk/mini-helpers'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import { createFakeEngine } from '../testing/create-fake-engine'
import type { LynxElement } from '../types'
import type { Route } from './create-router'
import { route } from './route'

// The views below build real elements, so there has to be an engine — even
// though what is under test is the object the helper returns, not the tree.
beforeEach(() => {
  setEngine(createFakeEngine().api)
})

afterEach(() => {
  clearEngine()
})

/**
 * Half of this file is checked by `types:check` rather than by running —
 * `expectTypeOf` compiles to nothing, and the inference IS the feature. The
 * runtime half is short on purpose: the helper builds an object.
 */
describe('route', () => {
  it('carries the pattern, the view and the metadata through', () => {
    const view = (): LynxElement => <view />
    const defined = route('/users/:id', view, { label: 'Users' })

    expect(defined.path).toBe('/users/:id')
    expect(defined.view).toBe(view)
    expect(defined.label).toBe('Users')
  })

  it('works with no metadata at all', () => {
    expect(route('/', () => <view />).path).toBe('/')
  })

  it('cannot have its own keys overwritten by metadata', () => {
    // `path` and `view` are written after the spread, so a stray `path` in the
    // metadata cannot quietly become the route's pattern.
    const defined = route('/real', () => <view />, { path: '/fake' } as Record<string, unknown>)
    expect(defined.path).toBe('/real')
  })

  it('types the view params from the pattern', () => {
    route('/users/:id', (params) => {
      expectTypeOf(params).toEqualTypeOf<() => { id: string }>()
      expectTypeOf(params().id).toEqualTypeOf<string>()
      return <view />
    })
  })

  it('types several params, and a wildcard as `rest`', () => {
    route('/users/:id/posts/:postId', (params) => {
      expectTypeOf(params()).toEqualTypeOf<{ id: string; postId: string }>()
      return <view />
    })
    route('/files/*', (params) => {
      expectTypeOf(params()).toEqualTypeOf<{ rest: string }>()
      return <view />
    })
  })

  it('rejects a param the pattern does not name', () => {
    route('/users/:id', (params) => {
      // @ts-expect-error `owner` is not a param of `/users/:id`.
      params().owner
      return <view />
    })
  })

  it('keeps the metadata narrow rather than widening it to unknown', () => {
    // The reason the helper takes three arguments instead of one object: a tab
    // bar reads `route.label` off the table, and `unknown` there would push the
    // cast this whole change exists to remove straight back into the app.
    const defined = route('/', () => <view />, { label: 'Home', nav: true })
    expectTypeOf(defined.label).toEqualTypeOf<string>()
    expectTypeOf(defined.nav).toEqualTypeOf<boolean>()
  })

  it('is assignable to a widened route table, losing only the params type', () => {
    // What an app annotating `readonly Route[]` gets: the table still holds, and
    // the views inside it were already checked against their own patterns.
    const table: readonly Route[] = [route('/', () => <view />), route('/users/:id', () => <view />)]
    expect(table).toHaveLength(2)
    expectTypeOf<PathParams<string>>().toEqualTypeOf<RouteParams>()
  })
})
