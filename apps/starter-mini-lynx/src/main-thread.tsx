import { globalProps, renderPage, signal } from '@amritk/mini-lynx'
import { isNativeModuleAvailable } from '@amritk/mini-lynx-native'
import './app.css'

/**
 * The main-thread chunk: the whole app, and the only file the engine executes
 * to get a first screen.
 *
 * There is no `App.tsx` importing this or imported by it. `renderPage` at the
 * bottom of the file IS the entry — it installs the global the engine calls
 * once at startup — and the components above it are ordinary functions that run
 * exactly once each.
 */

/** Whether the background chunk answered. See `background.ts` for the other half. */
const bridgeReady = signal<boolean | null>(null)

// Deliberately at module scope rather than inside a component: nothing native
// can be read during a build — the answer crosses a thread — so the call starts
// now and the signal it writes is what the tree is bound to. `Lynx.getDevTool`
// is asked for because the engine itself owns it, which makes a `false` here a
// statement about the bridge rather than about which modules an app linked.
void isNativeModuleAvailable('LynxDevToolSetModule')
  .then((available) => bridgeReady(available))
  .catch(() => bridgeReady(false))

const Counter = () => {
  const count = signal(0)

  return (
    <view class="card" bindtap={() => count(count() + 1)}>
      <text class="card-label">tap anywhere on this card</text>
      {/* A function child is a live binding; `count()` here would be frozen at
          the value it had while the tree was being built. */}
      <text class="card-value">{() => `${count()}`}</text>
    </view>
  )
}

/**
 * What the platform pushed in, as a signal.
 *
 * `globalProps()` is written twice by the runtime — once from
 * `lynx.__globalProps` before the first frame, and again whenever native calls
 * `updateGlobalProps` — so reading it inside a function child is all an app has
 * to do to follow a theme or a locale change.
 */
const Platform = () => (
  <view class="card">
    <text class="card-label">globalProps</text>
    <text class="card-value-small">{() => JSON.stringify(globalProps()) || '{}'}</text>
  </view>
)

const Bridge = () => (
  <view class="card">
    <text class="card-label">background chunk</text>
    <text class="card-value-small">
      {() => {
        const ready = bridgeReady()
        if (ready === null) return 'asking…'
        return ready ? 'bridge answered' : 'no answer — is background.ts in the bundle?'
      }}
    </text>
  </view>
)

const App = () => (
  <view class="screen">
    <text class="title">mini-lynx</text>
    <text class="subtitle">rspeedy → QR → Lynx Explorer</text>
    <Counter />
    <Platform />
    <Bridge />
  </view>
)

renderPage(App)
