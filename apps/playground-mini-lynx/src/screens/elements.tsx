import { type ContainerChildren, type LynxElement, signal } from '@amritk/mini-lynx'

import { Action, Chip, Panel, Prose, Readout, Row, TextLine } from '../components'

/**
 * `/` — the breadth screen.
 *
 * The previous playground could show five tags, because five tags were all the
 * package had a name for. This screen exists to make the new ceiling visible:
 * everything below is the ENGINE's vocabulary, reached with no translation
 * table, so a tag is available here the moment Lynx builds it rather than the
 * moment this repo cuts a release.
 *
 * Elements the browser preview cannot draw are still BUILT rather than
 * described, and each one carries a chip saying what the preview actually
 * manages. A screen that quietly omitted them would be back to showing a
 * subset — the exact thing the rewrite removed.
 */
export const ElementsScreen = (): LynxElement => (
  <view>
    <ViewPanel />
    <ImagePanel />
    <ScrollPanel />
    <ScrollCoordinatorPanel />
    <FramePanel />
    <GalleryPanel />
  </view>
)

/**
 * The picture every image on this screen loads.
 *
 * An inline `data:` URI rather than a URL or a bundled file, so nothing here
 * depends on the network: an image that failed to arrive would look exactly
 * like the `mode` demo being broken, which is the wrong thing for a screen
 * whose whole job is to be trustworthy about what the engine did.
 */
const SWATCH = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100">' +
    '<rect width="160" height="100" fill="#2f5bd7"/>' +
    '<circle cx="46" cy="50" r="28" fill="#7ea2ff"/>' +
    '<path d="M96 74 L124 30 L146 74 Z" fill="#f4f6fb"/>' +
    '</svg>',
)}`

/** `view`, `wrapper`, and the layout default that surprises people. */
const ViewPanel = (): LynxElement => (
  <Panel
    title="view"
    blurb="The tag most trees are mostly made of, and the only one with no attributes of its own — everything a view accepts is a global attribute."
  >
    <Row gap="sm">
      <view style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#2f5bd7' }} />
      <view style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#7ea2ff' }} />
      <view
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#2f5bd7',
        }}
        accessibility-element={true}
        accessibility-traits="image"
        accessibility-label="An outlined square"
      />
    </Row>

    <view class="card">
      <TextLine class="card-meta">two children, no layout properties set at all</TextLine>
      <view style={{ height: 18, backgroundColor: '#2f5bd7', borderRadius: 4 }} />
      <view style={{ height: 18, marginTop: 4, backgroundColor: '#7ea2ff', borderRadius: 4 }} />
    </view>

    <Prose>
      They stack downwards, and not because anything here said so. Lynx's default display is `linear`, not `flex`, and
      linear's default direction is `column` — so the net behaviour looks like a flex column while being a different
      layout algorithm underneath.
    </Prose>

    {/*
     * `wrapper` is the one tag hand-written into the vocabulary, because the
     * engine builds it (`__CreateWrapperElement`) and `@lynx-js/types` does not
     * declare it. It takes part in neither layout nor the accessibility tree,
     * which is exactly why every control-flow component owns one: a `view` here
     * would turn a `For` inside a row into ONE row item instead of many.
     */}
    <Row gap="xs">
      <wrapper>
        <Chip>wrapper</Chip>
        <Chip>holds these two</Chip>
      </wrapper>
      <Chip tone="good">and is not a box</Chip>
    </Row>
  </Panel>
)

/** Lynx's four `mode` values, in the order the docs list them. */
const MODES = ['scaleToFill', 'aspectFit', 'aspectFill', 'center'] as const

/**
 * The payload `<image>`'s `load` actually delivers.
 *
 * CONFLICT, and an unusual one: `@lynx-js/types` types `bindload` as
 * `BaseEvent<'load', ImageLoadEvent>`, which nests the payload under `detail` —
 * but `ImageLoadEvent` is itself a whole event object carrying `width` and
 * `height` at the TOP level, so the declaration wraps an event inside an event
 * and puts the size one level deeper than it ever arrives. The docs and the
 * engine agree the fields are top-level, and so does the preview's PAPI.
 *
 * Widening the parameter rather than casting the event is what keeps this
 * handler assignable to the prop the vocabulary declares.
 */
type ImageLoadPayload = {
  type: string
  width?: number
  height?: number
}

/** `image` — `mode`, `placeholder`, `blur-radius`, `auto-size` and the `load` payload. */
const ImagePanel = (): LynxElement => {
  const step = signal(0)
  const mode = (): (typeof MODES)[number] => MODES[step() % MODES.length] ?? 'scaleToFill'
  const loaded = signal('waiting for load…')

  return (
    <Panel
      title="image"
      blurb="A leaf element: it needs a src plus either a size or auto-size, or it lays out at zero and reads as a missing element rather than a broken one."
    >
      <Row gap="sm">
        <image
          src={SWATCH}
          mode={mode}
          style={{ width: 96, height: 96, borderRadius: 10 }}
          bindload={(event: ImageLoadPayload) => loaded(`load: ${event.width ?? '?'} × ${event.height ?? '?'} px`)}
          binderror={() => loaded('error: the src did not resolve')}
        />
        <view>
          <TextLine>{() => `mode="${mode()}"`}</TextLine>
          <TextLine class="card-meta">
            {() =>
              ({
                scaleToFill: 'stretches, ignoring the aspect ratio',
                aspectFit: 'fits the long side, letterboxing',
                aspectFill: 'fills the short side, cropping',
                center: 'does not scale at all',
              })[mode()]
            }
          </TextLine>
          <Action onTap={() => step(step() + 1)}>next mode</Action>
        </view>
      </Row>

      <Readout>{loaded}</Readout>

      <Row gap="sm">
        {/*
         * `placeholder` takes the same value shapes as `src`, so it is shown
         * here as the same picture — on a device it is what fills the box while
         * a slow `src` is still in flight.
         */}
        <view>
          <TextLine class="card-meta">blur-radius + placeholder</TextLine>
          <image
            src={SWATCH}
            placeholder={SWATCH}
            blur-radius="6px"
            style={{ width: 96, height: 64, borderRadius: 8 }}
          />
        </view>
        <view>
          <TextLine class="card-meta">auto-size, no width or height</TextLine>
          <image src={SWATCH} auto-size={true} />
        </view>
      </Row>

      <Row gap="xs" wrap={true}>
        <Chip tone="good">mode is real here</Chip>
        <Chip tone="bad">blur-radius is not</Chip>
        <Chip>auto-size is the browser's own intrinsic sizing, not the engine's</Chip>
      </Row>
    </Panel>
  )
}

/** Twelve rows, so the vertical scroller has something to scroll. */
const SCROLL_ROWS = Array.from({ length: 12 }, (_, index) => `row ${index + 1}`)

/** `scroll-view` — both orientations, the real `scroll` payload, and the edge events. */
const ScrollPanel = (): LynxElement => {
  const offsets = signal('scroll to see the payload')
  const edge = signal('no edge event yet')

  return (
    <Panel
      title="scroll-view"
      blurb="The plain scroller. Its direct children only honour linear and sticky layout, so the usual shape is one wrapper view inside it."
    >
      <scroll-view
        class="card"
        scroll-orientation="vertical"
        style={{ height: 140 }}
        upper-threshold={16}
        lower-threshold={16}
        bindscroll={(event) => {
          const detail = event.detail
          offsets(
            `scrollTop ${Math.round(detail.scrollTop)} · scrollHeight ${Math.round(detail.scrollHeight)} · deltaY ${Math.round(detail.deltaY)}`,
          )
        }}
        bindscrolltoupper={() => edge('scrolltoupper')}
        bindscrolltolower={() => edge('scrolltolower')}
      >
        <view>
          {SCROLL_ROWS.map((label) => (
            <TextLine class="card-meta">{label}</TextLine>
          ))}
        </view>
      </scroll-view>

      <Readout>{offsets}</Readout>
      <Readout>{edge}</Readout>

      {/*
       * `.row` gives this the same treatment `app.tsx` gives the tab bar. On a
       * device the class is inert on a scroll-view — the engine forces linear
       * layout and `scroll-orientation` picks the axis — and in the preview it
       * is what actually turns the box sideways.
       */}
      <scroll-view class="row gap-sm" scroll-orientation="horizontal" style={{ height: 44 }} scroll-bar-enable={false}>
        {SCROLL_ROWS.map((label) => (
          <Chip>{label}</Chip>
        ))}
      </scroll-view>

      <Row gap="xs" wrap={true}>
        <Chip tone="good">scroll fires, with the engine's field names</Chip>
        <Chip tone="bad">scrolltoupper / scrolltolower are device-only</Chip>
      </Row>

      <Prose>
        The two edge events have no DOM equivalent to be sourced from, so the preview registers them and nothing ever
        dispatches them. Thresholds are in px and `initial-scroll-offset` applies exactly once, at first layout.
      </Prose>
    </Panel>
  )
}

/**
 * `scroll-coordinator` — the collapsing-header shape, as five engine tags.
 *
 * This is the layout every content app builds and nobody builds well: a header
 * that collapses as you scroll, a toolbar that pins under it, and an inner
 * scroller that takes over once the header is out of the way. Doing it by hand
 * means driving two scrollers from one gesture stream and reconciling them
 * every frame, which is the kind of work that is fine at sixty frames per
 * second right up until it is not.
 *
 * The engine owns the coordination, so the app declares the parts and stops.
 * The layout invariant worth remembering is the one the types cannot state:
 * the coordinator's height is the slot's height PLUS the toolbar's, and the
 * scrollable distance is the header's height minus the toolbar's — which is
 * exactly the `height` the offset event reports.
 */
const ScrollCoordinatorPanel = (): LynxElement => {
  const offset = signal('no offset event yet')

  return (
    <Panel
      title="scroll-coordinator"
      blurb="A collapsing header, a pinned toolbar and an inner scroller, coordinated by the engine rather than by the app. Five tags, no gesture code."
    >
      <scroll-coordinator
        class="card"
        style={{ height: 180 }}
        header-over-slot={false}
        enable-scroll={true}
        granularity={1}
        refresh-mode="fold"
        bindoffset={(event) => {
          const detail = event.detail
          offset(`offset ${Math.round(detail.offset)} of ${Math.round(detail.height)}`)
        }}
      >
        {/*
         * The header is positioned absolutely by the engine — giving it a
         * `position` here would fight the thing that scrolls it.
         */}
        <scroll-coordinator-header style={{ height: 88, backgroundColor: '#eef1f8' }}>
          <view class="gap-xs" style={{ padding: 12 }}>
            <TextLine>the collapsing half</TextLine>
            <TextLine class="card-meta">scrolls away under the toolbar</TextLine>
          </view>
        </scroll-coordinator-header>

        {/* The bar that survives the collapse and pins between header and slot. */}
        <scroll-coordinator-toolbar style={{ height: 36, backgroundColor: '#dfe5f4' }}>
          <Row gap="xs">
            <Chip>pinned</Chip>
            <Chip>toolbar</Chip>
          </Row>
        </scroll-coordinator-toolbar>

        <scroll-coordinator-slot style={{ height: 120 }}>
          <scroll-view scroll-orientation="vertical" style={{ height: 120 }}>
            <view>
              {SCROLL_ROWS.map((label) => (
                <TextLine class="card-meta">{label}</TextLine>
              ))}
            </view>
          </scroll-view>
        </scroll-coordinator-slot>
      </scroll-coordinator>

      <Readout>{offset}</Readout>

      {/*
       * The drag variant is a peer of the plain slot rather than a child of it,
       * and it is types-only — no docs page anywhere, `enable-drag` its single
       * attribute. It is built here and kept out of the way, because a second
       * slot inside one coordinator is not a layout the engine promises
       * anything about.
       */}
      <scroll-coordinator-slot-drag enable-drag={true} show={false} style={{ height: 0 }}>
        <TextLine class="card-meta">the draggable slot variant</TextLine>
      </scroll-coordinator-slot-drag>

      <Row gap="xs" wrap={true}>
        <Chip tone="good">the tree, the nesting and the attribute names</Chip>
        <Chip tone="bad">no coordination — three stacked boxes here</Chip>
      </Row>

      <Prose>
        Nothing coordinates in a browser: the preview draws three unknown elements in a column and the offset event
        never fires, because there is no DOM event to source it from. What the preview is good for is the part that is
        easy to get wrong anyway — that the four sub-elements nest in the one order the engine accepts.
      </Prose>
    </Panel>
  )
}

/** `frame` — one Lynx page embedded inside another. */
const FramePanel = (): LynxElement => (
  <Panel
    title="frame"
    blurb="Embeds a second Lynx page the way an iframe embeds a document — its own bundle, its own initData, its own globalProps."
  >
    <frame
      src="/frames/preview.lynx.bundle"
      data={{ title: 'an embedded page' }}
      global-props={{ theme: 'playground' }}
      auto-height={true}
      preset-height="96px"
      style={{ width: '100%', height: 96, borderRadius: 8, backgroundColor: '#eef1f8' }}
    />

    <Row gap="xs" wrap={true}>
      <Chip tone="bad">nothing renders here</Chip>
      <Chip>Android and iOS only, and there is no second bundle to load</Chip>
    </Row>

    <Prose>
      `src` is the one attribute the shipped types mark REQUIRED, and the vocabulary keeps it required — the mapping is
      homomorphic, so optionality comes through from Lynx unchanged rather than being flattened.
    </Prose>
  </Panel>
)

/**
 * One gallery entry: the element, built for real, and an honest note.
 *
 * The note is the point of the component. Describing these tags in prose would
 * have been easier and would have proved nothing; building them means the JSX
 * typings, the per-tag creators and the attribute spellings are all genuinely
 * exercised, and the chip is where the preview admits what it cannot draw.
 */
type GalleryItemProps = {
  title: string
  /** What the browser preview actually manages. */
  note: string
  tone: 'good' | 'bad' | 'neutral'
  children?: ContainerChildren
}

const GalleryItem = (props: GalleryItemProps): LynxElement => (
  <view class="card">
    <Row gap="xs" wrap={true}>
      <TextLine>{props.title}</TextLine>
      <Chip tone={props.tone}>{props.note}</Chip>
    </Row>
    {props.children}
  </view>
)

/** The exotic end of the vocabulary, built rather than described. */
const GalleryPanel = (): LynxElement => (
  <Panel
    title="the rest of the engine"
    blurb="Seven tags the old five-tag vocabulary could not name at all. Every one is built here; the chips say what survives the trip to a browser."
  >
    <GalleryItem title="svg" note="leaf, and unknown to a browser" tone="bad">
      {/*
       * A LEAF from Lynx's point of view, which is the surprising part: the SVG
       * document arrives as a STRING through `content` or `src`, and its own
       * tags are not JSX intrinsic elements. Writing `<circle>` here would
       * promise a nesting the engine never accepts.
       */}
      <svg
        style={{ width: 64, height: 64 }}
        content={
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
          '<circle cx="12" cy="12" r="10" fill="#2f5bd7"/></svg>'
        }
      />
    </GalleryItem>

    <GalleryItem title="blur-view" note="a plain box here" tone="bad">
      <blur-view
        blur-radius="12px"
        blur-effect="light"
        blur-sampling={6}
        style={{ width: 140, height: 56, borderRadius: 8, backgroundColor: '#eef1f8' }}
      >
        <TextLine class="card-meta">backdrop blur, not a filter on itself</TextLine>
      </blur-view>
    </GalleryItem>

    <GalleryItem title="viewpager" note="stacks instead of paging" tone="neutral">
      <viewpager initial-select-index={0} enable-scroll={true} style={{ width: '100%', height: 52 }}>
        <viewpager-item style={{ width: '100%' }}>
          <TextLine class="card-meta">page one</TextLine>
        </viewpager-item>
        <viewpager-item style={{ width: '100%' }}>
          <TextLine class="card-meta">page two</TextLine>
        </viewpager-item>
      </viewpager>
    </GalleryItem>

    <GalleryItem title="refresh" note="no pull gesture in a browser" tone="bad">
      {/* Up to two direct children: the header, and one vertically scrollable element. */}
      <refresh enable-refresh={true} style={{ width: '100%', height: 76 }}>
        <refresh-header style={{ height: 24 }}>
          <TextLine class="card-meta">pull down…</TextLine>
        </refresh-header>
        <scroll-view scroll-orientation="vertical" style={{ height: 52 }}>
          <view>
            <TextLine class="card-meta">the scrollable half</TextLine>
          </view>
        </scroll-view>
      </refresh>
    </GalleryItem>

    {/*
     * `show={false}` rather than only `visible={false}`: an overlay is required
     * to be `position: fixed`, and a fixed element the preview happened to draw
     * would sit on top of the whole screen. The runtime's own visibility channel
     * is what keeps it out of the way without pretending the tag is absent.
     */}
    <GalleryItem title="overlay" note="built, deliberately not shown" tone="neutral">
      <overlay visible={false} level={1} mode="window" show={false} style={{ position: 'fixed' }}>
        <view class="card">
          <TextLine class="card-meta">exactly one direct child, and this is it</TextLine>
        </view>
      </overlay>
    </GalleryItem>

    <GalleryItem title="webview" note="an empty box, no network" tone="bad">
      <webview
        src="https://lynxjs.org/"
        enable-debug={false}
        native-interaction-enabled={false}
        style={{ width: '100%', height: 64, borderRadius: 8, backgroundColor: '#eef1f8' }}
      />
    </GalleryItem>

    <GalleryItem title="filter-image" note="undocumented upstream; types only" tone="bad">
      {/*
       * Note the irregularity the types record: `filter-image`'s `load` and
       * `error` nest their fields under `detail`, where plain `image` puts the
       * same fields at the top level. Same word, two shapes.
       */}
      <filter-image
        src={SWATCH}
        mode="aspectFill"
        blur-radius="4px"
        drop-shadow="0px 2px 6px rgba(0, 0, 0, 0.35)"
        style={{ width: 120, height: 64, borderRadius: 8 }}
      />
    </GalleryItem>

    <GalleryItem title="title-bar-view" note="Clay desktop only; inert everywhere else" tone="neutral">
      {/*
       * A draggable window region — the web's `app-region: drag`, for a desktop
       * Lynx window. `moveable` is its one attribute, which makes it the
       * smallest prop surface in the whole vocabulary.
       */}
      <title-bar-view moveable={true} style={{ width: '100%', height: 32, backgroundColor: '#eef1f8' }}>
        <TextLine class="card-meta">drag the window by this strip</TextLine>
      </title-bar-view>
    </GalleryItem>

    <GalleryItem title="video" note="global attributes only at the pinned types version" tone="neutral">
      {/*
       * The version-skew arm, visible. `video` arrived in `@lynx-js/types`
       * 4.1.0 and this repo pins the peer floor, 4.0.0 — so the tag exists and
       * takes every global attribute, while its OWN props (`src`, `loop`,
       * `muted`) are not known to the compiler here. Writing `src` on it would
       * be a type error in this file until the types are bumped.
       *
       * That is the derived vocabulary behaving correctly rather than a gap:
       * the tag surface tracks the engine version the APP pins, so an app on
       * 4.1.0 gets the props with no release in this package, and an app on the
       * floor gets a usable tag instead of a compile error in ours.
       *
       * Biome's `useMediaCaption` is turned off for this package and this app
       * because of this line, and the reason is not that captions do not
       * matter. It is that the rule is asking for an HTML `<track>` child, and
       * Lynx's `video` is a LEAF — there is no child to give it. Captioning a
       * Lynx video is the engine's affair, not a JSX one, so the rule cannot be
       * satisfied here rather than merely being inconvenient.
       */}
      <video style={{ width: 140, height: 64, borderRadius: 8, backgroundColor: '#eef1f8' }} />
      <TextLine class="card-meta">@lynx-js/types 4.0.0 here — bump to 4.1.0 and src appears</TextLine>
    </GalleryItem>

    <Prose>
      None of these needed a release in this package. That is the actual test of the rewrite: the ceiling moved from
      "what this package has named" to "what the engine can do", and those change at very different rates.
    </Prose>

    <Prose>
      Two tags are left out on purpose rather than forgotten. `page` is the root the framework already generates, and
      the engine forbids setting its size — authoring a second one inside this tree would be building a root inside a
      root. `component` is Lynx's own component instantiation, and this runtime does not drive Lynx's component system:
      it owns the whole tree and composes with plain functions instead.
    </Prose>
  </Panel>
)
