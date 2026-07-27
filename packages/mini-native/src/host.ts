import type { ReadonlySignal } from './signals'
import type { Dispose, HostElement, HostNode, HostText, StyleValue } from './types'

/** Whether the target is currently presenting light or dark surfaces. */
export type ColorScheme = 'light' | 'dark'

/** The size of the area the app is being drawn into, in density-independent pixels. */
export type Dimensions = {
  readonly width: number
  readonly height: number
}

/**
 * How far in from each edge it is safe to draw, in density-independent pixels.
 *
 * This is the field that has no web equivalent worth the name and is
 * unavoidable on a device: a notch, a rounded corner, a home indicator, and a
 * status bar all eat into the screen, and content drawn underneath them is
 * simply not visible.
 */
export type Insets = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/**
 * What the target can say about itself, beyond the tree it renders.
 *
 * Every field is a SIGNAL rather than a value, and that is the whole reason
 * this is expressible at all: a component runs exactly once here, so anything
 * read as a plain value would be frozen at the moment the component was built.
 * A signal means a rotation, a theme switch, or a keyboard appearing updates
 * whatever read it, with no re-render and no invalidation machinery — the same
 * rule as every other reactive value in the package.
 *
 * Every field is also OPTIONAL, and so is the whole object. A host reports what
 * its target actually knows and the runtime fills in a documented static value
 * for the rest, so the memory host stays a dozen lines and no existing host
 * broke when this was added.
 *
 * This matters more than its size suggests. Safe area, viewport, and colour
 * scheme are precisely what an app would otherwise branch on by OS name — and
 * an OS name is a proxy for the thing you actually care about, which is why
 * this exists and why a good version of it is what keeps `platform.select` from
 * being reached for.
 */
export type HostEnvironment = {
  readonly colorScheme?: ReadonlySignal<ColorScheme>
  readonly dimensions?: ReadonlySignal<Dimensions>
  readonly safeArea?: ReadonlySignal<Insets>
  /**
   * Whether the user has asked the system to cut down on motion.
   *
   * Every platform this runtime targets has this setting and every one of them
   * means it: for a person with a vestibular disorder a sliding sheet is not a
   * flourish, it is nausea. It sits here rather than in an app's own settings
   * because the answer belongs to the system, and because putting it in the
   * environment is what lets {@link Host.animate} honour it without a single
   * call site remembering to ask.
   */
  readonly reduceMotion?: ReadonlySignal<boolean>
}

/**
 * How an animation stopped.
 *
 * A caller usually has to know: fading a toast out and then removing it is
 * correct only if the fade actually reached the end, and wrong if something
 * interrupted it — the toast is back on screen and the removal would tear it
 * out from under the user.
 */
export type AnimationEnd = 'finished' | 'cancelled'

/**
 * The timing half of an animation: how long, how many times, and in what shape.
 *
 * There is no `fill` here, and its absence is the design rather than an
 * oversight. A filled animation leaves the element holding a style nothing else
 * knows about, so the truth about what the element looks like moves out of the
 * signal graph and into a timeline — and the next `setStyle` either fights it or
 * loses to it. The rule this package keeps instead: **the signal is the state
 * and the animation is only how it gets there**. Write the settled value, then
 * animate from wherever it was; the element releases to its own style at the end
 * because its own style is already right.
 *
 * That rule is worth more than the feature it costs. It is what makes an
 * animation safely removable — by a host that cannot animate, by a user who
 * asked for less motion, by a test — without any of them changing what is on
 * screen when the dust settles.
 */
export type AnimationTiming = {
  /** How long one iteration takes, in milliseconds. */
  readonly duration: number
  /** How long to wait before the first iteration. Defaults to none. */
  readonly delay?: number
  /**
   * The easing curve, spelled the way CSS spells it — a keyword or a
   * `cubic-bezier(…)`. Left as a string rather than a union because every target
   * this runtime has met parses CSS timing functions, and enumerating them here
   * would only mean rejecting a curve some engine understands.
   */
  readonly easing?: string
  /** How many times to run. `Infinity` is allowed and means until cancelled. Defaults to once. */
  readonly iterations?: number
  /** Which direction each iteration runs in. Defaults to `normal`. */
  readonly direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
}

/**
 * A running animation, as the host hands it back.
 *
 * `finished` RESOLVES on a cancel rather than rejecting, reporting which
 * happened. A rejection would make the ordinary "clean up afterwards" case —
 * far and away the common one — require a `catch` that exists only to swallow
 * something that is not an error, and forgetting it costs an unhandled
 * rejection. Reporting the outcome as a value keeps the interesting case
 * (finished, so remove the node) a plain comparison.
 */
export type HostAnimation = {
  /** Stops the animation where it is and releases the element to its own style. */
  cancel: () => void
  /**
   * Jumps to the last frame and ends.
   *
   * On an animation with infinite `iterations` this behaves as {@link cancel},
   * because there is no final frame to jump to, and `finished` reports
   * `cancelled` accordingly.
   */
  finish: () => void
  /** Settles when the animation stops, with how it stopped. Never rejects. */
  readonly finished: Promise<AnimationEnd>
}

/**
 * Two or more style bags to animate between.
 *
 * A tuple rather than an array, because one keyframe is not an animation: it
 * describes a destination with no stated origin, leaving the host to read the
 * element's current computed style — which the web can do and a native view tree
 * generally cannot. Requiring the origin is what keeps an animation mean the
 * same thing on both, and a tuple makes leaving it out a compile error instead
 * of a target-dependent surprise.
 */
export type Keyframes = readonly [StyleValue, StyleValue, ...StyleValue[]]

/**
 * The renderer contract — the entire platform surface this framework needs.
 *
 * Everything else in the package is written against these functions and never
 * touches a platform API directly. Porting to a new target (a native view
 * tree, a canvas, a terminal) means writing one of these and nothing else.
 *
 * The contract is small because the framework has no virtual DOM and no
 * reconciler: JSX builds a host node once and signals mutate it in place
 * forever. There is no tree to diff, so there is no commit protocol here —
 * only direct, imperative mutation. That is also the one hard requirement a
 * target must satisfy: its node tree has to be MUTABLE. A target whose tree is
 * immutable (rebuilt and committed on every change) is a poor fit, because
 * every attribute write would become a whole-tree commit.
 */
export type Host = {
  /**
   * How this target names itself: `web`, `lynx`, `memory`, or whatever a new
   * host calls its own platform. Absent means nobody said, which reads back as
   * `unknown`.
   *
   * A FIELD rather than a function, deliberately — the porting cost of a new
   * target is the number of functions in this contract, and a string that never
   * changes should not be spent against that budget.
   *
   * Reach for {@link HostEnvironment} before reaching for this. An OS name is a
   * proxy for the thing an app actually cares about (is there a notch, does
   * hover exist, is anything addressable), and proxies rot: code branching on
   * `os === 'web'` is wrong the day a second web-shaped target appears. A
   * capability registry would be the better answer and is not built, because
   * designing the flag set before three real branches exist would be guesswork.
   */
  readonly platform?: string

  /**
   * What this target can say about itself — colour scheme, size, safe area.
   * Optional in full and optional per field; see {@link HostEnvironment}.
   */
  readonly environment?: HostEnvironment

  /**
   * Creates an element for one of the tags in the element vocabulary. Hosts map
   * the vocabulary onto whatever they actually render — the DOM host turns
   * `view` into a `<div>`, a native host turns it into a real container view.
   *
   * The element's props are passed along because some targets have to decide
   * what to build from them rather than configure it afterwards: the DOM has no
   * way to turn an `<input>` into a `<textarea>` once it exists, so `multiline`
   * has to be read here. Props consumed at creation are STATIC — a getter is
   * not tracked, because a node cannot change what it is. Everything else still
   * arrives through `setProperty` in the usual way, so a host is free to ignore
   * this parameter entirely.
   */
  createElement: (tag: string, props?: Readonly<Record<string, unknown>>) => HostElement

  /**
   * Creates the wrapper element the control-flow components swap their children
   * inside. It exists as a separate method because the right wrapper differs
   * per target: the DOM host returns a `display: contents` div so the wrapper
   * vanishes from layout, while a native host returns an ordinary container
   * view, which is idiomatic there anyway.
   *
   * The wrapper MUST be invisible to accessibility — `role="presentation"` on
   * the web, whatever excludes a node from the tree natively. Nobody wrote this
   * element, so it must not appear to have been written.
   *
   * That is easy to skip while the vocabulary carries no roles, and it breaks
   * the moment it does: a list built as `<view role="list"><For …/></view>` puts
   * this wrapper between the list and its items, severing the ownership
   * relationship assistive technology walks. Vanishing from LAYOUT is not the
   * same as vanishing from the accessibility tree, and `display: contents` has
   * never been consistent enough across browsers to rely on for the second.
   *
   * The same rule constrains what a role may build at all: a `list` role must
   * not become a real `<ul>`, because `<ul>` accepts only `<li>` and that is a
   * parse-level content model no attribute can rescue once a wrapper sits
   * between them. Roles whose element has a restrictive content model are
   * expressed as a generic element carrying the role instead.
   */
  createFlowHost: () => HostElement

  createText: (value: string) => HostText

  setText: (node: HostText, value: string) => void

  /**
   * Applies one attribute or property. `false`, `null`, and `undefined` mean
   * "unset it"; everything else is the value. The runtime resolves `class`
   * arrays and objects to a plain string before calling this, so hosts only
   * ever see primitives.
   */
  setProperty: (element: HostElement, name: string, value: unknown) => void

  /**
   * Reads a property back. Only the two-way input bindings need this, to pull
   * the current text or checked state out of a control after the user has
   * changed it.
   */
  getProperty: (element: HostElement, name: string) => unknown

  /**
   * Applies a style bag, replacing whatever was applied before. A `null` clears
   * it.
   *
   * Numeric values mean density-independent pixels, the same convention every
   * native toolkit uses, and adding the unit is the HOST's job — the runtime
   * hands the number through untouched so each target can spell it the way it
   * needs to. A host is still free to treat a handful of properties as
   * unitless, exactly as CSS does for `opacity` or `flexGrow`.
   *
   * A style write MUST NOT disturb the visibility set by {@link setVisible}.
   * That is easy to get wrong, because the obvious implementation of both is
   * the same channel — inline `display` on the web, inline styles on Lynx — and
   * a wholesale style replacement then quietly un-hides a hidden element. Any
   * host expressing the two through one channel has to remember the visibility
   * and re-apply it after the style. See either shipped host for the shape.
   */
  setStyle: (element: HostElement, value: StyleValue | null) => void

  /**
   * Shows or hides an element without removing it from the tree. Kept separate
   * from `setStyle` because targets disagree on how visibility works — inline
   * `display` on the web, a dedicated flag or style key natively.
   *
   * This owns visibility outright: showing an element again must restore
   * whatever the element's own style asked for, not a hardcoded default. See
   * the invariant on {@link setStyle}.
   */
  setVisible: (element: HostElement, visible: boolean) => void

  /**
   * Attaches an event listener and returns a dispose that detaches it. Names
   * arrive lowercased and undecorated (`click`, `input`, `focus`); mapping them
   * onto the target's own event system is the host's job.
   *
   * There is no delegation and there are no listener options, which keeps this
   * portable — native targets have no bubbling phase to hook into.
   *
   * A host MUST normalise the payload of every event the vocabulary names, to
   * the shape in `events.ts`. That is the same job as resolving a `class` array
   * into a string or a bare `100` into `100px`, pointed the other way: without
   * it `onScroll={(event) => …}` cannot be written once, because reading an
   * offset would mean knowing which host is installed. Anything the vocabulary
   * does NOT name is passed through untouched and belongs to whoever installed
   * the host — `NativeEventMap` is the seam for typing those.
   *
   * Everything target-specific that normalising discarded stays reachable on
   * the payload's `raw`, which is deliberately `unknown` so that using it costs
   * a cast and shows up in review as the platform-specific code it is.
   */
  addEventListener: (element: HostElement, name: string, handler: HostEventHandler) => Dispose

  /**
   * Inserts `node` into `parent` before `anchor`, or appends it when `anchor`
   * is `null`. This single method covers both appending and reordering, which
   * is all the keyed list reconciler needs.
   */
  insert: (parent: HostElement, node: HostNode, anchor: HostNode | null) => void

  /** Detaches a node from its parent. */
  remove: (node: HostNode) => void

  /** Detaches every child of an element. */
  clear: (element: HostElement) => void

  firstChild: (element: HostElement) => HostNode | null

  nextSibling: (node: HostNode) => HostNode | null

  /**
   * Moves keyboard focus to an element, and takes it away again.
   *
   * These are the only METHODS the contract has grown since it was first
   * written, and they earned it the hard way: no existing method can express
   * them and every real app needs them — advancing to the next field in a form,
   * trapping focus in a modal and restoring it afterwards, moving a screen
   * reader to an error that has just appeared.
   *
   * Focusing cannot be a prop, which is the part worth understanding. A
   * `focused={true}` prop has no correct meaning once the user taps somewhere
   * else: the prop still says `true`, the element is not focused, and there is
   * no honest way to reconcile the two. Focus is an EVENT — a thing that
   * happens — not a state an element holds, so it is expressed as a call.
   *
   * Optional, because a target may genuinely have no notion of focus and should
   * not have to fake one. The memory host does not implement them; `focus()`
   * and `blur()` are no-ops there rather than errors.
   */
  focus?: (element: HostElement) => void

  blur?: (element: HostElement) => void

  /**
   * Hands a whole timeline to the engine and returns a handle to it.
   *
   * This is the one method that exists to AVOID work rather than to do it.
   * Everything else in this contract is a single mutation the runtime asks for
   * when a signal says so, and an animation driven that way is one property
   * write per displayed frame — sixty a second, each one a bridge crossing on a
   * native target, all of them competing with whatever else the app is doing on
   * the JavaScript thread. Describing the whole animation once lets the engine
   * run it on the thread that composites, where a dropped JavaScript frame does
   * not become a dropped animation frame.
   *
   * The element is released back to its own style when the animation ends,
   * however it ends. See {@link AnimationTiming} for why there is no `fill` and
   * why that release is the point rather than a limitation.
   *
   * Optional, like {@link focus}: a target with no notion of time should not
   * have to fake one. The runtime skips straight to the settled state when it is
   * missing, which is correct precisely BECAUSE nothing here is load-bearing.
   */
  animate?: (element: HostElement, keyframes: Keyframes, timing: AnimationTiming) => HostAnimation

  /**
   * Commits pending mutations, for targets that batch rather than apply
   * immediately (Lynx, for instance, needs its element tree flushed). Hosts
   * that apply mutations eagerly leave this out and the scheduler skips it.
   *
   * The runtime never calls this synchronously per mutation — it coalesces
   * every change in a tick into a single flush, so a burst of signal writes
   * costs one commit rather than one per attribute.
   */
  flush?: () => void
}

/**
 * An event as the host delivers it. The runtime never reads an event, it only
 * forwards it to the handler the caller supplied, so this stays `unknown` —
 * each host's own typings narrow it at the call site.
 */
export type HostEventHandler = (event: unknown) => void
