import type {
  ContainerChildren,
  HostElement,
  MaybeReactive,
  MiniChildren,
  StyleValue,
  TapEvent,
} from '@amritk/mini-native'
import { Button, Heading, Stack, Text } from '@amritk/mini-native/ui'

import { PaletteContext, RADIUS } from '../theme'

/**
 * The playground's own components, written the way the `/ui` layer's docs ask
 * for: a screen file should contain almost no vocabulary tags. Everything the
 * screens below reach for is named here or comes from `@amritk/mini-native/ui`,
 * which is what would make swapping the vocabulary underneath a rewrite of this
 * directory rather than a rewrite of the app.
 */

export type PanelProps = {
  title: string
  /** One or two sentences on what the demo is showing. */
  blurb?: string
  children?: ContainerChildren
}

/** A titled card. Every demo on every screen sits in one. */
export const Panel = (props: PanelProps): HostElement => {
  const palette = PaletteContext.use()

  return (
    <Stack
      gap="sm"
      style={() => ({
        padding: 14,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: palette().border,
        background: palette().surface,
      })}
    >
      <Heading level={3} size="md">
        {props.title}
      </Heading>
      {props.blurb === undefined ? null : (
        <Text size="sm" tone="muted">
          {props.blurb}
        </Text>
      )}
      <Stack gap="sm">{props.children}</Stack>
    </Stack>
  )
}

export type ReadoutProps = {
  /** The live value. A getter tracks forever — pass one, never `value()`. */
  children: MiniChildren
}

/** A monospaced readout of some live value. */
export const Readout = (props: ReadoutProps): HostElement => {
  const palette = PaletteContext.use()

  return (
    <text
      selectable
      style={() => ({
        padding: 10,
        borderRadius: RADIUS.sm,
        background: palette().surfaceAlt,
        color: palette().text,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 18,
        whiteSpace: 'pre-wrap',
      })}
    >
      {props.children}
    </text>
  )
}

export type ChipProps = {
  /** Reactive, so a chip can report a state that changes without being rebuilt. */
  tone?: MaybeReactive<'neutral' | 'good' | 'bad'>
  children?: MiniChildren
}

/** A small status pill. */
export const Chip = (props: ChipProps): HostElement => {
  const palette = PaletteContext.use()
  const tone = (): string => (typeof props.tone === 'function' ? props.tone() : (props.tone ?? 'neutral'))
  const colour = (): string =>
    tone() === 'good' ? palette().ok : tone() === 'bad' ? palette().danger : palette().muted

  return (
    <text
      style={(): StyleValue => ({
        alignSelf: 'flex-start',
        paddingTop: 2,
        paddingBottom: 2,
        paddingLeft: 8,
        paddingRight: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: colour(),
        color: colour(),
        fontSize: 12,
        lineHeight: 16,
      })}
    >
      {props.children}
    </text>
  )
}

export type ActionProps = {
  onTap?: (event: TapEvent) => void
  disabled?: MaybeReactive<boolean>
  /** The accessible name, when the label is not the whole story. */
  label?: MaybeReactive<string>
  children?: MiniChildren
}

/**
 * The app's button — and the clearest illustration of the line `/ui` draws.
 *
 * `<Button>` already knows that a button is a button on both targets, is
 * reachable by keyboard on both, and is *unavailable* rather than merely greyed
 * when disabled. It deliberately does not know that this app's buttons are 32px
 * tall with an 8px radius and a border in the palette's colour. That part is
 * taste, it changes with the product, and holding it here is what stops the
 * design system being version-coupled to the package.
 *
 * `Button` is a plain function, so this is a call rather than JSX — which keeps
 * the spread's optionality intact under `exactOptionalPropertyTypes`.
 */
export const Action = (props: ActionProps): HostElement => {
  const palette = PaletteContext.use()

  return Button({
    ...props,
    style: (): StyleValue => ({
      alignSelf: 'flex-start',
      paddingTop: 6,
      paddingBottom: 6,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: palette().border,
      background: palette().surfaceAlt,
      color: palette().text,
      fontSize: 13,
      lineHeight: 18,
      cursor: 'pointer',
      opacity: resolve(props.disabled) ? 0.45 : 1,
    }),
  })
}

/** Reads a `MaybeReactive` without caring which form it arrived in. */
const resolve = <T,>(value: MaybeReactive<T> | undefined): T | undefined =>
  typeof value === 'function' ? (value as () => T)() : value

/** A horizontal rule, for when a panel needs to breathe. */
export const Divider = (): HostElement => {
  const palette = PaletteContext.use()
  return <view style={() => ({ height: 1, background: palette().border })} />
}
