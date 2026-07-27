import type { HostElement } from '@amritk/mini-native'
import { colorScheme, dimensions, platform, safeArea } from '@amritk/mini-native/platform'
import { Stack, Text } from '@amritk/mini-native/ui'

import { Chip, Panel, Readout } from '../lib/ui'

/**
 * `@amritk/mini-native/platform` — two things in deliberate tension.
 * `platform` branches on the target's NAME; the environment accessors answer
 * the questions a name is usually standing in for. Prefer the second: a name is
 * a proxy for the thing you actually care about, and proxies rot.
 */
export const PlatformScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      Everything here is a SIGNAL. A component runs exactly once, so anything read as a plain value is frozen at the
      moment the component was built — passing the signal along uncalled is what makes a rotation or a theme switch
      reach whatever read it.
    </Text>
    <Environment />
    <Naming />
    <Divergence />
  </Stack>
)

/** The environment accessors — the ones to reach for first. */
const Environment = (): HostElement => {
  const scheme = colorScheme()
  const size = dimensions()
  const insets = safeArea()

  return (
    <Panel
      title="colorScheme · dimensions · safeArea"
      blurb="Resize the window, or flip your OS between light and dark — these update with no re-render and no invalidation pass, because they were signals all along. A host that cannot tell reports a documented fallback rather than a guess."
    >
      <Chip tone={() => (scheme() === 'dark' ? 'good' : 'neutral')}>{() => `colorScheme: ${scheme()}`}</Chip>
      <Readout>
        {() =>
          [
            `dimensions: ${Math.round(size().width)} × ${Math.round(size().height)}`,
            `safeArea:   top ${insets().top}  right ${insets().right}  bottom ${insets().bottom}  left ${insets().left}`,
          ].join('\n')
        }
      </Readout>
      <Text size="sm" tone="muted">
        A host that cannot measure reports zeroes deliberately: a guessed 375×667 would read as a real phone and be
        wrong in a way nobody would notice. Zeroes are a value no layout accidentally looks right against.
      </Text>
      <Text size="sm" tone="muted">
        Reach for `Screen` before reaching for safeArea directly — applying insets is the thing every native screen
        needs and every web page ignores, so it belongs in one component rather than in every app.
      </Text>
    </Panel>
  )
}

/** `platform.os` / `platform.select` — the escape hatch, and why it should stay rare. */
const Naming = (): HostElement => {
  const padding = platform.select({ web: 12, ios: 16, android: 14, native: 14, default: 12 })
  const label = platform.select({ web: 'a browser tab', native: 'a device', default: 'something else' })

  return (
    <Panel
      title="platform.os · platform.select"
      blurb="select picks an exact OS name first, then `native` for any named non-web target, then `default`. It returns undefined when nothing matched, which is why default is worth providing for anything that is not genuinely optional."
    >
      <Readout>
        {[
          `platform.os → ${platform.os}`,
          `select({ web, ios, android, native, default }) → ${String(padding)}`,
          `this build is running in ${String(label)}`,
        ].join('\n')}
      </Readout>
      <Text size="sm" tone="muted">
        The host names itself — this one is the DOM host, the memory host calls itself `memory`, and a Lynx build would
        say so. Branching on a capability beats branching on a name, because `os === 'web'` is quietly wrong the day a
        second web-shaped target appears, and it is wrong in a way that typechecks.
      </Text>
    </Panel>
  )
}

/** What to do when the difference is structural rather than a leaf value. */
const Divergence = (): HostElement => (
  <Panel
    title="Whole-component divergence"
    blurb="When a difference is structural, do not branch — split the file. Sheet.web.tsx and Sheet.native.tsx need no runtime support at all, only resolution order in the bundler."
  >
    <Readout>
      {[
        '// vite.config.ts — already set in this app',
        "resolve: { extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'] }",
      ].join('\n')}
    </Readout>
    <Text size="sm" tone="muted">
      A whole file that is obviously platform-specific is reviewable, greppable and countable. An inline OS branch in
      the middle of a component is invisible divergence, and it accumulates faster than anyone expects — a count that
      climbs steadily means the abstraction is in the wrong place, not that the app needed the branches.
    </Text>
    <Text size="sm" tone="muted">
      When you do branch inline, keep it to LEAF values: a padding, a duration, a line count.
    </Text>
  </Panel>
)
