---
'@amritk/mini-lynx': minor
---

Add `@amritk/mini-lynx/keyboard` — the soft keyboard as a signal, and the
layouts that move out of its way.

Lynx does not avoid the keyboard for you. `<input>` does not do it, the docs say
so outright, and what the engine offers is a single global event —
`keyboardstatuschanged`, carrying `'on' | 'off'` and a height. Every Lynx app
with a form writes the layout on top of that event, and the three mistakes are
always the same: lifting by the whole keyboard rather than by the overlap,
adding the bottom safe-area inset on top of a keyboard that already covers it,
and clearing on `blur` — which makes the screen flinch when focus moves between
two adjacent fields.

The wiring is two lines and no provider:

```tsx
trackKeyboard() // once, next to setEngine

<KeyboardAvoiding>
  <input ref={avoidKeyboard} placeholder="email" />
  <input ref={avoidKeyboard} type="password" />
</KeyboardAvoiding>
```

`ref` is this runtime's element-extension seam, so a control reports its own
focus and the container reads it — nothing is threaded between them.

- **`trackKeyboard(options?)`** subscribes to the engine's `GlobalEventEmitter`
  and feeds `keyboardHeight()`. The emitter is an option because Lynx's own
  compatibility data lists `keyboardstatuschanged` as **unsupported on the web**:
  a DOM build reports the keyboard from `visualViewport` and passes it in, and
  everything downstream is the same code.
- **`keyboardLift({ inset, offset })`** is `max(0, height - inset) + offset`
  while open and exactly zero while closed — the offset included, because a gap
  above a keyboard that is not there is a hole in the layout.
- **`keepAboveKeyboard()`** measures the focused field against a bounds element
  and answers how far a container has to rise, feeding the rise already applied
  back into the next measurement so moving between fields cannot drop the
  container back to rest. Both rects come from one coordinate space, so nothing
  here needs pixel ratios or a status-bar height — which is the part `lynx-ui`
  pays for with an `androidStatusBarPlusBottomBarHeight` prop.
- **`<KeyboardAvoiding>`** is that wired to a style binding, with
  `behavior='translate'` (rise by the measured overlap) or `'padding'` (reserve
  the keyboard's height for a scroller). It writes only the declaration it owns
  and imposes no layout of its own, and it honours `reducedMotion()` the way
  `RouteStack` does.

`/keyboard` is opt-in and its own module graph, reaching sideways into exactly
one file — `elements/invoke.ts`, for the rect — which `import-boundary.test.ts`
now pins as an exact list.

The playground gains a `/keyboard` screen, a `visualViewport` emitter, and
`__InvokeUIMethod` on its DOM Element PAPI (`boundingClientRect` and
`scrollIntoView` answered honestly, everything else reported as unimplemented
rather than invented).

**Not verified on a device.** The arithmetic and the components are covered
against the fake engine, but the engine event itself, the units it reports, and
how a real IME animation interacts with the transition are unconfirmed on
hardware.
