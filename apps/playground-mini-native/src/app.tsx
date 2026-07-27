import { type LynxElement, signal } from '@amritk/mini-native'
import { For } from '@amritk/mini-native/flow'
import { RouteView } from '@amritk/mini-native/router'

import { router, TABS } from './routes'

/**
 * The shell: a header, a scrolling body holding one `<RouteView>` slot, and a
 * tab bar built from the route table.
 *
 * Everything below is Lynx — the engine's own elements, the engine's own
 * attributes, the engine's own event names — styled with classes from
 * `styles.css`. There is no vocabulary in between, which means there is nothing
 * here that has to be kept in step with anything.
 */
export const App = (): LynxElement => {
  // The colour scheme is a class on the root, not a media query: Lynx has no
  // `@media` and no `prefers-color-scheme`. On a device the platform's scheme
  // arrives as data — through `globalProps` or a system-information global —
  // and the app decides what to do with it, which is what this switch stands in
  // for. See `styles.css`.
  const dark = signal(false)

  return (
    <view class={() => ['page', dark() && 'theme-dark']}>
      <view class="header">
        <view>
          <text class="title">
            <raw-text text="mini-native" />
          </text>
          <text class="subtitle">
            <raw-text text={() => router.route().route?.label ?? 'not found'} />
          </text>
        </view>
        <view
          class="action"
          accessibility-element={true}
          accessibility-traits="button"
          accessibility-label="Toggle colour scheme"
          bindtap={() => dark(!dark())}
        >
          <text class="action-label">
            <raw-text text={() => (dark() ? '☾ dark' : '☀ light')} />
          </text>
        </view>
      </view>

      <scroll-view class="body" scroll-orientation="vertical">
        <RouteView router={router} fallback={() => <NotFound />} />
      </scroll-view>

      <TabBar />
    </view>
  )
}

/**
 * The tab bar, derived from the route table rather than duplicating it.
 *
 * A horizontal `scroll-view`, because eleven evenly divided tabs give each
 * label about thirty pixels — which reads as broken rather than as dense. That
 * the behaviour comes from the engine's own scroll container rather than from
 * anything this app wrote is the small daily benefit of using the real
 * vocabulary.
 */
const TabBar = (): LynxElement => {
  const isActive = (path: string): boolean => {
    const current = router.route().path
    return current === path || (path !== '/' && current.startsWith(`${path}/`))
  }

  return (
    <scroll-view
      class="tabs"
      scroll-orientation="horizontal"
      accessibility-element={true}
      accessibility-label="Sections"
    >
      <For each={TABS} key={(tab) => tab.path}>
        {(tab) => (
          <view
            class={() => ['tab', isActive(tab.path) && 'tab-active']}
            accessibility-element={true}
            accessibility-traits="button"
            accessibility-label={tab.label}
            bindtap={() => router.navigate(tab.path)}
          >
            <text class="tab-badge">
              <raw-text text={tab.badge} />
            </text>
            <text class="tab-label">
              <raw-text text={tab.label} />
            </text>
          </view>
        )}
      </For>
    </scroll-view>
  )
}

/** Rendered when nothing in the table matched — `route().route` is `null`. */
const NotFound = (): LynxElement => (
  <view class="panel">
    <text class="panel-title">
      <raw-text text="Nothing here" />
    </text>
    <text class="panel-blurb">
      <raw-text text="No route matched this path." />
    </text>
    <view
      class="action"
      accessibility-element={true}
      accessibility-traits="button"
      bindtap={() => router.navigate('/')}
    >
      <text class="action-label">
        <raw-text text="back to the elements" />
      </text>
    </view>
  </view>
)
