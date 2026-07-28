import { type LynxElement, signal, toStyleText } from '@amritk/mini-lynx'

import { Action, Chip, Panel, Prose, Readout, Row, TextLine } from '../components'

/**
 * `/styling` — Lynx CSS as a first-class channel.
 *
 * The old package had no stylesheet to speak of: its one portable styling
 * channel was a bag of density-independent pixels, because that was the most a
 * five-tag vocabulary spanning three hosts could promise. Lynx has real CSS —
 * selectors, the cascade, custom properties, keyframes, three layout systems —
 * so the honest way to write a Lynx app is to use it.
 *
 * Everything on this screen is inline style rather than authored classes, and
 * that is a constraint of the screen rather than a recommendation: the app's
 * stylesheet is `src/styles.css`, and the classes this screen borrows from it
 * (`card`, `chip`, `row`) are what the recommendation looks like in practice.
 */
export const StylingScreen = (): LynxElement => (
  <view>
    <ChannelsPanel />
    <UnitsPanel />
    <VariablesPanel />
    <MotionPanel />
    <LinearPanel />
    <RelativePanel />
    <GridPanel />
    <TransformPanel />
  </view>
)

/** Classes versus inline style, and which job each one is for. */
const ChannelsPanel = (): LynxElement => {
  const lit = signal(false)

  return (
    <Panel
      title="two channels, two jobs"
      blurb="A class is resolved once by the engine; an inline declaration is written on every change. So classes carry what is static and style carries what is genuinely dynamic."
    >
      <Row gap="sm">
        <view class="card">
          <TextLine class="card-meta">class="card" — one __SetClasses call, ever</TextLine>
        </view>
        <view class="card" style={() => ({ backgroundColor: lit() ? '#2f5bd7' : '#eef1f8' })}>
          <TextLine class="card-meta">class + one reactive declaration</TextLine>
        </view>
      </Row>

      <Action onTap={() => lit(!lit())}>toggle the dynamic half</Action>

      <Prose>
        Inline style beats a selector in the cascade, exactly as on the web, so the toggle above overrides `.card`
        without anybody counting specificity. `!important` does not exist by default — it is opt-in from engine version
        3.9 — which makes that ordering the whole story rather than the start of one.
      </Prose>

      <Prose>
        Lynx's selector support stops sooner than the web's, and the omissions are the ones that would tempt you into
        putting behaviour in CSS: three pseudo-classes only (`:active`, `:not()`, `:root`), no pseudo-elements at all,
        and no attribute selectors. Type, class, id, universal and all four combinators do work.
      </Prose>
    </Panel>
  )
}

/** The three forms a style prop takes, all landing on identical elements. */
const FORMS = ['bag', 'getter', 'css text'] as const

/** The unit rule, which is this runtime's one deliberate divergence from Lynx. */
const UnitsPanel = (): LynxElement => {
  const step = signal(0)
  const form = (): (typeof FORMS)[number] => FORMS[step() % FORMS.length] ?? 'bag'

  return (
    <Panel
      title="there is no implicit unit"
      blurb="In Lynx's CSS a bare number is not a length. width: 100 is invalid and silently does nothing; 0 is the only number a length takes bare."
    >
      <Row gap="sm">
        {/*
         * Three spellings of one declaration set, side by side and identical on
         * screen. The bag is what an app writes; the getter is the same bag
         * rebuilt whenever something it reads changes; the CSS string is handed
         * to the engine untouched, which is why a `display` inside one cannot be
         * remembered for `show` to restore later.
         */}
        <view style={{ width: 72, height: 44, borderRadius: 8, backgroundColor: '#2f5bd7' }} />
        <view style={() => ({ width: 72, height: 44, borderRadius: 8, backgroundColor: '#2f5bd7' })} />
        <view style="width:72px;height:44px;border-radius:8px;background-color:#2f5bd7" />
      </Row>

      <Row gap="sm">
        <Action onTap={() => step(step() + 1)}>{() => `explain the ${form()}`}</Action>
        <Chip>{() => FORM_NOTES[form()]}</Chip>
      </Row>

      <Readout>{`toStyleText('width', 100) → '${toStyleText('width', 100)}'`}</Readout>
      <Readout>{`toStyleText('opacity', 0.5) → '${toStyleText('opacity', 0.5)}'`}</Readout>
      <Readout>{`toStyleText('width', '50%') → '${toStyleText('width', '50%')}'`}</Readout>
      <Readout>{`toStyleText('--gap', 8) → '${toStyleText('--gap', 8)}'`}</Readout>

      <Prose>
        A bare number in a style bag means density-independent pixels and this runtime appends the unit — an ergonomic
        of ours, not a translation of anything the engine does. ReactLynx appends nothing, so `width: 100` there is a
        bug that typechecks and then quietly lays out at zero.
      </Prose>

      <Prose>
        The unitless list is deliberately short, and Lynx's own unitless properties are NOT on it: `linear-weight`,
        `relative-id`, the `relative-*-of` family and the two grid spans all take a plain number in CSS and would come
        out as `1px` from a bag. Write those as strings, which is what the panels below do.
      </Prose>
    </Panel>
  )
}

/** One line on what each style form is for. */
const FORM_NOTES: Readonly<Record<(typeof FORMS)[number], string>> = {
  bag: 'a plain object, applied once at creation',
  getter: 'the same object, rebuilt on every dependency change',
  'css text': 'declarations the engine parses as CSS, passed through untouched',
}

/** Custom properties, and why a theme in Lynx is a class rather than a query. */
const VariablesPanel = (): LynxElement => {
  const dusk = signal(false)

  return (
    <Panel
      title="custom properties, and the theme that is a class"
      blurb="Variables are the one thing Lynx inherits by default. Every other property stops at a container, which is why theming here is built out of var() rather than out of the cascade."
    >
      {/*
       * The variables are declared on the ancestor and read by the descendants,
       * which is the pattern the docs prescribe for theming. Swapping the two
       * values is the whole theme switch — nothing below is rebuilt, and no
       * descendant knows a theme exists.
       */}
      <view
        class="card"
        style={() => ({
          '--demo-surface': dusk() ? '#141924' : '#ffffff',
          '--demo-ink': dusk() ? '#e8ecf4' : '#131722',
          '--demo-accent': dusk() ? '#7ea2ff' : '#2f5bd7',
        })}
      >
        <view style={{ padding: 10, borderRadius: 8, backgroundColor: 'var(--demo-surface)' }}>
          <text style={{ color: 'var(--demo-ink)', fontSize: 14 }}>
            <raw-text text="A descendant reading var(--demo-ink)" />
          </text>
          <view style={{ height: 6, marginTop: 6, borderRadius: 3, backgroundColor: 'var(--demo-accent)' }} />
        </view>
      </view>

      <Action onTap={() => dusk(!dusk())}>{() => (dusk() ? 'to daylight' : 'to dusk')}</Action>

      <Prose>
        Lynx has no `@media` and no `prefers-color-scheme` — neither exists in the engine's CSS. The platform's colour
        scheme arrives as DATA, through `globalProps` or a system-information global, and the app decides what to do
        with it. The switch in this app's header is that decision: it toggles `.theme-dark` on the page, and
        `styles.css` redefines the same variables under that class.
      </Prose>

      <Prose>
        There is an imperative half too — `lynx.getElementById(id).setProperty('--demo-ink', '#fff')` — which pushes a
        theme change without touching the tree at all. Arithmetic on a variable needs `calc()`, and `var()` takes a
        fallback after the first comma exactly as it does on the web.
      </Prose>
    </Panel>
  )
}

/** Transitions, which run here, and keyframes, which need a stylesheet. */
const MotionPanel = (): LynxElement => {
  const shifted = signal(false)

  return (
    <Panel
      title="transition and @keyframes"
      blurb="A transition is entirely a style-channel affair, so it works from an inline bag. A keyframe animation names a rule, and a rule has to live in a stylesheet."
    >
      <view
        style={() => ({
          width: shifted() ? 220 : 96,
          height: 40,
          borderRadius: 8,
          backgroundColor: shifted() ? '#12704a' : '#2f5bd7',
          transition: 'width 320ms ease-in-ease-out, background-color 320ms linear',
        })}
      />

      <Action onTap={() => shifted(!shifted())}>run the transition</Action>

      <Readout>{'@keyframes pulse { from { opacity: 0.4 } to { opacity: 1 } }'}</Readout>
      <Readout>{'.pulsing { animation: pulse 1.2s ease-in-out infinite alternate }'}</Readout>

      <Row gap="xs">
        <Chip tone="good">the transition is real in both targets</Chip>
        <Chip tone="bad">the keyframes above are text, not a running animation</Chip>
      </Row>

      <Prose>
        `transition-property` is a restricted enum rather than any property name, and `@keyframes` interpolates a fixed
        allow-list — sizes, offsets, colours, opacity, transform, the paddings and margins, `flex-basis` and `filter`.
        Two of the timing functions are Lynx's own: `ease-in-ease-out` and `square-bezier`.
      </Prose>

      <Prose>
        Lynx has exactly three at-rules — `@import`, `@font-face` and `@keyframes` — and no way to declare one from a
        style bag, which is why this panel shows the source rather than running it. The other way in is
        `element.animate()`, a WAAPI-shaped API on a main-thread element handle since engine 3.4.
      </Prose>
    </Panel>
  )
}

/** `linear-*`, the layout Lynx actually defaults to. */
const LinearPanel = (): LynxElement => (
  <Panel
    title="linear is the default, not flex"
    blurb="Lynx's default display is linear and linear's default direction is column, so an unstyled container stacks — which looks like flex and is a different algorithm."
  >
    {/*
     * `linear-weight` is a NUMBER in Lynx's CSS and is not on this runtime's
     * unitless list, so it is written as a string. A bare `1` would reach the
     * engine as `1px` and be dropped without a word.
     */}
    <view
      style={{
        display: 'linear',
        'linear-orientation': 'horizontal',
        height: 40,
        gap: 6,
      }}
    >
      <view style={{ 'linear-weight': '1', backgroundColor: '#2f5bd7', borderRadius: 6 }} />
      <view style={{ 'linear-weight': '2', backgroundColor: '#7ea2ff', borderRadius: 6 }} />
      <view style={{ 'linear-weight': '1', backgroundColor: '#dde2ee', borderRadius: 6 }} />
    </view>

    <view style={{ display: 'flex', flexDirection: 'row', height: 40, gap: 6, marginTop: 8 }}>
      <view style={{ flexGrow: 1, backgroundColor: '#2f5bd7', borderRadius: 6 }} />
      <view style={{ flexGrow: 2, backgroundColor: '#7ea2ff', borderRadius: 6 }} />
      <view style={{ flexGrow: 1, backgroundColor: '#dde2ee', borderRadius: 6 }} />
    </view>

    <Row gap="xs">
      <Chip tone="bad">the first row is approximated with flex here</Chip>
      <Chip tone="good">the second is the real thing</Chip>
    </Row>

    <Prose>
      The preview reproduces linear as a flex column, which matches the observable behaviour for the common case and
      diverges the moment weights are involved — `linear-weight`, `linear-weight-sum`, `linear-gravity` and
      `linear-cross-gravity` have no CSS equivalent at all. Whether `linear` is the default is itself a page config,
      `defaultDisplayLinear`, which a runtime driving the PAPI owns rather than inherits.
    </Prose>
  </Panel>
)

/** `relative-*`, Lynx's constraint layout, which the web has no answer to. */
const RelativePanel = (): LynxElement => (
  <Panel
    title="relative layout"
    blurb="Children position themselves against siblings by numeric id, Android RelativeLayout style. There is no web layout mode that resembles it."
  >
    <view class="card" style={{ display: 'relative', height: 96 }}>
      <view
        style={{
          'relative-id': '1',
          'relative-align-top': 'true',
          'relative-align-left': 'true',
          width: 88,
          height: 32,
          borderRadius: 6,
          backgroundColor: '#2f5bd7',
        }}
      />
      <view
        style={{
          'relative-id': '2',
          'relative-right-of': '1',
          'relative-align-top': 'true',
          width: 88,
          height: 32,
          marginLeft: 8,
          borderRadius: 6,
          backgroundColor: '#7ea2ff',
        }}
      />
      <view
        style={{
          'relative-id': '3',
          'relative-bottom-of': '1',
          'relative-center': 'horizontal',
          width: 120,
          height: 32,
          marginTop: 8,
          borderRadius: 6,
          backgroundColor: '#dde2ee',
        }}
      />
    </view>

    <Chip tone="bad">the preview draws a plain column</Chip>

    <Prose>
      Every one of those values is a string on purpose. `relative-id` and the four `relative-*-of` properties are
      numeric in Lynx's CSS with `-1` as their default, and the booleans are enums — none of them is on this runtime's
      unitless list, so a bare number would arrive as a length and be discarded.
    </Prose>
  </Panel>
)

/** Grid, which Lynx has and which the browser happens to have too. */
const GridPanel = (): LynxElement => (
  <Panel
    title="grid"
    blurb="A third layout mode alongside linear and flex, with Lynx's own span properties instead of the web's line-based shorthands."
  >
    <view
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridRowGap: '6px',
        gridColumnGap: '6px',
      }}
    >
      <view style={{ height: 32, borderRadius: 6, backgroundColor: '#2f5bd7' }} />
      <view style={{ height: 32, borderRadius: 6, backgroundColor: '#7ea2ff' }} />
      <view style={{ height: 32, borderRadius: 6, backgroundColor: '#dde2ee' }} />
      {/* `grid-column-span` is Lynx's spelling; the web writes `grid-column: span 2`. */}
      <view style={{ 'grid-column-span': '2', height: 32, borderRadius: 6, backgroundColor: '#12704a' }} />
      <view style={{ height: 32, borderRadius: 6, backgroundColor: '#dde2ee' }} />
    </view>

    <Chip tone="neutral">the browser draws the grid and ignores the span</Chip>

    <Prose>
      `grid-column-gap` and `grid-row-gap` are separate engine properties from `column-gap` and `row-gap`, which is not
      true on the web. `grid-template-areas`, `grid-area` and the `place-*` shorthands do not exist here at all.
    </Prose>
  </Panel>
)

/** Transforms, which behave the way the web taught you to expect. */
const TransformPanel = (): LynxElement => {
  const turned = signal(false)

  return (
    <Panel
      title="transform"
      blurb="One of the few visual properties that is the same on both targets, down to the transform-origin syntax."
    >
      <Row gap="md">
        <view
          style={() => ({
            width: 56,
            height: 56,
            borderRadius: 10,
            backgroundColor: '#2f5bd7',
            transformOrigin: 'center center',
            transform: turned() ? 'rotate(24deg) scale(1.15)' : 'rotate(0deg) scale(1)',
            transition: 'transform 260ms ease-in-out',
          })}
        />
        <Action onTap={() => turned(!turned())}>turn it</Action>
      </Row>

      <Prose>
        What is missing is the newer half: `transform-style`, `backface-visibility`, the individual `rotate` / `scale` /
        `translate` properties and `will-change` are all absent from the engine's property table. `perspective` is
        there; `perspective-origin` is not.
      </Prose>
    </Panel>
  )
}
