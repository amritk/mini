import { describe, expect, it } from 'vitest'

import { jsxDEV } from './jsx-dev-runtime'

describe('jsx-dev-runtime', () => {
  it('forwards a hoisted key to a component, as jsx does', () => {
    // The dev transform passes `key` as the third argument and debug info after
    // it. `jsxDEV` is `jsx` itself, so this pins that the debug arguments are
    // ignored and the key still reaches a component that declares one.
    let received: unknown
    const Probe = (props: { key?: string }): HTMLElement => {
      received = props.key
      return {} as HTMLElement
    }
    jsxDEV(Probe as never, {}, 'row-1', false, { fileName: 'x.tsx', lineNumber: 1 }, undefined)
    expect(received).toBe('row-1')
  })

  it('leaves props untouched when there is no key', () => {
    const props = { label: 'a' }
    let received: unknown
    const Probe = (incoming: unknown): HTMLElement => {
      received = incoming
      return {} as HTMLElement
    }
    jsxDEV(Probe as never, props, undefined, true, undefined, undefined)
    expect(received).toBe(props)
  })
})
