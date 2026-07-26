import { effect } from 'alien-signals'

import { bindShow } from './bind/bind-show'
import { requireHost, scheduleFlush } from './current-host'
import { onCleanup } from './on-cleanup'
import { resolveClass } from './resolve-class'
import type { HostElement, StyleValue } from './types'
import { warn } from './warn'

/**
 * Applies one JSX prop to an element, deciding static-or-reactive from the
 * shape of the value: a function tracks, anything else is applied once and
 * never again.
 *
 * Nothing is returned, because nothing needs to be disposed by the caller.
 * Reactive props become effects, which the enclosing scope disposes on its own,
 * and event listeners register their own `onCleanup` — so a subtree that leaves
 * the tree detaches its listeners without the runtime tracking them.
 *
 * `children`, `key`, and `ref` never reach here: those describe the element's
 * structure rather than its properties, so the runtime handles them itself.
 */
export const applyProp = (element: HostElement, name: string, value: unknown): void => {
  const host = requireHost()

  if (STATIC_PROPS.has(name)) {
    // A getter here typechecks nowhere but arrives from plain JavaScript all the
    // same, and the failure is silent: the host read the prop once at creation,
    // so the binding appears to exist and never fires again. Saying so is the
    // whole reason this branch exists — the value is deliberately not applied,
    // because calling the getter would suggest a reactivity that cannot follow.
    if (typeof value === 'function') {
      warn(`\`${name}\` decides what the host builds, so it cannot be reactive. Pass a plain value.`)
      return
    }
    host.setProperty(element, name, value)
    scheduleFlush()
    return
  }

  if (name === 'show') {
    // Wrapping a static boolean in a getter means one code path covers both
    // forms, so a plain `show={false}` behaves exactly like a tracked one.
    const get = typeof value === 'function' ? (value as () => boolean) : () => value as boolean
    bindShow(element, get)
    return
  }

  if (name === 'class') {
    if (typeof value === 'function') {
      effect(() => {
        host.setProperty(element, 'class', resolveClass(value()))
        scheduleFlush()
      })
      return
    }
    host.setProperty(element, 'class', resolveClass(value))
    scheduleFlush()
    return
  }

  if (name === 'style') {
    if (typeof value === 'function') {
      effect(() => {
        host.setStyle(element, (value as () => StyleValue | null)())
        scheduleFlush()
      })
      return
    }
    host.setStyle(element, (value ?? null) as StyleValue | null)
    scheduleFlush()
    return
  }

  if (isEventProp(name, value)) {
    // onTap becomes tap, onLongPress becomes longpress. Plain listeners with no
    // options and no delegation, because native targets have no bubbling phase
    // to delegate through.
    onCleanup(host.addEventListener(element, name.slice(2).toLowerCase(), value))
    return
  }

  if (typeof value === 'function') {
    const get = value as () => unknown
    effect(() => {
      host.setProperty(element, name, get())
      scheduleFlush()
    })
    return
  }

  host.setProperty(element, name, value)
  scheduleFlush()
}

/**
 * The props a host consumes when it CREATES an element rather than afterwards,
 * so none of them has a reactive form.
 *
 * `multiline` turns an input into a different control; `role` and `level` decide
 * which element the DOM host builds. A node cannot change what it is on any
 * target, so these are read once from `createElement`'s props and are passed on
 * here only so a host that spells one as an attribute still gets the chance.
 */
const STATIC_PROPS = new Set(['role', 'level', 'multiline'])

/** An `on*` prop carrying a handler. The value check keeps `onTap={undefined}` off the listener path. */
const isEventProp = (name: string, value: unknown): value is (event: unknown) => void =>
  name.startsWith('on') && typeof value === 'function'
