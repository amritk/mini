import type { LynxElement } from './engine/element-api'

/**
 * The value shapes shared by the runtime, the vocabulary and the JSX types.
 */

/** Tears something down. Every subscription in this package returns one. */
export type Dispose = () => void

/**
 * A prop value that may be static or a reactive getter. A signal satisfies the
 * getter arm as-is (it is a zero-argument function), so `disabled={busy}`
 * typechecks and binds live while `disabled={true}` typechecks and is static.
 *
 * This is the whole reactivity rule of a compilerless JSX: no compiler analyses
 * these expressions, so reactivity is decided by the SHAPE of the value at
 * runtime. A function tracks; anything else is applied once.
 */
export type MaybeReactive<T> = T | (() => T)

/** A child rendered once at creation. Functions are handled separately, as reactive text. */
type StaticChild = LynxElement | string | number | boolean | null | undefined

/**
 * Anything that may appear between an element's tags. A function child becomes
 * a reactive `raw-text` node bound to whatever signals it reads.
 */
export type MiniChild = StaticChild | (() => string | number | boolean | null | undefined)

/**
 * Recursive, because the runtime is: `appendChildren` walks arrays to any
 * depth, and JSX produces a nested shape as soon as a mapped array sits beside
 * another child — `<view>{rows}{footer}</view>` hands the runtime
 * `[MiniChild[], MiniChild]`. A single flat array would have typechecked the
 * common case and rejected that one, which is the wrong way round for a type
 * describing what a function accepts.
 */
export type MiniChildren = MiniChild | readonly MiniChildren[]

/**
 * What may appear inside a CONTAINER element — anything already built into an
 * element, plus the nullish and boolean values that vanish, which is what keeps
 * `{condition && <text>…</text>}` working as a build-time conditional.
 *
 * Bare strings and numbers are deliberately absent, and that absence is the
 * whole point of the type. Lynx has no notion of loose text inside a container:
 * a run of text is a `raw-text` element and it may only live inside a `<text>`.
 * So `<view>hello</view>` builds a tree the engine will not render and the
 * screen comes up silently blank. Making it a compile error is the only place
 * to catch that honestly — there is no preview target here to catch it later,
 * and on a device it looks like a layout bug rather than a content one.
 */
export type ContainerChild = LynxElement | boolean | null | undefined

/** Recursive for the same reason {@link MiniChildren} is. */
export type ContainerChildren = ContainerChild | readonly ContainerChildren[]

/**
 * The value forms `class` accepts. A plain string is applied verbatim, an array
 * drops falsy entries and joins with spaces (`['card', active && 'on']`), and
 * an object keeps the keys whose value is truthy (`{ card: true, on: active() }`).
 * The whole thing is still `MaybeReactive`, so wrap it in a getter to track it.
 *
 * The array arm is recursive, so a shared fragment can be dropped into a list
 * without being flattened by hand first.
 *
 * Classes are first-class here in a way they never were on a target with no
 * stylesheet: Lynx has real CSS, so a class is the cheap channel and an inline
 * style is the dynamic one, exactly as on the web.
 */
export type ClassValue = string | false | null | undefined | readonly ClassValue[] | Record<string, boolean>

/**
 * A style declaration as a property bag.
 *
 * Keys may be camelCase or kebab-case — `fontSize` and `font-size` are the same
 * property — and the runtime converts to the CSS spelling before handing them
 * over, because the engine parses them as declarations.
 *
 * A bare NUMBER means density-independent pixels, the convention every native
 * toolkit shares, and the runtime adds the unit: `{ width: 100 }` is a hundred
 * pixels rather than an invalid declaration the engine silently discards. Pass
 * a string for any other unit (`'50%'`, `'2rem'`), and note that the properties
 * CSS treats as unitless stay unitless.
 *
 * A whole CSS TEXT string is accepted too — `style="top:10px;left:10px"` — since
 * the engine takes one, though the object form is what a reactive style wants.
 */
export type StyleValue = Record<string, string | number | null | undefined | false>

/**
 * A component: a plain function, run exactly once, returning its root element.
 * There is no instance, no lifecycle and no re-render — whatever reactivity the
 * component sets up internally is the only thing that ever updates after.
 */
export type Component<P> = (props: P) => LynxElement

export type { LynxElement }
