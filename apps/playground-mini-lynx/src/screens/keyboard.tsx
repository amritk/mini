import { insert, type LynxElement, type StyleValue, signal } from '@amritk/mini-lynx'
import {
  avoidKeyboard,
  KeyboardAvoiding,
  keyboardHeight,
  keyboardLift,
  setKeyboardHeight,
} from '@amritk/mini-lynx/keyboard'

import { Action, Chip, Panel, Prose, Readout, Row, Stack } from '../components'

/**
 * `/keyboard` — `@amritk/mini-lynx/keyboard`, keeping the keys off the field.
 *
 * Lynx does not do this for you: `<input>` does not avoid the keyboard, and what
 * the engine offers is one global event carrying a status and a height. This
 * subpath turns that event into a signal and the signal into the two layouts an
 * app actually wants — a container that rises by the measured overlap, and one
 * that reserves the keyboard's space for a scroller.
 *
 * ## The preview's honest caveat
 *
 * There is no soft keyboard on a desktop browser, and Lynx does not emit
 * `keyboardstatuschanged` on the web at all. Two things fill that gap. The app's
 * entry point feeds the height from `visualViewport`, which is real on a phone
 * browser and is where the keyboard genuinely shows up; and the buttons below
 * write the height directly, which is the same seam a test uses. Everything
 * downstream — the arithmetic, the measurement, the components — is the code
 * that ships to a device either way.
 */
export const KeyboardScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      The engine reports the keyboard once per change and nothing else. Every Lynx app with a form writes the same
      layout on top of that event, and gets the same three things wrong: it lifts by the whole keyboard instead of the
      overlap, it adds the bottom safe-area inset on top of a keyboard that already covers it, and it clears on `blur` —
      so moving between two fields makes the screen flinch. This subpath is that arithmetic, once.
    </Prose>
    <Simulator />
    <Translating />
    <Padding />
    <Lift />
  </Stack>
)

/**
 * The keyboard, on a machine that has none.
 *
 * `setKeyboardHeight` is exported for exactly two callers — a host whose
 * keyboard reporting is its own, and a test — and a preview is the first of
 * those wearing the second's clothes.
 */
const Simulator = (): LynxElement => (
  <Panel
    title="The height is a signal"
    blurb="trackKeyboard() feeds it from the engine on a device, and from visualViewport here. These buttons write it directly, which is what a host with its own reporting does."
  >
    <Row>
      <Action onTap={() => setKeyboardHeight(140)}>Show keyboard</Action>
      <Action onTap={() => setKeyboardHeight(200)}>Taller IME</Action>
      <Action onTap={() => setKeyboardHeight(0)}>Hide</Action>
    </Row>
    <Row>
      <Chip tone={() => (keyboardHeight() > 0 ? 'good' : 'neutral')}>
        {() => (keyboardHeight() > 0 ? 'open' : 'closed')}
      </Chip>
      <Readout>{() => `keyboardHeight() → ${keyboardHeight()}`}</Readout>
    </Row>
  </Panel>
)

/**
 * The default behaviour, and the one that makes the guarantee directly.
 *
 * Both fields carry `ref={avoidKeyboard}`, which is the whole wiring: the
 * control reports its own focus, the container reads it, and the two never meet.
 * Focus the lower one with the keyboard up and the container rises by what that
 * field overlaps — not by the keyboard's full height, which would take the top
 * of the form off the screen for nothing.
 */
const Translating = (): LynxElement => {
  // The stage is built first so it can be its own `bounds` — the screen edge the
  // keyboard is measured back from. On a device that edge is the page, and the
  // default is the page; here it has to be this box, or the arithmetic would
  // measure against a scrolling document that is nothing like a phone.
  const stage = <view style={STAGE} />

  insert(
    stage,
    <KeyboardAvoiding bounds={stage} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10 }}>
      <input class="field" placeholder="email" type="email" ref={avoidKeyboard} />
      <input class="field" placeholder="password" type="password" ref={avoidKeyboard} />
    </KeyboardAvoiding>,
    null,
  )
  insert(stage, <Keys />, null)

  return (
    <Panel
      title="behavior='translate' — rise by the overlap"
      blurb="Focus a field, then show the keyboard: the container rises by what that field overlaps and stops. The grey block is where the keys would be."
    >
      {stage}
      <Prose>
        With no field focused there is nothing to measure against, so it rises by the whole lift instead — the only
        answer that is certainly enough, and the same fallback it takes when a rect cannot be measured at all.
      </Prose>
    </Panel>
  )
}

/** The keys, drawn where the engine says they are, so the guarantee is visible rather than asserted. */
const Keys = (): LynxElement => (
  <view
    style={() => ({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: keyboardHeight(),
      backgroundColor: 'var(--border)',
      transition: 'height 0.25s',
    })}
  />
)

/** A phone-shaped box to stand in for the screen, since a panel in a document is not one. */
const STAGE = {
  position: 'relative',
  height: 260,
  overflow: 'hidden',
  borderRadius: 10,
  backgroundColor: 'var(--surface-alt)',
} satisfies StyleValue

/**
 * The other half of the pair, for a screen whose body scrolls.
 *
 * Nothing moves; the container simply ends where the keys begin, so the
 * scroller inside it keeps a viewport the user can reach every row of.
 */
const Padding = (): LynxElement => (
  <Panel
    title="behavior='padding' — reserve the space instead"
    blurb="For a scrolling body: the viewport shrinks rather than the content moving, so nothing is pushed off the top."
  >
    <KeyboardAvoiding behavior="padding" style={{ borderRadius: 10, backgroundColor: 'var(--surface-alt)' }}>
      <scroll-view scroll-orientation="vertical" style={{ height: 120 }}>
        <input class="field" placeholder="subject" ref={avoidKeyboard} />
        <input class="field" placeholder="also me" ref={avoidKeyboard} />
        <input class="field" placeholder="and me" ref={avoidKeyboard} />
      </scroll-view>
    </KeyboardAvoiding>
  </Panel>
)

/**
 * The arithmetic on its own, for a layout the components do not cover.
 *
 * The inset is the part everybody gets wrong: the keyboard covers the home
 * indicator too, so a bar already sitting above it rises by the difference.
 */
const Lift = (): LynxElement => {
  const inset = signal(0)
  const lift = keyboardLift({ inset, offset: 8 })

  return (
    <Panel
      title="keyboardLift — the number underneath"
      blurb="max(0, height − inset) + offset while the keyboard is open, and exactly zero while it is closed — the offset included, because a gap above a keyboard that is not there is a hole in the layout."
    >
      <Row>
        <Action onTap={() => inset(inset() === 0 ? 34 : 0)}>{() => `bottom inset: ${inset()}`}</Action>
      </Row>
      <Readout>{() => `keyboardLift({ inset: ${inset()}, offset: 8 })() → ${lift()}`}</Readout>
      <Prose>
        Add the inset and the lift together instead of subtracting and a composer bar floats a home indicator's height
        above the keys. It is the most common way to get this wrong, which is why the arithmetic is in the package
        rather than in each app.
      </Prose>
    </Panel>
  )
}
