import { type HostElement, mount, requireHost, setHost, signal } from '@amritk/mini-native'
import { createContext, ErrorBoundary, Portal } from '@amritk/mini-native/composition'
import { Show } from '@amritk/mini-native/flow'
import { createMemoryHost } from '@amritk/mini-native/hosts/memory'
import { serializeMemoryTree } from '@amritk/mini-native/hosts/memory/serialize'
import { Row, Stack, Text } from '@amritk/mini-native/ui'

import { OverlayContext } from '../lib/overlay'
import { Action, Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext, RADIUS } from '../theme'

/**
 * `@amritk/mini-native/composition` — the three seams a write-once codebase
 * needs: read something an ancestor provided, put a subtree somewhere else, or
 * survive one that failed to build. Plus the thing that makes the whole design
 * tractable: a second host, rendering the same components into plain objects.
 */
export const CompositionScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      `@amritk/mini` refuses context on purpose and is right to — it prop-drills, and its consumer is a byte-budgeted
      widget. The calculus differs here because the things that vary by platform (theme, insets, navigation, locale) are
      exactly the things you do not want in every intermediate component's signature.
    </Text>
    <ContextDemo />
    <PortalDemo />
    <ErrorDemo />
    <HostSwap />
  </Stack>
)

/** `createContext` — and why a context that changes over time holds a signal. */
type Locale = 'en-GB' | 'fr-FR' | 'ja-JP'

const LocaleContext = createContext<() => Locale>(() => 'en-GB')

const ContextDemo = (): HostElement => {
  const locale = signal<Locale>('en-GB')
  const locales = ['en-GB', 'fr-FR', 'ja-JP'] as const

  // `provide` takes a FUNCTION, not an element: passing an already-built child
  // would have built it BEFORE the provider ran, so it would have read the
  // fallback. Passing a function is what puts the child's construction inside.
  return LocaleContext.provide(locale, () => (
    <Panel
      title="createContext"
      blurb="A component runs exactly once and therefore reads context exactly once — so a context that changes over time holds a SIGNAL rather than a value. That is not a limitation to work around; it is what makes the switch below reach a component nothing threaded a prop through."
    >
      <Row gap="xs">
        {locales.map((name) => (
          <Action onTap={() => locale(name)} disabled={() => locale() === name}>
            {name}
          </Action>
        ))}
      </Row>
      <DeepChild />
      <Text size="sm" tone="muted">
        Nothing between the provider and that readout knows a locale exists. Not providing one is a supported state —
        the fallback is a real value, so a component renders correctly on its own, in a test, with no app around it.
      </Text>
    </Panel>
  ))
}

/** Three levels down, with nothing threaded in between. */
const DeepChild = (): HostElement => <Middle />
const Middle = (): HostElement => <Leaf />

const Leaf = (): HostElement => {
  const locale = LocaleContext.use()
  return (
    <Readout>
      {() => `${locale()} → ${new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(1234.5)}`}
    </Readout>
  )
}

/** `Portal` — an explicit target, because the host should not have to grow one. */
const PortalDemo = (): HostElement => {
  const palette = PaletteContext.use()
  const open = signal(false)
  // Provided by the entry point, so no screen here has to know what a
  // `document` is in order to open a modal.
  const target = OverlayContext.use()

  return (
    <Panel
      title="Portal"
      blurb="It takes an explicit target rather than asking the host for an overlay root, which keeps the Host contract at its size and puts the question — where is the top of the screen — to the app, which wrote its own shell and knows."
    >
      <Action onTap={() => open(true)} disabled={target === null}>
        open a modal
      </Action>
      <Show when={() => open() && target !== null}>
        {() => (
          <Portal target={target as HostElement}>
            <view
              role="button"
              label="Dismiss"
              onTap={() => open(false)}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgb(0 0 0 / 0.45)',
              }}
            >
              <view
                style={() => ({
                  width: 280,
                  padding: 20,
                  gap: 10,
                  borderRadius: RADIUS.lg,
                  background: palette().surface,
                })}
              >
                <text style={() => ({ color: palette().text, fontSize: 16, fontWeight: '600' })}>
                  Rendered into #overlay
                </text>
                <text style={() => ({ color: palette().muted, fontSize: 13, lineHeight: 19 })}>
                  Built where it is WRITTEN, so it reads the palette surrounding the Portal rather than whatever
                  surrounds the target — which is what makes a themed modal work without threading the theme through the
                  overlay root. Tap anywhere to dismiss.
                </text>
              </view>
            </view>
          </Portal>
        )}
      </Show>
    </Panel>
  )
}

/** `ErrorBoundary` — because a component runs once and a throw leaves half a tree. */
const ErrorDemo = (): HostElement => {
  let attempts = 0

  const Fragile = (): HostElement => {
    attempts += 1
    // Fails the first two attempts, so `retry` has something to prove.
    if (attempts <= 2) throw new Error(`construction failed (attempt ${attempts})`)
    return <Chip tone="good">{`built on attempt ${attempts}`}</Chip>
  }

  return (
    <Panel
      title="ErrorBoundary"
      blurb="Components run exactly once, so a throw part-way through leaves a half-built tree with no second render to recover on — a blank area on the web, a dead app on a device. retry rebuilds the subtree from scratch, which is the right offer for a failure that might not repeat."
    >
      <ErrorBoundary
        fallback={(error, retry) => (
          <Stack gap="sm">
            <Chip tone="bad">{String(error instanceof Error ? error.message : error)}</Chip>
            <Action onTap={retry}>retry</Action>
          </Stack>
        )}
      >
        {() => <Fragile />}
      </ErrorBoundary>
      <Text size="sm" tone="muted">
        `children` is a function for the same reason `provide`'s is: an already-built element would have thrown as an
        argument, before this component ever ran, and there would be nothing left to catch.
      </Text>
    </Panel>
  )
}

/**
 * The claim the whole package rests on, demonstrated rather than asserted:
 * the same component tree, rendered by a completely different host.
 */
const HostSwap = (): HostElement => {
  const tree = signal('(not rendered yet)')

  const Card = (): HostElement => (
    <view role="button" label="A card" style={{ padding: 12, gap: 4 }}>
      <text style={{ fontSize: 16 }}>Ada Lovelace</text>
      <text style={{ fontSize: 13 }}>first programmer</text>
    </view>
  )

  const renderToObjects = (): void => {
    const memory = createMemoryHost()
    // Which host is installed is normally a boot-time decision. Doing it here is
    // the one legitimate exception and it is deliberately narrow: the swap is
    // synchronous, so nothing else can render in between, and the DOM host
    // INSTANCE is restored rather than a fresh one — a new instance would not
    // carry the per-element bookkeeping the live tree already depends on.
    const previous = requireHost()
    setHost(memory.host)
    try {
      const dispose = mount(memory.rootElement, Card)
      tree(serializeMemoryTree(memory.root))
      dispose()
    } finally {
      setHost(previous)
    }
  }

  return (
    <Panel
      title="A second host, live"
      blurb="Porting is one file: implement Host — about fifteen functions — and pass it to setHost. There is no reconciler to port, because there is no virtual tree. The button below renders the same Card component through the in-memory host and prints the object tree it produced."
    >
      <Action onTap={renderToObjects}>render Card through the memory host</Action>
      <Readout>{tree}</Readout>
      <Text size="sm" tone="muted">
        The memory host has no `environment` on purpose: it has no screen, so it has no colour scheme, no size and no
        notch to report — and leaving the field off is what exercises the runtime's documented fallbacks on every test
        run rather than only when somebody remembers to check.
      </Text>
    </Panel>
  )
}
