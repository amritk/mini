import { type LynxElement, signal } from '@amritk/mini-native'

import { Action, Chip, Panel, Prose, Readout, Row, TextLine } from '../components'

/**
 * `/text` — everything about text, which is where Lynx differs most from the
 * web.
 *
 * Two facts do most of the damage to web intuition, and both are silent when
 * you get them wrong. A string is not a text node, it is a `raw-text` ELEMENT
 * carrying a `text` attribute. And ordinary CSS properties do NOT inherit
 * through a container — `enableCSSInheritance` is `false` by default — so a
 * colour on a `view` reaches the nested `<text>` in a browser and reaches
 * nothing at all on a device.
 */
export const TextScreen = (): LynxElement => (
  <view>
    <RawTextPanel />
    <MaxlinePanel />
    <TruncationPanel />
    <NestedPanel />
    <MixedPanel />
    <SelectionPanel />
    <InheritancePanel />
  </view>
)

/** A short paragraph, long enough that a line limit has something to cut. */
const LONG =
  'Lynx measures text on the element that owns it, so a line limit is part of layout rather than a paint-time clip. ' +
  'That is why text-maxline needs overflow: hidden alongside it, and why the count it reports comes back through the ' +
  'layout event rather than being something you can read off the tree.'

/** A glyph small enough to sit inside a line of text. */
const GLYPH = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<rect width="24" height="24" rx="6" fill="#2f5bd7"/>' +
    '<path d="M6 15 L12 7 L18 15 Z" fill="#f4f6fb"/></svg>',
)}`

/** The shape every string in a Lynx tree actually takes. */
const RawTextPanel = (): LynxElement => {
  const taps = signal(0)

  return (
    <Panel
      title="a string is an element"
      blurb="There is no text node in Lynx. A literal lives in a raw-text element's text attribute, and raw-text may only appear inside a text."
    >
      <Readout>{'<text><raw-text text="hello" /></text>'}</Readout>

      <text class="card-title">
        <raw-text text={() => `tapped ${taps()} times`} />
      </text>
      <Action onTap={() => taps(taps() + 1)}>tap</Action>

      <Prose>
        Updating that number writes ONE attribute. There is no node to replace and no subtree to commit, which is worth
        more here than on the web: every property write is a real mutation on the main thread, so writing only what
        changed is not an optimisation, it is the difference between an attribute and a subtree.
      </Prose>

      <Prose>
        The runtime builds the raw-text for you when a string or a getter appears inside a text. Authoring it directly
        is how a run gets its own attributes or its own ref — and it is what the devtool will show you either way.
      </Prose>
    </Panel>
  )
}

/** The three values the line limit demo cycles through. */
const MAXLINES = ['1', '2', '-1'] as const

/** `text-maxline`, and the docs-versus-types conflict it carries. */
const MaxlinePanel = (): LynxElement => {
  const step = signal(1)
  const maxline = (): string => MAXLINES[step() % MAXLINES.length] ?? '-1'
  const layout = signal('no layout event yet')

  return (
    <Panel
      title="text-maxline"
      blurb="Truncation is a layout property here, so it needs overflow: hidden with it. -1 means no limit."
    >
      {/*
       * CONFLICT: the docs' code block types this `number`, the shipped types
       * type it `string`, and the vocabulary follows the types. So it is `'2'`
       * and never `2` — see the adjudicated list at the top of
       * `vocabulary/intrinsic.ts`.
       */}
      <text
        class="card-title"
        text-maxline={maxline}
        style={{ overflow: 'hidden' }}
        bindlayout={(event) => {
          const detail = event.detail
          const truncated = detail.lines.some((line) => line.ellipsisCount > 0)
          layout(`lineCount ${detail.lineCount} · truncated ${truncated ? 'yes' : 'no'}`)
        }}
      >
        <raw-text text={LONG} />
      </text>

      <Row gap="sm">
        <Action onTap={() => step(step() + 1)}>next limit</Action>
        <Chip>{() => `text-maxline="${maxline()}"`}</Chip>
      </Row>

      <Readout>{layout}</Readout>

      <Row gap="xs" wrap={true}>
        <Chip tone="good">the clamp is approximated</Chip>
        <Chip tone="bad">the layout event is device-only</Chip>
      </Row>

      <Prose>
        The preview clamps with the -webkit- line box, which is the only thing a browser has. It gets the visible result
        roughly right and tells you nothing about measurement, so the line count and the per-line ellipsisCount stay
        empty here.
      </Prose>
    </Panel>
  )
}

/** `inline-truncation` — the content shown in place of an ellipsis. */
const TruncationPanel = (): LynxElement => (
  <Panel
    title="inline-truncation"
    blurb="Replaces the ellipsis at the truncation point with content of your own — text, an image, or a view."
  >
    <text class="card-title" text-maxline="2" style={{ overflow: 'hidden' }}>
      <raw-text text={LONG} />
      <inline-truncation>
        <text style={{ color: '#2f5bd7', fontWeight: 'bold' }}>
          <raw-text text=" … read on" />
        </text>
      </inline-truncation>
    </text>

    <Chip tone="bad">the preview draws it as ordinary trailing text</Chip>

    <Prose>
      The types give this tag `NoProps` — no attributes at all — so it is content and nothing else. A browser's line
      clamp has no notion of replacement content, so here the run is simply clipped along with everything else.
    </Prose>
  </Panel>
)

/** Nested `<text>` for styled runs, which is how text styling is done in Lynx. */
const NestedPanel = (): LynxElement => (
  <Panel
    title="nested text"
    blurb="Styled runs come from nesting text inside text. The engine compiles the inner one to inline-text, which is also a tag you may write yourself."
  >
    <text class="card-title">
      <raw-text text="A run with " />
      <text style={{ color: '#c02d47', fontWeight: 'bold' }}>
        <raw-text text="an emphasised span" />
      </text>
      <raw-text text=" inside it, and " />
      <inline-text style={{ fontFamily: 'monospace' }}>
        <raw-text text="inline-text" />
      </inline-text>
      <raw-text text=" written out by hand." />
    </text>

    <Prose>
      A nested run DOES inherit colour and font family from the text around it, which is the one place Lynx lets the
      cascade through. That is the exception; the next panel but two is the rule.
    </Prose>
  </Panel>
)

/** An image inside a line of text. */
const MixedPanel = (): LynxElement => (
  <Panel
    title="mixed text and image"
    blurb="An image nested in a text joins the line box rather than breaking it. The engine compiles it to inline-image."
  >
    <text class="card-title">
      <raw-text text="Mixed layout: " />
      <image src={GLYPH} style={{ width: 18, height: 18 }} />
      <raw-text text=" the glyph sits on the baseline with the words around it, and " />
      <inline-image src={GLYPH} style={{ width: 18, height: 18 }} />
      <raw-text text=" is the same element under the name the engine gives it." />
    </text>

    <Chip tone="bad">the preview breaks the line around both</Chip>

    <Prose>
      Every element in this preview is a custom element the browser lays out as a block, so an image inside a text ends
      up on its own line. It is the clearest case on this screen of the preview being wrong about how something LOOKS
      while being exactly right about what the runtime DID.
    </Prose>
  </Panel>
)

/** `text-selection` and the `selectionchange` payload. */
const SelectionPanel = (): LynxElement => {
  const selection = signal('nothing selected')

  return (
    <Panel
      title="text-selection"
      blurb="Selection and copy are off by default in Lynx — the opposite of a browser, where every string is selectable and nobody asked for it."
    >
      <text
        class="card-title"
        text-selection={true}
        custom-context-menu={false}
        bindselectionchange={(event) => {
          const detail = event.detail
          selection(detail.start < 0 ? 'nothing selected' : `${detail.start} → ${detail.end} (${detail.direction})`)
        }}
      >
        <raw-text text="Try to select this line. On a device the handles and the context menu are the platform's own." />
      </text>

      <Readout>{selection}</Readout>

      <Chip tone="bad">the browser selects text whether or not you asked</Chip>

      <Prose>
        Android additionally wants a `flatten` of false on this element, and it is written as an ordinary prop. The
        runtime passes `false` through as a VALUE rather than reading it as an absence, which is the web habit and the
        wrong one here: Lynx attributes like `flatten` and `accessibility-element` default to true, so a stated false is
        an opt-out and swallowing it would leave the element doing the opposite of what the source says.
      </Prose>

      <Prose>
        `custom-context-menu` and `custom-text-selection` both require `text-selection` first, and the imperative half —
        `setTextSelection`, `getSelectedText`, `getTextBoundingRect` — is reached through a SelectorQuery rather than
        through a prop.
      </Prose>
    </Panel>
  )
}

/** The inheritance rule, which is the headline of this screen. */
const InheritancePanel = (): LynxElement => (
  <Panel
    title="text does not inherit through a container"
    blurb="enableCSSInheritance is false by default, for performance. So a colour on a view reaches nothing, and the web flatters you here."
  >
    {/*
     * The two halves have IDENTICAL style bags. The only difference is which
     * element carries them, and on a device that is the whole difference
     * between a styled run and an unstyled one.
     */}
    <view class="card" style={{ color: '#c02d47', fontSize: 20, fontWeight: 'bold' }}>
      <TextLine class="card-meta">style on the view</TextLine>
      <text>
        <raw-text text="This run is unaffected on a device." />
      </text>
    </view>

    <text class="card" style={{ color: '#c02d47', fontSize: 20, fontWeight: 'bold' }}>
      <raw-text text="This run is styled, because the style is on the text." />
      <text style={{ fontStyle: 'italic' }}>
        <raw-text text=" And this nested one inherits it." />
      </text>
    </text>

    <Row gap="xs" wrap={true}>
      <Chip tone="good">the preview reproduces this one</Chip>
      <Chip>because the reset re-asserts font and colour on every element</Chip>
    </Row>

    <Prose>
      Turning inheritance on is a page config, not a stylesheet decision, and it only ever covers twelve properties —
      direction, color, font-family, font-size, font-style, font-weight, letter-spacing, line-height, line-spacing,
      text-align, text-decoration and text-shadow. Custom properties are the exception that needs no flag: they inherit
      by default, which is why theming in Lynx is built out of variables rather than out of a cascade.
    </Prose>

    <Prose>
      The keyword `inherit` does not exist here either, so there is no way to ask for it one declaration at a time.
      Nesting text inside text is the mechanism, and it is the only mechanism.
    </Prose>
  </Panel>
)
