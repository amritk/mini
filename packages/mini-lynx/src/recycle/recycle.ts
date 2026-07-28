import { effectScope } from 'alien-signals'

import { applyProp } from '../apply-prop'
import { currentFrame, withFrame } from '../context-frame'
import { requireEngine, scheduleFlush } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { onCleanup } from '../on-cleanup'
import { runDetached } from '../run-detached'
import { type Signal, signal } from '../signals'
import { createElement } from '../tree'
import type { Dispose } from '../types'
import { warn } from '../warn'
import { watch } from '../watch'

/**
 * `<list>`'s cell recycler — the one place in this runtime where the engine owns
 * an element and the framework fills it in.
 *
 * ## Why this is not `list()`
 *
 * `list()` reconciles: it owns every row, decides where each one goes, and holds
 * them all. That is correct for a collection a screen can show, and it is the
 * wrong shape entirely for the ten thousand rows `<list>` exists for, because
 * every row is a real element on the main thread whether or not anyone can see
 * it.
 *
 * A recycler inverts the ownership. The engine knows what is on screen, so the
 * engine asks: `componentAtIndex(index)` means "I need the cell for this row,
 * give me its id", and `enqueueComponent(sign)` means "this one scrolled away,
 * have it back". The framework keeps a pool of perhaps a dozen elements and
 * answers from it. **That is a different contract from the rest of this
 * runtime** and it is worth saying so plainly rather than hiding it behind an
 * API that looks like `list()`.
 *
 * ## Why it suits a signals runtime particularly well
 *
 * This is the part that falls out nicely. Every other framework has to *rebuild*
 * a recycled cell: React hydrates the pooled element tree against the new row's
 * virtual output and patches the differences, which is a diff per reuse, per
 * scroll frame.
 *
 * There is nothing to diff here. A cell owns an `item` signal, and the bindings
 * a cell built when it was first created are still attached to its elements. So
 * reusing a cell for row 5,000 is **one signal write** — the bindings that
 * depend on it mutate exactly the attributes that changed, and nothing else is
 * touched or even visited. "Real elements, created once, mutated forever" turns
 * out to be precisely what a recycler wants; the cell pool is just the set of
 * elements that were created once.
 *
 * That is also why `cell` receives GETTERS rather than values. A cell is built
 * once and then re-pointed at different rows for the life of the list, so a
 * closure over the row it happened to be built with would show row 0's text
 * forever.
 *
 * ## What the engine is told
 *
 * The engine cannot ask for a row it does not know exists, so the cell inventory
 * is published as the `update-list-info` attribute — insertions with their
 * position and platform info, removals by their old index. Writing it is what
 * makes the engine re-query; a recycler that updated its data and stopped there
 * would scroll a stale list forever.
 */

/** What one pooled cell owns. */
type Cell<T> = {
  readonly root: LynxElement
  /** The engine's id for `root` — the token both callbacks speak in. */
  readonly sign: number
  readonly item: Signal<T>
  readonly index: Signal<number>
  /** Which pool this cell returns to. Only a cell of the same shape may be reused. */
  readonly reuse: string
  readonly dispose: Dispose
}

/** The per-row information the engine needs before it can lay a cell out. */
type PlatformInfo = {
  'item-key': string
  'reuse-identifier'?: string
  'full-span'?: boolean
  'sticky-top'?: boolean
  'sticky-bottom'?: boolean
  'estimated-main-axis-size-px'?: number
}

export type RecycleProps<T> = {
  /** The collection. A getter, so the list follows it. */
  readonly each: () => readonly T[]
  /**
   * Builds one cell.
   *
   * Both parameters are **getters**, because a cell outlives the row it was
   * built for — see the note above. Reading `item()` inside a binding is what
   * makes the cell follow whichever row it is currently showing.
   */
  readonly cell: (item: () => T, index: () => number) => LynxElement
  /**
   * A row's stable identity, which the engine uses to keep a cell attached to
   * its data across an update.
   */
  readonly itemKey: (item: T, index: number) => string
  /**
   * Which pool a row's cell belongs to. Rows sharing an identifier must be
   * structurally interchangeable, because they will be handed each other's
   * elements.
   *
   * Defaults to one pool for everything, which is right when `cell` always
   * builds the same shape. Give a header a different identifier from a row and
   * the engine stops trying to reuse one as the other.
   */
  readonly reuseIdentifier?: (item: T, index: number) => string
  /** Per-row layout hints the engine reads: sticky, full-span, estimated size. */
  readonly rowInfo?: (item: T, index: number) => Omit<PlatformInfo, 'item-key' | 'reuse-identifier'>
}

/**
 * Creates a recycling `<list>` and returns it, ready to place.
 *
 * The element is created here rather than taken as an argument because a
 * recycling list must be built by `__CreateList` — the creator that takes the
 * callbacks — and by the time a `ref` could hand over an element it has already
 * been created as something else. Every other prop is applied through the normal
 * path, so the engine's own list attributes are spelled the engine's way.
 *
 * @example
 * ```tsx
 * const rows = signal(Array.from({ length: 10_000 }, (_, i) => ({ id: String(i), label: `Row ${i}` })))
 *
 * const feed = recycle(
 *   {
 *     each: rows,
 *     itemKey: (row) => row.id,
 *     // `item` is a getter: the cell is built once and re-pointed at each row.
 *     cell: (item) => (
 *       <list-item item-key={item().id}>
 *         <text><raw-text text={() => item().label} /></text>
 *       </list-item>
 *     ),
 *   },
 *   { 'list-type': 'single', 'span-count': 1 },
 * )
 *
 * return <view style={{ height: 600 }}>{feed}</view>
 * ```
 */
export const recycle = <T>(props: RecycleProps<T>, attributes: Readonly<Record<string, unknown>> = {}): LynxElement => {
  const engine = requireEngine()

  const cells = new Map<number, Cell<T>>()
  /** Cells the engine has handed back, by reuse identifier — the pool itself. */
  const pool = new Map<string, Cell<T>[]>()
  // Captured for the same reason `list` captures it: a cell is built later, from
  // inside a callback, long after whatever provider wrapped this call has gone.
  const frame = currentFrame()

  /** The rows as of the last published inventory, so a change can be described as edits. */
  let published: PlatformInfo[] = []
  /** Set by `dispose`, so a late callback answers "nothing here" instead of building. */
  let torn = false

  const infoAt = (item: T, index: number): PlatformInfo => ({
    'item-key': props.itemKey(item, index),
    ...(props.reuseIdentifier ? { 'reuse-identifier': props.reuseIdentifier(item, index) } : {}),
    ...props.rowInfo?.(item, index),
  })

  const reuseOf = (info: PlatformInfo): string => info['reuse-identifier'] ?? DEFAULT_POOL

  /**
   * Answers the engine's "give me the cell for this row".
   *
   * Everything here is synchronous and has to be: the engine takes the returned
   * id as the answer, and a cell whose data arrives a microtask later would be
   * committed showing the previous row's content. Signal writes propagate
   * synchronously, which is what makes filling a reused cell a single statement.
   */
  const componentAtIndex = (list: LynxElement, listID: number, cellIndex: number, operationID: number): number => {
    // Guarded here as well as by the inert callbacks installed on teardown,
    // because the engine is not obliged to honour `__UpdateListCallbacks`
    // promptly — it may be mid-scroll, and a request that arrives afterwards
    // would otherwise build a cell against a torn-down pool, or against whatever
    // engine happens to be installed by then.
    if (torn) return -1
    const rows = props.each()
    const item = rows[cellIndex]
    if (item === undefined && cellIndex >= rows.length) {
      // The engine asked for a row past the end, which means the inventory it is
      // working from is older than the data. Returning a real cell would show
      // the wrong row; -1 is the engine's own "nothing here".
      warn('recycle: the engine asked for a row past the end of the collection:', {
        cellIndex,
        length: rows.length,
      })
      return -1
    }

    const info = infoAt(item as T, cellIndex)
    const reuse = reuseOf(info)
    const parked = pool.get(reuse)
    const recycled = parked?.pop()

    const cell = recycled ?? build(list, item as T, cellIndex, reuse)
    // The whole of "filling" a recycled cell. The bindings this cell built when
    // it was created are still attached to its elements, so writing these two
    // mutates exactly the attributes that differ between the old row and the new
    // one — no diff, no rebuild, no tree walk.
    cell.item(item as T)
    cell.index(cellIndex)
    // Platform info is per-ROW, not per-cell, so it has to be re-asserted on a
    // cell that has just been pointed at a different row.
    applyPlatformInfo(cell.root, info)

    cells.set(cell.sign, cell)
    // The engine correlates its request with this commit through `operationID`,
    // and lays the cell out as part of it. Handing the token back untouched is
    // load-bearing — the engine matches on it.
    engine.__FlushElementTree?.(cell.root, {
      triggerLayout: true,
      operationID,
      elementID: cell.sign,
      listID,
    })
    return cell.sign
  }

  /** Takes a cell back when it scrolls out of range. */
  const enqueueComponent = (_list: LynxElement, _listID: number, sign: number): void => {
    if (torn) return
    const cell = cells.get(sign)
    if (!cell) return
    cells.delete(sign)
    const parked = pool.get(cell.reuse)
    if (parked) parked.push(cell)
    else pool.set(cell.reuse, [cell])
  }

  const list = engine.__CreateList
    ? engine.__CreateList(componentIdOf(engine), componentAtIndex, enqueueComponent)
    : fallbackList()

  /** Builds a fresh cell and attaches it to the list. */
  function build(host: LynxElement, item: T, index: number, reuse: string): Cell<T> {
    const itemSignal = signal(item)
    const indexSignal = signal(index)
    let root!: LynxElement
    // Detached for the reason `list` detaches: this runs inside the engine's
    // callback, which may itself be inside a running effect, and a scope created
    // there is disposed the next time that effect re-runs — which would leave
    // every already-built cell holding elements whose bindings had stopped.
    const dispose = runDetached(() =>
      effectScope(() => {
        root = withFrame(frame, () => props.cell(itemSignal, indexSignal))
      }),
    )
    engine.__AppendElement(host, root)
    const sign = engine.__GetElementUniqueID?.(root) ?? -1
    return { root, sign, item: itemSignal, index: indexSignal, reuse, dispose }
  }

  /**
   * The list this makes when the engine has no `__CreateList`.
   *
   * An older engine, or a partial one. The element still lays out and scrolls;
   * it simply never calls back, so nothing is ever realised through the recycler
   * and the list is empty rather than subtly wrong. Said out loud, because a
   * silently empty list is otherwise a long afternoon.
   */
  function fallbackList(): LynxElement {
    warn('recycle: this engine has no __CreateList, so the list cannot recycle.')
    return createElement('list')
  }

  for (const [name, value] of Object.entries(attributes)) applyProp(list, name, value)

  /**
   * Publishes the cell inventory whenever the collection changes.
   *
   * The engine cannot ask for a row it has not been told about, so this is what
   * makes an update visible at all. It runs on `watch` rather than `effect`
   * because the first inventory is published below, before the engine has had a
   * chance to ask for anything.
   */
  const stop = watch(props.each, (rows) => {
    publish(rows.map((item, index) => infoAt(item, index)))
  })

  const publish = (next: PlatformInfo[]): void => {
    engine.__SetAttribute(list, 'update-list-info', diff(published, next))
    published = next
    scheduleFlush()
  }

  publish(props.each().map((item, index) => infoAt(item, index)))

  const dispose = (): void => {
    if (torn) return
    torn = true
    stop()
    // Inert callbacks rather than none: the engine may be mid-scroll, and a
    // removed list that is still asked for a cell should answer "nothing here"
    // rather than reach into a torn-down pool. ReactLynx does the same.
    requireEngine().__UpdateListCallbacks?.(
      list,
      () => -1,
      () => {},
    )
    for (const cell of cells.values()) cell.dispose()
    for (const parked of pool.values()) for (const cell of parked) cell.dispose()
    cells.clear()
    pool.clear()
  }

  onCleanup(dispose)
  return list
}

/** The pool every row shares when no reuse identifier is given. */
const DEFAULT_POOL = '*'

/** Writes a row's platform info onto its cell's root. */
const applyPlatformInfo = (root: LynxElement, info: PlatformInfo): void => {
  const engine = requireEngine()
  for (const [name, value] of Object.entries(info)) {
    if (value !== undefined) engine.__SetAttribute(root, name, value)
  }
}

/**
 * Describes the move from one inventory to the next as the edits the engine
 * expects: `{ insertAction, removeAction, updateAction }`.
 *
 * Keyed by `item-key`, so an unchanged row is left alone even when its
 * neighbours move. A row that genuinely moved is a removal and an insertion
 * rather than one operation, which is not minimal and is correct — the engine
 * re-queries either way, and a cell is a pool entry rather than a thing with an
 * identity to preserve.
 */
const diff = (
  before: readonly PlatformInfo[],
  after: readonly PlatformInfo[],
): {
  insertAction: { position: number; type: string }[]
  removeAction: number[]
  updateAction: { from: number; to: number; type: string; flush: boolean }[]
} => {
  const beforeKeys = new Map(before.map((info, index) => [info['item-key'], index]))
  const afterKeys = new Set(after.map((info) => info['item-key']))

  const removeAction: number[] = []
  for (const [key, index] of beforeKeys) if (!afterKeys.has(key)) removeAction.push(index)

  const insertAction: { position: number; type: string }[] = []
  const updateAction: { from: number; to: number; type: string; flush: boolean }[] = []
  for (const [position, info] of after.entries()) {
    const was = beforeKeys.get(info['item-key'])
    if (was === undefined) {
      insertAction.push({ position, ...info, type: info['reuse-identifier'] ?? DEFAULT_POOL })
    } else if (was !== position) {
      // Present in both, at a different index. The engine takes `from`/`to` and
      // re-queries; `flush: false` because the commit is the caller's, once,
      // rather than one per moved row.
      updateAction.push({
        ...info,
        from: was,
        to: position,
        flush: false,
        type: info['reuse-identifier'] ?? DEFAULT_POOL,
      })
    }
  }

  removeAction.sort((a, b) => a - b)
  insertAction.sort((a, b) => a.position - b.position)
  return { insertAction, removeAction, updateAction }
}

/**
 * The page's id, for `__CreateList`'s `parentComponentUniqueId`.
 *
 * The same rule as every other creator — never `0` — but resolved here rather
 * than reusing `tree.ts`'s cache, because `recycle` is a subpath and core's copy
 * is not exported.
 */
const componentIdOf = (engine: ReturnType<typeof requireEngine>): number => {
  const page = engine.__GetPageElement?.()
  return (page && engine.__GetElementUniqueID?.(page)) ?? 0
}
