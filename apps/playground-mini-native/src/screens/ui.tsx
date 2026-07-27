import { type HostElement, signal } from '@amritk/mini-native'
import { Dynamic, For } from '@amritk/mini-native/flow'
import { Button, Heading, Link, List, ListItem, Row, Stack, Text } from '@amritk/mini-native/ui'

import { Action, Chip, Divider, Panel, Readout } from '../lib/ui'
import { PaletteContext } from '../theme'

/**
 * `@amritk/mini-native/ui` — the component layer, and the line it draws: the
 * package ships the SEMANTICS, the app ships the taste. `<Button>` knows a
 * button is a button on both targets, is reachable by keyboard on both, and is
 * *unavailable* rather than merely greyed. It does not know your buttons are
 * 44px tall with a 6px radius.
 */
export const UiScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      Write screens in these rather than in vocabulary tags. Do it across two hundred screens and the vocabulary appears
      in about a dozen components — at which point the role layer, the event payloads, even the question of whether the
      vocabulary should have been HTML all along become a rewrite of one directory.
    </Text>
    <Typography />
    <Buttons />
    <Lists />
    <Layout />
  </Stack>
)

/** `Heading` and `Text` — a type scale and tones by meaning, not by colour. */
const Typography = (): HostElement => (
  <Panel
    title="Heading · Text"
    blurb="level is the outline depth and size is the visual step; they default to matching so the common path is short, and they are separate so a design that disagrees with the outline does not have to lie about its structure."
  >
    <Heading level={2}>A level-2 heading</Heading>
    <Heading level={3} size="md">
      A level-3 heading, forced down to size='md'
    </Heading>
    <Text>Body text at the default size.</Text>
    <Text size="sm" tone="muted">
      Muted, small — for the sentence under the thing.
    </Text>
    <Text tone="accent">Accent tone.</Text>
    <Text tone="danger">Danger tone.</Text>
    <Divider />
    <Text size="sm" tone="muted">
      Tones name a meaning rather than a colour, so the app's palette decides what each one actually is — that is what
      makes the light/dark switch above a one-line change instead of an audit.
    </Text>
  </Panel>
)

/** `Button` and `Link` — semantics you would otherwise re-derive per screen. */
const Buttons = (): HostElement => {
  const busy = signal(false)
  const count = signal(0)

  return (
    <Panel
      title="Button · Link"
      blurb="disabled means UNAVAILABLE — announced as such rather than merely greyed. as='link' is the case every design system hits, and it takes a ROLE rather than an HTML tag: as='a' would mean nothing on a device."
    >
      <Row gap="sm">
        <Action onTap={() => count(count() + 1)}>{() => `tapped ${count()}×`}</Action>
        <Action disabled={busy} onTap={() => count(0)}>
          reset
        </Action>
      </Row>
      <Row gap="sm">
        <Action onTap={() => busy(!busy())}>{() => (busy() ? 'enable reset' : 'disable reset')}</Action>
        <Chip tone={() => (busy() ? 'bad' : 'good')}>{() => (busy() ? 'reset unavailable' : 'reset available')}</Chip>
      </Row>
      <Divider />
      {/* Straight from the package, so the `as` override is visible with no
          app styling in the way. */}
      <Button as="link" href="https://github.com/amritk/mini" style={{ alignSelf: 'flex-start' }}>
        Looks like a button, IS a link
      </Button>
      <Text size="sm" tone="muted">
        Middle-click it, or copy the link address — the DOM host built a real anchor, so both work without the app doing
        anything.
      </Text>
      <Link href="https://github.com/amritk/mini">A plain Link</Link>
    </Panel>
  )
}

/** `List` and `ListItem` — the roles a screen reader needs, and nothing else. */
type VocabRow = { readonly id: string; readonly name: string; readonly detail: string }

const ROWS: readonly VocabRow[] = [
  { id: '1', name: 'view', detail: 'a container' },
  { id: '2', name: 'text', detail: 'the only text run' },
  { id: '3', name: 'image', detail: 'a leaf' },
  { id: '4', name: 'scroll-view', detail: 'a scrolling container' },
  { id: '5', name: 'input', detail: 'a text field' },
]

const Lists = (): HostElement => {
  const palette = PaletteContext.use()

  return (
    <Panel
      title="List · ListItem"
      blurb="role='list' and role='listitem' rather than <ul>/<li>, because <ul> accepts only <li> — a parse-level content model — and the control-flow components put a wrapper in between. The roles survive that; the tags would not."
    >
      <List label="The element vocabulary">
        <For each={ROWS} key={(row) => row.id}>
          {(row) => (
            <ListItem
              style={() => ({
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomStyle: 'solid',
                borderBottomColor: palette().border,
              })}
            >
              <Row gap="sm" style={{ justifyContent: 'space-between' }}>
                <Text>{row.name}</Text>
                <Text size="sm" tone="muted">
                  {row.detail}
                </Text>
              </Row>
            </ListItem>
          )}
        </For>
      </List>
    </Panel>
  )
}

/** `Stack` and `Row` — layout with no meaning attached, and a named spacing scale. */
const Layout = (): HostElement => {
  const palette = PaletteContext.use()
  const gaps = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const
  const gap = signal<(typeof gaps)[number]>('sm')

  const Block = (): HostElement => (
    <view style={() => ({ width: 26, height: 26, borderRadius: 6, background: palette().accent })} />
  )

  return (
    <Panel
      title="Stack · Row"
      blurb="Layout only — no role, no accessible name, nothing announced. gap takes a named step of the theme's spacing scale rather than a number, so spacing across an app is a set of decisions instead of a set of numbers people typed."
    >
      <Row gap="xs">
        <For each={gaps}>
          {(step) => (
            <Action onTap={() => gap(step)} disabled={() => gap() === step}>
              {step}
            </Action>
          )}
        </For>
      </Row>
      {/* `gap` is a STATIC prop — it names a step, and a Row does not change
          which step it is. Swapping the step therefore means building a new
          Row, which is exactly what `<Dynamic>` is for: it disposes the old
          subtree and builds the next one whenever the builder changes. */}
      <Dynamic>
        {() => {
          const step = gap()
          return () => (
            <Row gap={step}>
              <Block />
              <Block />
              <Block />
              <Block />
            </Row>
          )
        }}
      </Dynamic>
      <Readout>{() => `gap="${gap()}" → ${gapPixels(gap())}px`}</Readout>
      <Text size="sm" tone="muted">
        Reach for `style` when a layout genuinely needs a value that is not on the scale — that it looks out of place
        next to the named steps is the point.
      </Text>
    </Panel>
  )
}

/** The default theme's spacing steps, for the readout above. */
const gapPixels = (step: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'): number =>
  ({ none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 })[step]
