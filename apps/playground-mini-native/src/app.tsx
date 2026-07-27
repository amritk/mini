import { computed, type HostElement, signal } from '@amritk/mini-native'
import { colorScheme } from '@amritk/mini-native/platform'
import { RouteLink, RouteView } from '@amritk/mini-native/router'
import { Heading, Screen, Stack, Text, ThemeContext } from '@amritk/mini-native/ui'

import { router, TABS } from './routes'
import { DARK, LIGHT, type Palette, PaletteContext, RADIUS, themeFor } from './theme'

/**
 * The shell: a header, a scrolling body holding one `<RouteView>` slot, and a
 * tab bar built from the route table.
 *
 * Everything below this line is written in the native vocabulary and the `/ui`
 * layer. There is no stylesheet, no `<div>`, and no `className` — the styling
 * is `style` bags of density-independent pixels, which is the part that has to
 * survive being pointed at a device.
 */
export const App = (): HostElement => {
  // Seeded from the host's environment signal, then owned by the app so the
  // toggle can override it. `colorScheme()` keeps tracking underneath, which is
  // why flipping the OS theme still reaches this while `override` is null.
  const scheme = colorScheme()
  const override = signal<'light' | 'dark' | null>(null)
  const effective = computed(() => override() ?? scheme())
  const palette = computed<Palette>(() => (effective() === 'dark' ? DARK : LIGHT))
  const theme = computed(() => themeFor(palette()))

  // Two providers, both holding SIGNALS rather than values. A component runs
  // exactly once and reads context exactly once, so a plain theme would be
  // whatever it was at boot — holding the signal is what makes this switch reach
  // the whole tree with no re-render and no invalidation pass.
  return PaletteContext.provide(palette, () =>
    ThemeContext.provide(theme, () => (
      <Screen
        style={() => ({ flex: 1, background: palette().background, overflow: 'hidden' })}
        label="mini-native playground"
      >
        <Header effective={effective} onToggle={() => override(effective() === 'dark' ? 'light' : 'dark')} />
        <scroll-view style={{ flex: 1, padding: 14, gap: 14 }}>
          <RouteView router={router} fallback={() => <NotFound />} />
        </scroll-view>
        <TabBar />
      </Screen>
    )),
  )
}

type HeaderProps = {
  effective: () => 'light' | 'dark'
  onToggle: () => void
}

/** Title, the active route's label, and the light/dark switch. */
const Header = (props: HeaderProps): HostElement => {
  const palette = PaletteContext.use()

  return (
    <view
      role="banner"
      style={() => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingTop: 14,
        paddingBottom: 12,
        paddingLeft: 14,
        paddingRight: 14,
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: palette().border,
        background: palette().surface,
      })}
    >
      <Stack>
        <Heading level={1} size="lg">
          mini-native
        </Heading>
        <Text size="xs" tone="muted">
          {() => router.route().route?.label ?? 'not found'}
        </Text>
      </Stack>
      <view
        role="button"
        label="Toggle colour scheme"
        onTap={props.onToggle}
        style={() => ({
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 12,
          paddingRight: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: palette().border,
          background: palette().surfaceAlt,
        })}
      >
        <text style={() => ({ color: palette().text, fontSize: 13 })}>
          {() => (props.effective() === 'dark' ? '☾ dark' : '☀ light')}
        </text>
      </view>
    </view>
  )
}

/** The tab bar, derived from the route table rather than duplicating it. */
const TabBar = (): HostElement => {
  const palette = PaletteContext.use()

  const isActive = (path: string): boolean => {
    const current = router.route().path
    return current === path || (path !== '/' && current.startsWith(`${path}/`))
  }

  return (
    <view
      role="navigation"
      label="Sections"
      style={() => ({
        flexDirection: 'row',
        gap: 4,
        padding: 8,
        borderTopWidth: 1,
        borderTopStyle: 'solid',
        borderTopColor: palette().border,
        background: palette().surface,
      })}
    >
      {TABS.map((route) => (
        <RouteLink
          to={route.path}
          navigate={router.navigate}
          label={route.label}
          style={() => ({
            flex: 1,
            alignItems: 'center',
            gap: 2,
            paddingTop: 6,
            paddingBottom: 6,
            borderRadius: RADIUS.sm,
            background: isActive(route.path) ? palette().surfaceAlt : 'transparent',
          })}
        >
          <text style={() => ({ fontSize: 15, color: isActive(route.path) ? palette().accent : palette().muted })}>
            {route.badge}
          </text>
          <text style={() => ({ fontSize: 10, color: isActive(route.path) ? palette().accent : palette().muted })}>
            {route.label}
          </text>
        </RouteLink>
      ))}
    </view>
  )
}

/** Rendered when nothing in the table matched — `route().route` is `null`. */
const NotFound = (): HostElement => (
  <Stack gap="sm">
    <Heading level={2}>Nothing here</Heading>
    <Text tone="muted">
      No route matched this path. You still got a page rather than a hard 404, because the Worker serves index.html for
      unknown paths and lets the client router decide.
    </Text>
    <RouteLink to="/" navigate={router.navigate}>
      <Text tone="accent">back to the vocabulary</Text>
    </RouteLink>
  </Stack>
)
