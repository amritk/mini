import { type LynxElement, type ReadonlySignal, type Signal, signal } from '@amritk/mini-lynx'
import { createContext, ErrorBoundary, Portal } from '@amritk/mini-lynx/composition'
import { Show } from '@amritk/mini-lynx/flow'

import { Action, Chip, Panel, Prose, Readout, Row } from '../components'
import { LYNX_ROOT_ATTRIBUTE } from '../lib/install-lynx-reset'

/**
 * `/compose` — the three seams a write-once codebase needs.
 *
 * They have nothing obvious in common until you ask what a component is allowed
 * to do beyond returning its own subtree: read something an ancestor provided,
 * put a subtree somewhere else, or survive one that failed to build.
 *
 * One rule runs through all three, and it is the rule this whole runtime is
 * built on. **A component runs exactly once.** There is no second render, so a
 * context is read once, a portal is placed once, and a throw during construction
 * leaves a half-built tree with nothing to recover on. Everything below either
 * follows from that or exists because of it.
 *
 * The theme provided here is deliberately used by two panels at once — a leaf
 * three levels down, and a modal rendered into a completely different part of
 * the tree — because that pair is the clearest statement of what context does
 * and what `Portal` does not undo.
 */
export const ComposeScreen = (): LynxElement => {
  const palette = signal<Palette>(LIGHT)

  // `provide` takes a FUNCTION, not an already-built element. JSX here builds
  // nodes immediately, so `<Provider>{<Child/>}</Provider>` would construct the
  // child as an ARGUMENT — before the provider had run at all — and it would
  // read the fallback. Passing a function is what puts construction inside.
  return ThemeContext.provide(palette, () => (
    <view>
      <ContextDemo palette={palette} />
      <PortalDemo />
      <ErrorDemo />
    </view>
  ))
}

// ---------------------------------------------------------------------------
// createContext
// ---------------------------------------------------------------------------

/** The handful of colours the demos below read out of context. */
type Palette = {
  readonly name: string
  readonly surface: string
  readonly text: string
  readonly muted: string
  readonly accent: string
}

const LIGHT: Palette = { name: 'light', surface: '#ffffff', text: '#131722', muted: '#5c6577', accent: '#2f5bd7' }
const DARK: Palette = { name: 'dark', surface: '#141924', text: '#e8ecf4', muted: '#98a2b8', accent: '#7ea2ff' }

/**
 * The theme, as a context holding a SIGNAL rather than a value.
 *
 * This is the one thing to get right, and it follows directly from a component
 * running exactly once: `use()` is called during the component body and there is
 * no second read for a later value to arrive on. So what has to stay live is the
 * value itself. A signal is read once and then updates forever, which is how a
 * theme switch reaches the whole tree with no re-render, no invalidation pass,
 * and no machinery beyond the signal that was going to exist anyway.
 *
 * The fallback is a real palette rather than a "nothing provided" sentinel, so
 * a component below can be rendered on its own — in a test, in isolation — with
 * no provider around it and nothing to narrow.
 */
const ThemeContext = createContext<ReadonlySignal<Palette>>(() => LIGHT)

/** The switch, and a leaf three levels below it that nothing threaded a prop to. */
const ContextDemo = (props: { palette: Signal<Palette> }): LynxElement => (
  <Panel
    title="createContext"
    blurb="A component runs exactly once and therefore reads context exactly once — so a context that changes over time holds a signal. That is not a limitation to work around; it is what makes the switch below reach a component nothing passed a prop to."
  >
    <Row gap="sm">
      <Action onTap={() => props.palette(LIGHT)} disabled={() => props.palette().name === 'light'}>
        light
      </Action>
      <Action onTap={() => props.palette(DARK)} disabled={() => props.palette().name === 'dark'}>
        dark
      </Action>
    </Row>
    <Deep />
    <Prose>
      Nothing between the provider and that card knows a theme exists. Prop-drill it instead and every intermediate
      component grows a prop it does not use, which is write-once eroding one signature at a time — a leaf that takes
      insets as a prop is already a leaf that knows which device it is on.
    </Prose>
    <Prose>
      This is also where the two packages part company. mini prop-drills on purpose and is right to: its consumer is a
      byte-budgeted widget dropped into somebody else's page, where an ambient registry is surface nobody asked for. The
      consumer here is a whole app, and theme, safe-area insets, navigation and locale are exactly the things you do not
      want in a component's signature.
    </Prose>
  </Panel>
)

/** Two levels of nothing, to make the point that nothing is threaded through. */
const Deep = (): LynxElement => <Middle />
const Middle = (): LynxElement => <Leaf />

/** The consumer. It takes no props at all. */
const Leaf = (): LynxElement => {
  const theme = ThemeContext.use()

  return (
    <view
      class="card"
      style={() => ({
        backgroundColor: theme().surface,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: theme().accent,
        gap: 4,
      })}
    >
      <text style={() => ({ color: theme().text, fontSize: 14 })}>
        <raw-text text="three levels down, with nothing threaded in between" />
      </text>
      <text style={() => ({ color: theme().muted, fontSize: 12 })}>
        <raw-text text={() => `${theme().name} · surface ${theme().surface} · accent ${theme().accent}`} />
      </text>
    </view>
  )
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

/** `Portal` — a subtree that renders somewhere else and still belongs here. */
const PortalDemo = (): LynxElement => {
  const open = signal(false)
  // Read HERE, where the portal is written, rather than inside the modal's own
  // parent. That is the whole reason the modal below is themed correctly.
  const theme = ThemeContext.use()
  const target = resolveOverlay()

  return (
    <Panel
      title="Portal"
      blurb="Modals, sheets, toasts and tooltips all need to escape their parent — its clipping, its stacking, its transforms — and none of that is expressible from inside the parent. So the subtree moves, and its lifetime does not."
    >
      <Action onTap={() => open(true)}>open a sheet</Action>
      <Show when={open}>
        {() => (
          <Portal target={target}>
            <view
              class="row"
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
              accessibility-element={true}
              accessibility-traits="button"
              accessibility-label="Dismiss"
              bindtap={() => open(false)}
            >
              <view
                style={() => ({ width: 300, padding: 20, gap: 10, borderRadius: 18, backgroundColor: theme().surface })}
                // A tap inside the card must not reach the backdrop behind it,
                // and `catch` is how Lynx says that: it listens in the bubble
                // phase and stops the event there. See `/events`.
                catchtap={() => undefined}
              >
                <text style={() => ({ color: theme().text, fontSize: 16, fontWeight: 'bold' })}>
                  <raw-text text="Rendered into the overlay layer" />
                </text>
                <text style={() => ({ color: theme().muted, fontSize: 13, lineHeight: '19px' })}>
                  <raw-text text="This card lives outside the app root entirely, and it is still reading the theme the panel behind it provided — because a portal's children are built where they are WRITTEN. Tap the dimmed area to dismiss." />
                </text>
                <Chip tone={() => (theme().name === 'dark' ? 'good' : 'neutral')}>
                  {() => `theme from context: ${theme().name}`}
                </Chip>
              </view>
            </view>
          </Portal>
        )}
      </Show>

      <Prose>
        The target is passed IN rather than discovered. The tempting alternative is for the runtime to nominate an
        overlay root of its own, which means answering where is the top of the screen on the app's behalf — a question
        the runtime would have to guess at and the app already knows, because the app wrote its own shell.
      </Prose>
      <Prose>
        In this browser preview the app root is the div with id app, so the layer is a sibling of it, created next to
        the app rather than inside it. On a device the same answer is an overlay element the app owns — Lynx has one, it
        is promoted out of the document flow into its own rendering layer, it must be position fixed and it takes
        exactly one direct child. The element type is opaque either way, which is the whole of the difference between
        the two.
      </Prose>
      <Prose>
        What stays behind is an empty wrapper, so the portal still occupies a place in the tree it was written in — and
        that is what ties the moved subtree's LIFETIME to that place. Navigate away from this screen with the sheet open
        and it goes with the screen, rather than being orphaned in the overlay with its bindings still live.
      </Prose>
      <Prose>
        One asymmetry worth naming, because it bites: context follows where a subtree was written, and CSS custom
        properties follow where it ENDS UP. The card above is themed through context and would not have picked up a
        theme class set on the app root, since the overlay is not underneath it. That is a good reason to carry a theme
        in context rather than only in the cascade.
      </Prose>
    </Panel>
  )
}

/** The id the preview's overlay layer is published under. `index.html` ships one. */
const OVERLAY_ID = 'overlay'

/**
 * The overlay layer this screen portals into, resolved once.
 *
 * `Portal` puts the question to the app, and this is the app answering it. In
 * the preview that means a plain element beside the app root: `index.html`
 * already ships one, and it is created here if it is missing so this screen
 * stands on its own. Being a SIBLING of the app root rather than a descendant is
 * the point — nothing inside the app can clip it or stack above it.
 *
 * It is tagged with the preview's root attribute so the Lynx layout reset
 * reaches inside it. Without that the browser would lay the sheet out with its
 * own defaults — `display: block`, `position: static`, text inherited through
 * containers — and the preview would be showing something the engine would not.
 *
 * On a device none of this exists: the app creates an `<overlay>` at its entry
 * point and hands that in. The cast is the same cast the preview engine makes at
 * every crossing, because an engine element is opaque to everyone.
 */
const resolveOverlay = (): LynxElement => {
  const existing = document.getElementById(OVERLAY_ID)
  if (existing !== null) {
    existing.setAttribute(LYNX_ROOT_ATTRIBUTE, '')
    return existing as unknown as LynxElement
  }

  const created = document.createElement('div')
  created.id = OVERLAY_ID
  created.setAttribute(LYNX_ROOT_ATTRIBUTE, '')
  document.body.append(created)
  return created as unknown as LynxElement
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

/** `ErrorBoundary` — a retry that finally succeeds, so the offer is worth making. */
const ErrorDemo = (): LynxElement => {
  // Deliberately outside the component below, so it survives the rebuilds a
  // retry causes — the whole point being that the third attempt is different
  // from the first two.
  let attempts = 0

  const Fragile = (): LynxElement => {
    attempts += 1
    if (attempts < 3) throw new Error(`construction failed on attempt ${attempts} of 3`)
    return <Chip tone="good">{`built on attempt ${attempts}`}</Chip>
  }

  return (
    <Panel
      title="ErrorBoundary"
      blurb="The subtree below throws on its first two construction attempts and succeeds on the third. Retry twice and watch it come up — that is the shape of failure this is for, one that might not repeat."
    >
      <ErrorBoundary
        fallback={(error, retry) => (
          <view class="gap-sm">
            <Chip tone="bad">{messageOf(error)}</Chip>
            <Action onTap={retry}>retry</Action>
          </view>
        )}
      >
        {() => <Fragile />}
      </ErrorBoundary>

      <Prose>
        children is a function for the same reason provide's is: an already-built element would have thrown as an
        argument, before this component ever ran, and there would be nothing left to catch.
      </Prose>
      <Prose>
        It catches CONSTRUCTION, not everything, and that limit follows from the runtime rather than from effort. A
        throw inside an effect three seconds later, in a handler, or in a promise happens long after every component
        finished running, and there is no build in progress to unwind. Those belong to the code that started them.
      </Prose>
      <Prose>
        Each attempt gets its own scope, disposed before the next one starts, so a retry cannot leave the failed
        attempt's bindings running against nodes nobody can see. It is the same per-subtree lifetime guarantee list
        gives each row and the control-flow components give each branch.
      </Prose>
      <Readout>{() => `attempts so far: ${attempts}`}</Readout>
    </Panel>
  )
}

/** Whatever was thrown, as something a chip can show. */
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
