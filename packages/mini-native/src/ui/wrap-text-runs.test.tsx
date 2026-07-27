import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { wrapTextRuns } from './wrap-text-runs'

afterEach(() => {
  clearHost()
})

describe('wrap-text-runs', () => {
  it('gives a string the text element a native target needs', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <view>{wrapTextRuns('Save')}</view>)

    expect(serializeMemoryTree(memory.root)).toBe(['<root>', '  <view>', '    <text>', '      "Save"'].join('\n'))
  })

  it('wraps a number the same way', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <view>{wrapTextRuns(3)}</view>)

    expect(serializeMemoryTree(memory.root)).toContain('"3"')
  })

  it('keeps a function child reactive inside its new element', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const label = signal('Save')

    mount(memory.rootElement, () => <view>{wrapTextRuns(() => label())}</view>)

    label('Saving…')

    expect(serializeMemoryTree(memory.root)).toContain('"Saving…"')
  })

  it('leaves a built node alone', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => {
      const built = <text>Save</text>
      const wrapped = wrapTextRuns(built)
      expect(wrapped).toBe(built)
      return <view>{wrapped}</view>
    })

    // One text element, not one inside another.
    const view = memory.root.children[0] as MemoryElement
    expect((view.children[0] as MemoryElement).tag).toBe('text')
    expect((view.children[0] as MemoryElement).children).toHaveLength(1)
  })

  it('walks an array, wrapping only the runs', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <view>{wrapTextRuns([<text>icon</text>, 'Save'])}</view>)

    const view = memory.root.children[0] as MemoryElement
    expect(view.children).toHaveLength(2)
    expect(serializeMemoryTree(memory.root)).toContain('"Save"')
  })

  it('passes nothing through as nothing', () => {
    expect(wrapTextRuns(undefined)).toBeUndefined()
    expect(wrapTextRuns(null)).toBeNull()
  })
})
