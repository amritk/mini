import { describe, expect, it } from 'vitest'

import { mergeStyle } from './merge-style'

describe('merge-style', () => {
  it('returns the base untouched when the caller said nothing', () => {
    const base = { display: 'flex' }

    expect(mergeStyle(base, undefined)).toBe(base)
  })

  it('lays a static style over the base', () => {
    expect(mergeStyle({ display: 'flex' }, { padding: 16 })).toEqual({ display: 'flex', padding: 16 })
  })

  it('lets the caller win on a shared key', () => {
    expect(mergeStyle({ flexDirection: 'column' }, { flexDirection: 'row' })).toEqual({ flexDirection: 'row' })
  })

  it('hands a getter back as a getter', () => {
    let padding = 8
    const merged = mergeStyle({ display: 'flex' }, () => ({ padding }))

    expect(typeof merged).toBe('function')

    // The point of the whole helper: reading it again has to see the new value,
    // or a reactive style would have been frozen on the way through.
    padding = 24
    expect((merged as () => object)()).toEqual({ display: 'flex', padding: 24 })
  })

  it('treats a getter that returns null as nothing to lay over', () => {
    const merged = mergeStyle({ display: 'flex' }, () => null)

    expect((merged as () => object)()).toEqual({ display: 'flex' })
  })
})
