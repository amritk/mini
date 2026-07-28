import { afterEach, describe, expect, it, vi } from 'vitest'

import { guard, reportError, setErrorHandler } from './report-error'

/**
 * The reporting seam matters most when everything else has already gone wrong,
 * so the cases below are mostly about what it refuses to do: throw, lose the
 * original error, or go quiet when nobody installed a handler.
 */

afterEach(() => {
  setErrorHandler(null)
  vi.restoreAllMocks()
})

describe('report-error', () => {
  it('hands the error and its source to the installed handler', () => {
    const seen: { error: unknown; source: string }[] = []
    setErrorHandler((error, source) => seen.push({ error, source }))

    const failure = new Error('boom')
    reportError(failure, 'event')

    // The source is half the report. "Something threw" is not actionable; "a
    // handler threw" and "the commit threw" lead to different investigations.
    expect(seen).toEqual([{ error: failure, source: 'event' }])
  })

  it('warns when no handler is installed, rather than going quiet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    reportError(new Error('boom'), 'commit')

    // Silence is the failure mode this package works hardest to avoid. A
    // mistake should be visible in development with no setup at all.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('commit')
  })

  it('survives a handler that throws, and still surfaces the original', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setErrorHandler(() => {
      throw new Error('the reporter is broken too')
    })

    const original = new Error('boom')
    // A throw from in here would land back in the native frame the catch was
    // protecting, which is the whole thing this module exists to prevent.
    expect(() => reportError(original, 'render')).not.toThrow()

    const logged = warn.mock.calls.map((call) => call[1])
    expect(logged).toContain(original)
  })

  it('goes back to warning when the handler is removed', () => {
    const handler = vi.fn()
    setErrorHandler(handler)
    setErrorHandler(null)

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    reportError(new Error('boom'), 'event')

    expect(handler).not.toHaveBeenCalled()
  })

  describe('guard', () => {
    it('reports a throw and says the work did not finish', () => {
      const handler = vi.fn()
      setErrorHandler(handler)

      const completed = guard('event', () => {
        throw new Error('boom')
      })

      expect(completed).toBe(false)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('says the work finished when nothing threw', () => {
      const handler = vi.fn()
      setErrorHandler(handler)

      expect(guard('event', () => {})).toBe(true)
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
