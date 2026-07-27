import type { ContainerChildren, LynxElement, MaybeReactive, MiniChildren } from '@amritk/mini-lynx'

/**
 * The playground's own components.
 *
 * There is no `/ui` layer in the package any more, and its absence is the
 * point. That layer existed to keep a five-tag vocabulary confined to a dozen
 * components, so that changing the vocabulary would be a rewrite of one
 * directory rather than of the whole app. With Lynx's own elements there is
 * nothing to confine — and a component layer that is not hiding a limitation is
 * a design system, which belongs to an app rather than to a runtime.
 *
 * So this is what is left: a handful of components carrying THIS app's taste,
 * styled with classes from `styles.css` the way a Lynx app is meant to be.
 */

export type PanelProps = {
  title: string
  /** One or two sentences on what the demo below is showing. */
  blurb?: string
  children?: ContainerChildren
}

/** A titled card. Every demo on every screen sits in one. */
export const Panel = (props: PanelProps): LynxElement => (
  <view class="panel">
    <text class="panel-title">
      <raw-text text={props.title} />
    </text>
    {props.blurb === undefined ? null : (
      <text class="panel-blurb">
        <raw-text text={props.blurb} />
      </text>
    )}
    <view class="gap-sm">{props.children}</view>
  </view>
)

export type ProseProps = {
  children: MaybeReactive<string>
}

/** A paragraph of explanation under a demo. */
export const Prose = (props: ProseProps): LynxElement => (
  <text class="prose">
    <raw-text text={props.children} />
  </text>
)

export type ReadoutProps = {
  /** The live value. A getter tracks forever — pass one, never `value()`. */
  children: MaybeReactive<string>
}

/** A monospaced readout of some live value. */
export const Readout = (props: ReadoutProps): LynxElement => (
  <text class="readout">
    <raw-text text={props.children} />
  </text>
)

export type ActionProps = {
  onTap: () => void
  disabled?: MaybeReactive<boolean>
  children: MaybeReactive<string>
}

/**
 * The app's button.
 *
 * `bindtap` rather than an `onTap` of our own invention: the prop is the
 * engine's, so Lynx's documentation describes it and there is no table anywhere
 * translating one spelling into the other.
 */
export const Action = (props: ActionProps): LynxElement => {
  const disabled = (): boolean => (typeof props.disabled === 'function' ? props.disabled() : Boolean(props.disabled))

  return (
    <view
      class={() => ['action', disabled() && 'action-disabled']}
      accessibility-element={true}
      accessibility-traits="button"
      bindtap={() => {
        if (!disabled()) props.onTap()
      }}
    >
      <text class="action-label">
        <raw-text text={props.children} />
      </text>
    </view>
  )
}

export type ChipProps = {
  /** Reactive, so a chip can report a state that changes without being rebuilt. */
  tone?: MaybeReactive<'neutral' | 'good' | 'bad'>
  children: MaybeReactive<string>
}

/** A small status pill. */
export const Chip = (props: ChipProps): LynxElement => {
  const tone = (): string => (typeof props.tone === 'function' ? props.tone() : (props.tone ?? 'neutral'))

  return (
    <view class={() => ['chip', tone() !== 'neutral' && `chip-${tone()}`]}>
      <text class="chip-label">
        <raw-text text={props.children} />
      </text>
    </view>
  )
}

export type RowProps = {
  gap?: 'xs' | 'sm' | 'md'
  wrap?: boolean
  children?: ContainerChildren
}

/** A horizontal run of children. Lynx lays out in a column by default. */
export const Row = (props: RowProps): LynxElement => (
  <view class={['row', `gap-${props.gap ?? 'sm'}`, props.wrap === true && 'wrap']}>{props.children}</view>
)

export type StackProps = {
  gap?: 'xs' | 'sm' | 'md'
  children?: ContainerChildren
}

/** A vertical run of children, which is what a Lynx container already is. */
export const Stack = (props: StackProps): LynxElement => (
  <view class={`gap-${props.gap ?? 'sm'}`}>{props.children}</view>
)

export type TextLineProps = {
  class?: string
  children: MaybeReactive<string>
}

/**
 * One line of text.
 *
 * Every string in a Lynx tree lives in a `raw-text` inside a `text`, so this is
 * the shape a text run always takes. Writing it out rather than hiding it is
 * deliberate on a screen whose job is to show what the engine actually builds,
 * but a component like this is what an app writes once and stops thinking about.
 */
export const TextLine = (props: TextLineProps): LynxElement => (
  <text class={props.class ?? 'card-title'}>
    <raw-text text={props.children} />
  </text>
)

export type ChildrenProps = { children?: MiniChildren }
