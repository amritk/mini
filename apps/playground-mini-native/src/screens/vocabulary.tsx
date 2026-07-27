import { type HostElement, signal } from '@amritk/mini-native'
import { Stack, Text } from '@amritk/mini-native/ui'

import { Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext, RADIUS } from '../theme'

/**
 * The five tags every host renders. These are not HTML: there is no `<div>`,
 * and there never will be — the DOM is the preview target here, not the real
 * one. `<view>` becomes a `<div>` and `<text>` a `<span>` only because that is
 * what this particular host does with them.
 */
export const VocabularyScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      view · text · image · scroll-view · input. Only text may hold a text run, and role says what an element IS — which
      is why the DOM host can build a real &lt;button&gt; from it instead of re-synthesising one.
    </Text>
    <TextRuns />
    <Roles />
    <Images />
    <Scrolling />
    <Inputs />
    <Events />
  </Stack>
)

/** `<text>` — the only tag that may hold a text run, and its two own props. */
const TextRuns = (): HostElement => {
  const clamped = signal(true)

  return (
    <Panel
      title="text"
      blurb="A container holds elements, never a bare string: <view>hello</view> does not compile, because a native view tree has no place to put a loose text run and the screen would come up blank on a device."
    >
      <text
        lines={() => (clamped() ? 2 : 0)}
        selectable
        style={{ fontSize: 14, lineHeight: 21 }}
        onTap={() => clamped(!clamped())}
      >
        Tap this paragraph to toggle the line clamp. `lines` maps onto whatever the host uses to truncate — a CSS
        line-clamp here, the platform's own line limit on a device. `selectable` is stated rather than inherited because
        the two targets disagree about the default: web text is selectable, native text is not, so a component that says
        nothing behaves differently on each.
      </text>
      <Chip>{() => (clamped() ? 'lines={2}' : 'lines={0} — unclamped')}</Chip>
    </Panel>
  )
}

/** `role` — the one fact both targets need and neither can infer. */
const Roles = (): HostElement => {
  const palette = PaletteContext.use()
  const taps = signal(0)

  return (
    <Panel
      title="role"
      blurb="A native host turns it into an accessibility role; the DOM host turns it into an actual element. role='button' really is a <button>, so focus order, Enter and Space all work without anything re-implementing them."
    >
      <view
        role="button"
        label="A view with role=button"
        onTap={() => taps(taps() + 1)}
        style={() => ({
          alignSelf: 'flex-start',
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 14,
          paddingRight: 14,
          borderRadius: RADIUS.sm,
          background: palette().accent,
        })}
      >
        <text style={() => ({ color: palette().onAccent, fontSize: 14 })}>{() => `tapped ${taps()}×`}</text>
      </view>
      <Text size="sm" tone="muted">
        Tab to it and press Enter — that is the browser's own button behaviour, inherited rather than rebuilt.
      </Text>
      <Readout>
        {'role: button link heading list listitem banner navigation main contentinfo none\n' +
          'list and listitem stay generic elements carrying the ARIA role, because <ul> accepts only <li>\n' +
          'and the control-flow components put a wrapper in between.'}
      </Readout>
    </Panel>
  )
}

/** `<image>` — a leaf, with `fit` and load/error events. */
const Images = (): HostElement => {
  const fit = signal<'cover' | 'contain' | 'fill' | 'none'>('cover')
  const state = signal('loading…')

  // An inline SVG, so the demo has no network dependency and works on an
  // aeroplane, on a device, and behind Cloudflare's cache alike.
  const SRC =
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">
         <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#7ea2ff"/><stop offset="1" stop-color="#34d399"/>
         </linearGradient></defs>
         <rect width="160" height="90" fill="url(#g)"/>
         <circle cx="120" cy="26" r="16" fill="#ffffff" opacity="0.7"/>
       </svg>`,
    )

  const NEXT: Readonly<Record<string, 'cover' | 'contain' | 'fill' | 'none'>> = {
    cover: 'contain',
    contain: 'fill',
    fill: 'none',
    none: 'cover',
  }

  return (
    <Panel
      title="image"
      blurb="A leaf — children are typed `never`, because there is nothing a target could render inside one. `label` is the accessible name; there is no separate `alt`, since two spellings of one concept is the drift a five-tag vocabulary exists to avoid."
    >
      <image
        src={SRC}
        label="An abstract gradient"
        fit={fit}
        onLoad={() => state('loaded')}
        onError={() => state('failed')}
        style={{ width: '100%', height: 120, borderRadius: RADIUS.sm, background: '#0002' }}
      />
      <view role="button" onTap={() => fit(NEXT[fit()] ?? 'cover')} style={{ alignSelf: 'flex-start' }}>
        <Chip>{() => `fit="${fit()}" — tap to cycle`}</Chip>
      </view>
      <Chip tone="good">{state}</Chip>
    </Panel>
  )
}

/** `<scroll-view>` — `axis`, not `direction`, and a normalised scroll event. */
const Scrolling = (): HostElement => {
  const palette = PaletteContext.use()
  const offset = signal(0)

  return (
    <Panel
      title="scroll-view"
      blurb="axis rather than direction, because CSS already claimed that word for RTL text — a real cross-platform concern that will want a prop of its own on every element. onScroll arrives in one shape from every host."
    >
      <scroll-view
        axis="horizontal"
        onScroll={(event) => offset(Math.round(event.x))}
        style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
          <view
            style={() => ({
              width: 96,
              height: 64,
              borderRadius: RADIUS.sm,
              background: palette().surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <text style={() => ({ color: palette().muted })}>{`card ${index + 1}`}</text>
          </view>
        ))}
      </scroll-view>
      <Readout>{() => `onScroll → x: ${offset()}`}</Readout>
    </Panel>
  )
}

/** `<input>` — the props that only look like a web form until you ship to a device. */
const Inputs = (): HostElement => {
  const palette = PaletteContext.use()
  const email = signal('')
  const pin = signal('')
  const notes = signal('')
  const submitted = signal('—')

  const field = (): Record<string, string | number> => ({
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: palette().border,
    background: palette().surfaceAlt,
    color: palette().text,
    fontSize: 14,
  })

  return (
    <Panel
      title="input"
      blurb="keyboard and secure are two settings rather than one, because a PIN entry needs a numeric keypad AND masked text — the web collapses both into type='password', which is exactly why the conflation stays invisible until it runs on a device."
    >
      <input
        value={email}
        placeholder="you@example.com"
        keyboard="email"
        autoComplete="email"
        submitLabel="next"
        label="Email"
        onInput={(event) => email(event.value)}
        onSubmit={(event) => submitted(`submitted "${event.value}"`)}
        style={field}
      />
      <input
        value={pin}
        placeholder="one-time code"
        keyboard="number"
        secure
        autoComplete="one-time-code"
        submitLabel="done"
        label="Code"
        onInput={(event) => pin(event.value)}
        style={field}
      />
      <input
        multiline
        value={notes}
        placeholder="notes… (multiline is structural, so it is static by design)"
        label="Notes"
        onInput={(event) => notes(event.value)}
        style={() => ({ ...field(), minHeight: 72 })}
      />
      <Readout>
        {() =>
          [
            `email: ${JSON.stringify(email())}`,
            `code:  ${JSON.stringify(pin())}`,
            `notes: ${JSON.stringify(notes())}`,
            `onSubmit: ${submitted()}`,
          ].join('\n')
        }
      </Readout>
      <Text size="sm" tone="muted">
        multiline decides which control the host builds — a &lt;textarea&gt; here — and no target can turn one control
        into the other afterwards, so it is a plain boolean with no reactive form.
      </Text>
    </Panel>
  )
}

/** The gesture-shaped event names, including the two that never fire on a phone. */
const Events = (): HostElement => {
  const palette = PaletteContext.use()
  const log = signal<readonly string[]>([])
  const note = (line: string): void => log([line, ...log()].slice(0, 5))

  return (
    <Panel
      title="Events"
      blurb="onTap, not onClick — tapping is the gesture that actually exists on a device. onHoverIn/onHoverOut never fire on a touch-only target, and nothing here synthesises a fake hover from a touch: a hover-only affordance is a design bug, not a platform difference to paper over."
    >
      <view
        role="button"
        label="Event surface"
        onTap={() => note('tap')}
        onLongPress={() => note('longpress')}
        onHoverIn={() => note('hoverin')}
        onHoverOut={() => note('hoverout')}
        onFocus={() => note('focus')}
        onBlur={() => note('blur')}
        style={() => ({
          height: 84,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.sm,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: palette().border,
          background: palette().surfaceAlt,
        })}
      >
        <text style={() => ({ color: palette().muted })}>tap · long-press · hover · focus me</text>
      </view>
      <Readout>{() => (log().length === 0 ? '(nothing yet)' : log().join('\n'))}</Readout>
    </Panel>
  )
}
