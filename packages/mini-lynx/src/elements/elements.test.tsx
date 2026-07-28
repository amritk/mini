import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import { mount } from '../mount'
import { createFakeEngine } from '../testing/create-fake-engine'
import { invoke } from './invoke'
import { querySelector, querySelectorAll } from './query'

afterEach(clearEngine)

/** A small tree with ids, classes and nesting, so a selector has something to be wrong about. */
const Tree = () => (
  <view class="page">
    <view id="feed" class="list surface">
      <view class="row selected">
        <text class="label" />
      </view>
      <view class="row">
        <text class="label" />
      </view>
    </view>
    <scroll-view class="row" />
  </view>
)

const render = () => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  mount(engine.pageElement, Tree)
  return engine
}

describe('querySelector', () => {
  it('finds by tag, id and class', () => {
    const engine = render()

    expect(querySelector('#feed')).toBe(engine.findAll('view')[1])
    expect(querySelector('.selected')).toBe(engine.findAll('view')[2])
    expect(querySelector('scroll-view')).toBe(engine.find('scroll-view'))
  })

  it('returns null rather than undefined when nothing matches', () => {
    render()

    // `__QuerySelector` reports a miss as `undefined`; a JavaScript API that
    // means "looked and found nothing" should say `null`, and every call site
    // should not have to know the difference.
    expect(querySelector('#nothing')).toBeNull()
  })

  it('matches a compound selector on every part, not just the first', () => {
    const engine = render()

    expect(querySelector('view.row.selected')).toBe(engine.findAll('view')[2])
    // A scroll-view carries `.row` too, so a tag-less `.row` would find it.
    expect(querySelector('scroll-view.row')).toBe(engine.find('scroll-view'))
    expect(querySelector('view.row.missing')).toBeNull()
  })

  it('scopes a descendant selector to the left-hand side', () => {
    const engine = render()

    expect(querySelectorAll('#feed .label')).toHaveLength(2)
    // The scroll-view's `.row` is not under #feed, so it must not be counted.
    expect(querySelectorAll('#feed .row')).toHaveLength(2)
    expect(querySelectorAll('.row')).toHaveLength(3)
    expect(querySelector('#feed .row')).toBe(engine.findAll('view')[2])
  })

  it('searches inside an explicit root rather than the page', () => {
    const engine = render()
    const feed = engine.findAll('view')[1]

    expect(querySelectorAll('.row', feed as never)).toHaveLength(2)
    // The root itself is not a candidate, matching the engine's own descendant
    // semantics — `el.querySelector` never returns `el`.
    expect(querySelector('#feed', feed as never)).toBeNull()
  })

  it('returns matches in tree order across a selector list', () => {
    const engine = render()

    // `.label` appears after `#feed` in the tree; the comma group must not
    // decide the order.
    const found = querySelectorAll('.label, #feed')
    expect(found[0]).toBe(engine.findAll('view')[1])
    expect(found).toHaveLength(3)
  })
})

describe('the fake engine’s selector subset', () => {
  it('throws on a selector it does not implement, rather than matching nothing', () => {
    render()

    // The engine supports more than this fake does. Reporting a child
    // combinator as "no matches" would be indistinguishable from a genuine
    // miss, which is how a test comes to assert the opposite of the device.
    expect(() => querySelectorAll('view > .row')).toThrow(/not/)
    expect(() => querySelectorAll('[data-x]')).toThrow(/not/)
  })
})

describe('invoke', () => {
  it('resolves with the engine’s data when the code is zero', async () => {
    const engine = render()
    engine.onInvoke('boundingClientRect', () => ({ code: 0, data: { width: 320, height: 48 } }))

    await expect(invoke(engine.find('scroll-view') as never, 'boundingClientRect')).resolves.toEqual({
      width: 320,
      height: 48,
    })
  })

  it('rejects on a non-zero code, carrying the engine’s payload', async () => {
    const engine = render()
    engine.onInvoke('scrollTo', () => ({ code: 3, data: 'out of range' }))

    // The polarity is the whole point of this wrapper: zero is success, and
    // every call site getting that backwards once is the alternative.
    await expect(invoke(engine.find('scroll-view') as never, 'scrollTo', { offset: 99 })).rejects.toThrow(
      /out of range/,
    )
  })

  it('rejects for a method the element does not implement', async () => {
    const engine = render()

    await expect(invoke(engine.find('scroll-view') as never, 'noSuchMethod')).rejects.toThrow(/noSuchMethod/)
  })

  it('passes the parameters through and schedules a commit', async () => {
    const engine = render()
    engine.onInvoke('scrollToPosition', () => ({ code: 0 }))
    engine.clearCalls()

    await invoke(engine.find('scroll-view') as never, 'scrollToPosition', { position: 4, smooth: true })

    expect(engine.calls()).toContainEqual(expect.stringContaining('"scrollToPosition", {"position":4,"smooth":true}'))
    // A method commonly acts on state this tick only just wrote, so the commit
    // is scheduled with it rather than left to whatever flushes next.
    await Promise.resolve()
    expect(engine.calls()).toContain('__FlushElementTree()')
  })

  it('does not mutate the caller’s params object', async () => {
    const engine = render()
    engine.onInvoke('scrollTo', () => ({ code: 0 }))
    const params = { offset: 0 }

    await invoke(engine.find('scroll-view') as never, 'scrollTo', params)

    expect(params).toEqual({ offset: 0 })
  })
})
