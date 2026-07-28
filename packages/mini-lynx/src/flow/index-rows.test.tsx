import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearEngine, mount, setEngine, signal } from '../index'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { For } from './for'
import { Index } from './index-rows'

/**
 * The console, reached through `globalThis` rather than as an ambient global.
 *
 * This package type-checks without any platform library — that absence is what
 * proves the runtime carries no DOM dependency — and `console` is a host global
 * rather than part of ECMAScript, so it has to be named explicitly here just as
 * `warn.ts` does in the source.
 */
const consoleLike = (globalThis as unknown as { console: { warn: (...data: readonly unknown[]) => void } }).console

afterEach(() => {
  clearEngine()
})

/**
 * The label of every row, which is what each ordering assertion cares about.
 *
 * A row is a `<text>` and its string lives one level down in a `raw-text`
 * element's `text` attribute — Lynx has no text nodes.
 */
const rows = (container: FakeElement): string[] =>
  container.children.map((row) => String(row.children[0]?.attrs['text'] ?? ''))

/** The container `Index` reconciles rows into, which is the mounted tree's only child. */
const containerOf = (engine: FakeEngine): FakeElement => engine.page.children[0] as FakeElement

describe('index-rows', () => {
  it('renders a row per position, repeats included', () => {
    // `For` with the default key would hand both "red" rows one key here, warn,
    // and drop one. Position identity is what makes the list renderable.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const tags = signal(['red', 'red', 'blue'])

    mount(engine.pageElement, () => <Index each={tags}>{(tag) => <text>{() => tag()}</text>}</Index>)

    expect(rows(containerOf(engine))).toEqual(['red', 'red', 'blue'])
  })

  it('renders into a wrapper by default', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const tags = signal(['red'])

    mount(engine.pageElement, () => <Index each={tags}>{(tag) => <text>{() => tag()}</text>}</Index>)

    expect(containerOf(engine).tag).toBe('wrapper')
  })

  it('typechecks a container prop against the tag `as` names', () => {
    // `Index` shares `buildContainer` with `For`, so the container behaviour and
    // its type safety have to hold on both — that sharing is the whole reason
    // the two cannot drift apart on which props they honour.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const tags = signal(['red'])

    mount(engine.pageElement, () => (
      <Index each={tags} as="scroll-view" scroll-orientation="horizontal">
        {(tag) => <text>{() => tag()}</text>}
      </Index>
    ))

    const container = containerOf(engine)
    expect([container.tag, container.attrs['scroll-orientation']]).toEqual(['scroll-view', 'horizontal'])
  })

  it('updates a slot in place when a different item moves into it', () => {
    // The whole reason `Index` is a component rather than a key function. A row
    // is built once and never rebuilt, so keying by position alone would leave
    // this list showing the old values in the shifted slots.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const tags = signal(['red', 'blue'])

    mount(engine.pageElement, () => <Index each={tags}>{(tag) => <text>{() => tag()}</text>}</Index>)
    tags(['green', 'red', 'blue'])

    expect(rows(containerOf(engine))).toEqual(['green', 'red', 'blue'])
  })

  it('keeps the node in a slot whose item changed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const tags = signal(['red', 'blue'])
    let builds = 0

    mount(engine.pageElement, () => (
      <Index each={tags}>
        {(tag) => {
          builds++
          return <text>{() => tag()}</text>
        }}
      </Index>
    ))
    const first = containerOf(engine).children[0]

    tags(['green', 'blue'])

    // One slot changed content and one row was neither rebuilt nor replaced.
    expect(builds).toBe(2)
    expect(containerOf(engine).children[0]).toBe(first)
  })

  it('drops the trailing rows when the collection shrinks', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const tags = signal(['a', 'b', 'c'])

    mount(engine.pageElement, () => <Index each={tags}>{(tag) => <text>{() => tag()}</text>}</Index>)
    tags(['a'])

    expect(rows(containerOf(engine))).toEqual(['a'])
  })

  it('composes when nested inside another Index', () => {
    // `Index` refreshes its slot signals from inside the getter `list` tracks,
    // which is a write during another component's reconciliation once these are
    // nested. Worth pinning that it settles rather than glitching.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const groups = signal([['a', 'b'], ['c']])

    mount(engine.pageElement, () => (
      <Index each={groups}>
        {(group) => (
          <view>
            <Index each={() => group()}>{(item) => <text>{() => item()}</text>}</Index>
          </view>
        )}
      </Index>
    ))

    const shape = (): string[][] => containerOf(engine).children.map((group) => rows(group.children[0] as FakeElement))

    expect(shape()).toEqual([['a', 'b'], ['c']])
    groups([['z'], ['c', 'd']])
    expect(shape()).toEqual([['z'], ['c', 'd']])
  })

  it('renders duplicates that For would have to warn about', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const warn = vi.spyOn(consoleLike, 'warn').mockImplementation(() => {})
    const tags = signal(['red', 'red'])

    mount(engine.pageElement, () => (
      <view>
        <Index each={tags}>{(tag) => <text>{() => tag()}</text>}</Index>
        <For each={tags}>{(tag: string) => <text>{tag}</text>}</For>
      </view>
    ))

    const parent = engine.page.children[0] as FakeElement
    expect(rows(parent.children[0] as FakeElement)).toEqual(['red', 'red'])
    expect(rows(parent.children[1] as FakeElement)).toEqual(['red'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
