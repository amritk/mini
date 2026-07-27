import { type LynxElement, signal } from '@amritk/mini-native'
import { For } from '@amritk/mini-native/flow'

import { Action, Chip, Panel, Prose, Readout, Row, TextLine } from '../components'

/**
 * `/list` — the element the old package could not express at all.
 *
 * `VirtualFor` used to stand in for this: fixed-height windowing, implemented
 * in JavaScript, on top of a vocabulary that had no recycling scroller in it.
 * `<list>` is the engine's own, and it does the things a hand-rolled window
 * cannot — real view recycling, waterfall and grid layouts, sticky rows, and
 * paged snapping — none of which needed a release in this package to become
 * reachable.
 *
 * Be warned about the preview before reading anything into it. A `<list>` here
 * is an unknown element with Lynx's `overflow: hidden` default and no engine
 * behind it, so it CLIPS rather than scrolls and nothing is ever recycled. What
 * the preview does prove is that the tree, the attribute names and the keyed
 * reconciliation are right; everything about behaviour belongs to a device.
 */
export const ListScreen = (): LynxElement => (
  <view>
    <SinglePanel />
    <LayoutPanel />
    <StickyPanel />
    <SnapPanel />
    <HonestyPanel />
  </view>
)

/** One generated row. `id` is the identity both `For` and the engine key on. */
type ListRow = {
  readonly id: string
  readonly index: number
  readonly label: string
  /** Deterministic rather than random, so waterfall lays out the same way twice. */
  readonly height: number
}

const makeRows = (from: number, count: number): readonly ListRow[] =>
  Array.from({ length: count }, (_, offset) => {
    const index = from + offset
    return {
      id: `row-${index}`,
      index,
      label: `Row ${index}`,
      height: 48 + ((index * 17) % 52),
    }
  })

/** A few hundred rows, which is the point at which building every one of them costs. */
const INITIAL_ROWS = makeRows(0, 300)

/** The card inside a `list-item`. Every panel below renders the same one. */
const RowBody = (props: { row: ListRow }): LynxElement => (
  <view class="card" style={{ height: props.row.height, marginBottom: 6, justifyContent: 'center' }}>
    <TextLine>{props.row.label}</TextLine>
    <TextLine class="card-meta">{`item-key="${props.row.id}" · ${props.row.height}px`}</TextLine>
  </view>
)

/** `list-type: single`, the scroll payload, and load-more from `scrolltolower`. */
const SinglePanel = (): LynxElement => {
  const rows = signal(INITIAL_ROWS)
  const info = signal('scroll to see the payload')
  const edge = signal('no edge event yet')

  return (
    <Panel
      title="list — single"
      blurb="A recycling scroller with a fixed width and height, whose only legal direct child is a list-item. Three hundred rows here, and on a device only a screenful of them exists."
    >
      {/*
       * `as="list"` makes `For` reconcile straight into a real `<list>`, so
       * there is no wrapper between the list and its items — which matters, as
       * `list-item` is the only child the engine accepts. The container's props
       * are checked against Lynx's real `ListProps`, so a misspelling is a
       * compile error rather than an attribute the engine ignores.
       */}
      <For
        as="list"
        each={rows}
        key={(row) => row.id}
        class="card"
        style={{ height: 240 }}
        list-type="single"
        span-count={1}
        scroll-orientation="vertical"
        initial-scroll-index={0}
        scroll-event-throttle={100}
        upper-threshold-item-count={3}
        lower-threshold-item-count={3}
        need-visible-item-info={true}
        preload-buffer-count={4}
        bindscroll={(event) => {
          const detail = event.detail
          info(
            `scrollTop ${Math.round(detail.scrollTop)} · listHeight ${Math.round(detail.listHeight)} · attached ${detail.attachedCells.length}`,
          )
        }}
        bindscrolltoupper={() => edge('scrolltoupper — nothing above')}
        bindscrolltolower={() => {
          const current = rows()
          edge(`scrolltolower — appended 50 more, now ${current.length + 50}`)
          rows([...current, ...makeRows(current.length, 50)])
        }}
      >
        {(row) => (
          <list-item item-key={row.id} estimated-main-axis-size-px={row.height}>
            <RowBody row={row} />
          </list-item>
        )}
      </For>

      <Row gap="sm" wrap={true}>
        <Action onTap={() => rows([...rows(), ...makeRows(rows().length, 50)])}>append 50</Action>
        <Action onTap={() => rows(INITIAL_ROWS)}>reset</Action>
        <Chip>{() => `${rows().length} rows`}</Chip>
      </Row>

      <Readout>{info}</Readout>
      <Readout>{edge}</Readout>

      <Prose>
        `item-key` is required by the shipped types, and the vocabulary keeps it required: it is the identity the engine
        diffs and recycles on, so a missing one is a list that reuses the wrong row. It is a different thing from JSX's
        `key`, which this runtime ignores — the `key` prop above belongs to `For`, and derives the identity ITS
        reconciler uses.
      </Prose>

      <Prose>
        `upper-threshold-item-count` and `lower-threshold-item-count` count remaining items rather than pixels, which is
        what makes them the right hook for load-more: the trigger does not move when the rows change height.
      </Prose>
    </Panel>
  )
}

/** The three layouts, and the one attribute that switches between them. */
const LAYOUTS = ['single', 'flow', 'waterfall'] as const

/** `list-type` and `span-count` — one attribute apart from a grid or a waterfall. */
const LayoutPanel = (): LynxElement => {
  const step = signal(1)
  const layout = (): (typeof LAYOUTS)[number] => LAYOUTS[step() % LAYOUTS.length] ?? 'single'
  const rows = makeRows(0, 120)

  return (
    <Panel
      title="list-type — single, flow, waterfall"
      blurb="flow is a uniform grid, waterfall packs unequal heights into columns. span-count is the column count and only means anything for those two."
    >
      {/*
       * `list-main-axis-gap` and `list-cross-axis-gap` are CSS rather than
       * attributes — the only two list-specific properties that live in the
       * style channel — so they go in the bag and not beside `span-count`.
       */}
      <For
        as="list"
        each={rows}
        key={(row) => row.id}
        class="card"
        style={{ height: 240, 'list-main-axis-gap': '6px', 'list-cross-axis-gap': '6px' }}
        list-type={layout}
        span-count={2}
        scroll-orientation="vertical"
      >
        {(row) => (
          <list-item item-key={row.id} full-span={row.index === 0} estimated-main-axis-size-px={row.height}>
            <RowBody row={row} />
          </list-item>
        )}
      </For>

      <Row gap="sm" wrap={true}>
        <Action onTap={() => step(step() + 1)}>next layout</Action>
        <Chip>{() => `list-type="${layout()}" span-count={2}`}</Chip>
      </Row>

      <Chip tone="bad">the preview draws all three the same way</Chip>

      <Prose>
        `list-main-axis-gap` and `list-cross-axis-gap` are CSS rather than attributes, and they are Lynx-only — there is
        no web property behind them. The first row asks for `full-span`, which makes it occupy a whole row of a
        multi-column layout; a section header is what that is for.
      </Prose>
    </Panel>
  )
}

/** Sticky rows, which the engine positions rather than the app. */
const StickyPanel = (): LynxElement => {
  const rows = makeRows(0, 120)
  /** Every twelfth row is a header, which is the row that sticks. */
  const isHeader = (row: ListRow): boolean => row.index % 12 === 0

  return (
    <Panel
      title="sticky-top and sticky-bottom"
      blurb="sticky is declared on the list, and each item opts in. initial-scroll-index puts the first paint somewhere other than the top."
    >
      <For
        as="list"
        each={rows}
        key={(row) => row.id}
        class="card"
        style={{ height: 240 }}
        list-type="single"
        scroll-orientation="vertical"
        sticky={true}
        sticky-offset={0}
        initial-scroll-index={8}
        experimental-recycle-sticky-item={true}
      >
        {(row) => (
          <list-item item-key={row.id} sticky-top={isHeader(row)} estimated-main-axis-size-px={row.height}>
            {isHeader(row) ? (
              <view class="card" style={{ height: 36, justifyContent: 'center', backgroundColor: '#2f5bd7' }}>
                <text class="card-title" style={{ color: '#ffffff' }}>
                  <raw-text text={`section ${row.index / 12}`} />
                </text>
              </view>
            ) : (
              <RowBody row={row} />
            )}
          </list-item>
        )}
      </For>

      <Chip tone="bad">nothing sticks here — there is no scroll to stick against</Chip>

      <Prose>
        `sticky-top` and `sticky-bottom` are incompatible with Android's `flatten`, so a sticky item forces a real
        platform view. `experimental-recycle-sticky-item` decides whether the engine may recycle a sticky row once it is
        pushed out of view; it has been on by default since engine 3.4.
      </Prose>
    </Panel>
  )
}

/** `item-snap` — paged scrolling, which the engine does and an app should not. */
const SnapPanel = (): LynxElement => {
  const rows = makeRows(0, 40)
  const snapped = signal('no snap yet')

  return (
    <Panel
      title="item-snap"
      blurb="Paged scrolling: after each gesture an item comes to rest at a fixed alignment. factor 0 aligns an item's top to the list's top, 1 aligns bottom to bottom."
    >
      <For
        as="list"
        each={rows}
        key={(row) => row.id}
        class="card"
        style={{ height: 200 }}
        list-type="single"
        scroll-orientation="vertical"
        item-snap={{ factor: 0, offset: 0 }}
        bindsnap={(event) => {
          const detail = event.detail
          snapped(`snapped to position ${detail.position} at ${Math.round(detail.targetScrollTop)}px`)
        }}
        bindscrollstatechange={(event) => snapped(`scroll state ${event.detail.state}`)}
      >
        {(row) => (
          <list-item item-key={row.id} estimated-main-axis-size-px={row.height}>
            <RowBody row={row} />
          </list-item>
        )}
      </For>

      <Readout>{snapped}</Readout>

      <Chip tone="bad">device-only, both the snapping and the events</Chip>

      <Prose>
        `scrollstatechange` reports 1 stopped, 2 dragging, 3 decelerating, 4 animating — the four states a paged
        scroller moves through, and the reason snapping belongs to the engine: getting it right means owning the
        deceleration curve, which no amount of scroll-offset arithmetic can reach.
      </Prose>
    </Panel>
  )
}

/** What the preview cannot show, said plainly rather than faked. */
const HonestyPanel = (): LynxElement => (
  <Panel
    title="what this preview is not telling you"
    blurb="Four things, all of which look fine here and are decided on a device."
  >
    <Prose>
      Recycling is absent. Three hundred list-item elements exist in the tree above. On a device the engine keeps a
      screenful plus `preload-buffer-count`, reuses their views as they leave, and `reuse-identifier` decides which pool
      a row comes from. Nothing here recycles anything.
    </Prose>

    <Prose>
      The lists do not scroll. Lynx's default `overflow` is `hidden` and the preview honours that faithfully, so a list
      clips at its fixed height. Giving it `overflow: auto` would have made this screen look better and would have been
      a lie: Lynx has no such value.
    </Prose>

    <Prose>
      The layouts collapse into one. `flow`, `waterfall`, `span-count`, `full-span` and the two gap properties all
      belong to the engine's own layout pass. There is no CSS to approximate them with, so the preview draws a single
      column three times.
    </Prose>

    <Prose>
      `estimated-main-axis-size-px` does nothing here. It is the size the engine assumes for a row it has not measured
      yet, which is what keeps a scrollbar honest before anything has been laid out. With no engine there is nothing to
      estimate for.
    </Prose>

    <Row gap="xs" wrap={true}>
      <Chip tone="good">the tree and the attribute names are real</Chip>
      <Chip tone="good">keyed reconciliation is real</Chip>
      <Chip tone="bad">every behaviour above is not</Chip>
    </Row>
  </Panel>
)
