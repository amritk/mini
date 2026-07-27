import { applyProp } from '../apply-prop'
import { requireHost } from '../current-host'
import type { Role } from '../elements'
import type { ScrollEvent } from '../events'
import { list } from '../list'
import { computed, signal } from '../signals'
import { toGetter } from '../to-getter'
import type { ClassValue, HostElement, MaybeReactive, StyleValue } from '../types'
import { warn } from '../warn'

/** Props for {@link VirtualFor}, parameterised by the item type. */
export type VirtualForProps<T> = {
  /** The collection. A getter or signal tracks; a plain array renders once. */
  each: MaybeReactive<readonly T[]>
  /**
   * The extent of one row along the scrolling axis, in density-independent
   * pixels — its height in a vertical list, its width in a horizontal one.
   *
   * FIXED, and that is the notable limitation of this component. Rows of
   * differing sizes need each row measured before it is on screen, which needs a
   * `measure` on the host contract that does not exist, and estimating instead
   * is how a virtualised list ends up jumping under the user's finger as the
   * estimates are corrected. A wrong number here is at least wrong in an obvious
   * way — the rows overlap or leave gaps — rather than in a way that only shows
   * up as scroll drift on somebody's slower phone.
   */
  itemSize: number
  /**
   * How much of the list is on screen at once, along the same axis, in
   * density-independent pixels.
   *
   * Reactive, and usually should be: pass `dimensions()` through so a rotation
   * or a split-screen resize changes how many rows are built rather than leaving
   * a screen half empty.
   */
  viewport: MaybeReactive<number>
  /** Which way the list scrolls. Defaults to `vertical`. */
  axis?: 'vertical' | 'horizontal'
  /**
   * How many extra rows to keep built beyond each edge of the viewport.
   * Defaults to 3.
   *
   * The dial between memory and blank space. Zero means a row is built at the
   * exact moment it becomes visible, so any delay shows as emptiness at the
   * leading edge during a fast flick; a large number is simply a less
   * virtualised list.
   */
  overscan?: number
  /**
   * Builds the element for one slot.
   *
   * Both arguments are GETTERS, and that is the whole design rather than a
   * convenience. A slot is a recycled node: it is built once and then shows a
   * different row every time the list scrolls past it, exactly as a native
   * recycler reuses a cell. Reading `item()` inside a binding is what makes the
   * node update in place instead of being rebuilt — which is the entire point,
   * since rebuilding per scroll frame is the cost this component exists to
   * avoid.
   *
   * ```tsx
   * {(row) => <text>{() => row().label}</text>}
   * ```
   */
  children: (item: () => T, index: () => number) => HostElement
  /** Class for the scrolling viewport. */
  class?: MaybeReactive<ClassValue>
  /** Extra style for the scrolling viewport. Its extent along the axis is set from `viewport`. */
  style?: MaybeReactive<StyleValue | null>
  /** What the collection IS, for assistive technology. */
  role?: Role
  /** The accessible name for the collection. */
  label?: MaybeReactive<string>
  /** Called with the scrolling viewport once built. */
  ref?: (element: HostElement) => void
}

/**
 * A virtualised keyed list: builds a bounded window of rows and recycles them as
 * the collection scrolls past.
 *
 * `For` over ten thousand rows creates ten thousand host elements. On the web
 * that is slow; on a device it is ten thousand real views, which is the defining
 * native performance problem and the reason every native toolkit ships a
 * recycler. This builds `viewport / itemSize + 2 × overscan` elements and no
 * more, whatever the collection's length.
 *
 * ```tsx
 * <VirtualFor each={rows} itemSize={64} viewport={() => dimensions()().height} role="list">
 *   {(row) => <view role="listitem"><text>{() => row().label}</text></view>}
 * </VirtualFor>
 * ```
 *
 * ## Why this is not bound to a platform recycler
 *
 * The obvious implementation is a host seam onto each engine's own recycling
 * list — Lynx has one — and it was rejected. A recycler's programming model is
 * "the engine owns the cell; you fill it with data", which is a different
 * contract from the rest of this package and one that would have to be
 * approximated on every target that has no recycler.
 *
 * It is also unnecessary, because **this runtime already has the recycler's
 * model**. `Index` hands a row a getter for whatever currently occupies its slot;
 * a recycled cell is a node that stays put while the data flowing through it
 * changes. They are the same idea, and the second is already how everything here
 * works. So the window is built out of the ordinary keyed list — keyed by SLOT,
 * not by item — and scrolling moves data through slots without touching a node.
 * The result needs no new host method, behaves identically on all three targets,
 * and is testable against the memory host where no engine exists at all.
 */
export const VirtualFor = <T>(props: VirtualForProps<T>): HostElement => {
  const host = requireHost()
  const each = toGetter(props.each)
  const extent = toGetter(props.viewport)
  const horizontal = props.axis === 'horizontal'
  const overscan = Math.max(0, props.overscan ?? 3)

  if (!(props.itemSize > 0)) {
    // Zero would make every derived count `Infinity` and render the whole
    // collection — the exact opposite of what was asked for, and silently.
    warn('VirtualFor: `itemSize` must be a positive number of pixels; got', props.itemSize)
  }
  const itemSize = props.itemSize > 0 ? props.itemSize : 1

  /** How far the viewport has been scrolled along the axis, in pixels. */
  const offset = signal(0)
  const count = computed(() => each().length)

  /**
   * How many rows are built at once.
   *
   * Derived from the viewport rather than fixed, so a rotation or a split-screen
   * resize grows the window instead of leaving the bottom of the screen empty.
   */
  const windowSize = computed(() => Math.ceil(extent() / itemSize) + overscan * 2)

  /**
   * The data index the first slot is showing.
   *
   * Clamped at the far end as well as at zero: without the upper clamp, scrolling
   * to the bottom of the list would leave the last slots pointing past the end,
   * and the window would render fewer and fewer rows the closer it got.
   */
  const first = computed(() => {
    const start = Math.floor(offset() / itemSize) - overscan
    return Math.max(0, Math.min(start, Math.max(0, count() - windowSize())))
  })

  /**
   * The slot list, as positions rather than items.
   *
   * A NUMBER drives this rather than the array itself, which is the difference
   * between a scroll costing nothing and a scroll costing a reconciliation pass.
   * `first` changes on every scroll event and the slot COUNT almost never does,
   * so deriving the array from the count means the keyed list below only re-runs
   * when the window genuinely grows or shrinks — at the ends of the collection
   * and on a resize.
   */
  const slotCount = computed(() => Math.max(0, Math.min(windowSize(), count() - first())))
  const slots = computed(() => Array.from({ length: slotCount() }, (_, slot) => slot))

  /** The property names that depend on which way this list scrolls. */
  const alongAxis = horizontal ? 'width' : 'height'
  const atOffset = horizontal ? 'left' : 'top'
  /** Pinning the cross axis is what lets a row be given only its own extent. */
  const crossAxis = horizontal ? { top: 0, bottom: 0 } : { left: 0, right: 0 }

  const viewport = host.createElement('scroll-view', { role: props.role })
  const runway = host.createElement('view')

  /**
   * Builds one recycled slot.
   *
   * The wrapper exists to carry the position, and it has to be a wrapper rather
   * than the child itself: the child is whatever the caller built, with whatever
   * style they gave it, and writing a position into that bag would fight them for
   * it. One extra container per SLOT is a bounded cost — there are only ever a
   * screenful — which is the whole reason it is affordable here and would not be
   * in `For`.
   */
  const createSlot = (slot: number): HostElement => {
    // Clamped so a slot briefly pointing past the end — possible while `first`
    // and the collection settle within one tick — reads the last row rather than
    // `undefined`. The slot is on its way out in that case, so showing stale data
    // for a tick is invisible, where a thrown TypeError inside a binding is not.
    const index = computed(() => Math.min(first() + slot, Math.max(0, count() - 1)))
    const item = (): T => each()[index()] as T

    const row = host.createElement('view')
    applyProp(row, 'style', () => ({
      position: 'absolute',
      [atOffset]: index() * itemSize,
      [alongAxis]: itemSize,
      ...crossAxis,
    }))
    host.insert(row, props.children(item, index), null)
    return row
  }

  applyProp(viewport, 'axis', horizontal ? 'horizontal' : 'vertical')
  applyProp(viewport, 'style', () => ({ ...resolveStyle(props.style), [alongAxis]: extent() }))
  applyProp(viewport, 'onScroll', (event: ScrollEvent) => offset(horizontal ? event.x : event.y))
  if (props.class !== undefined) applyProp(viewport, 'class', props.class)
  if (props.role !== undefined) applyProp(viewport, 'role', props.role)
  if (props.label !== undefined) applyProp(viewport, 'label', props.label)

  // The runway is what gives the viewport something to scroll: it is the full
  // height the collection WOULD occupy, so the scrollbar and the fling physics
  // match the real length even though only a screenful of it exists.
  applyProp(runway, 'style', () => ({ position: 'relative', [alongAxis]: count() * itemSize }))

  host.insert(viewport, runway, null)
  // Keyed by SLOT rather than by item, which is the one line that makes this a
  // recycler. Keying by item would rebuild every visible row on every scroll —
  // the keys would all have changed — which is precisely the cost being avoided.
  list(runway, slots, (slot) => String(slot), createSlot)
  props.ref?.(viewport)
  return viewport
}

/** Reads the caller's style bag, whichever form they wrote it in, so it can be merged with the axis extent. */
const resolveStyle = (style: MaybeReactive<StyleValue | null> | undefined): StyleValue => {
  const value = typeof style === 'function' ? style() : style
  return value ?? {}
}
