# @amritk/lynx-deep-linking

**Deep links for Lynx.** An Android native module, an iOS native module, and a
promise-shaped facade that reaches them from a main-thread
[`@amritk/mini-lynx`](../mini-lynx) tree.

```ts
import { getInitialURL, onDeepLink, openURL, parseURL } from '@amritk/lynx-deep-linking'

const open = (url: string) => router.navigate(parseURL(url).path)

const initial = await getInitialURL() // the link that launched the app
if (initial) open(initial)

onDeepLink(({ url }) => open(url)) // the ones that arrive while it runs

await openURL('https://example.com') // and the outbound direction
```

## Why this exists

Lynx ships no linking module — `NativeModules` is an access point, not a
catalogue, and the official answer to anything platform-shaped is "write native
code and send it into your Lynx code". Two community packages do exist, and
both are parts of a framework rather than a library you can add:
[`@sigx/lynx-linking`](https://www.npmjs.com/package/@sigx/lynx-linking) depends
on `@sigx/lynx-core` and wants a `sigx prebuild` step, and
[`@tamer4lynx/tamer-linking`](https://www.npmjs.com/package/@tamer4lynx/tamer-linking)
peers on ReactLynx and links through the `t4l` CLI. Neither reaches the main
thread a `mini-lynx` tree renders on.

## Install

```sh
bun add @amritk/lynx-deep-linking
```

`@amritk/mini-lynx-native` comes with it — it is the wire every call travels.

## JavaScript setup

One line, in your **background** chunk:

```ts
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

Without it every call queues forever and nothing says why. `NativeModules` is a
background-thread global and `@amritk/mini-lynx` renders on the main thread, so
this package cannot reach the platform without a chunk it does not own
installing the other half. See
[`@amritk/mini-lynx-native`](../mini-lynx-native) for the reasoning.

Then, at your app root on the main thread:

```tsx
import { onCleanup } from '@amritk/mini-lynx'
import { getInitialURL, onDeepLink, parseURL } from '@amritk/lynx-deep-linking'

const App = () => {
  const open = (url: string) => {
    const { host, path, query } = parseURL(url)
    if (host === 'order') router.navigate(`/order/${path.slice(1)}`, query)
  }

  // Two mechanisms because they are two different moments: the launch URL
  // happened before this process could listen, and is never re-delivered.
  getInitialURL().then((url) => url && open(url))
  onCleanup(onDeepLink(({ url }) => open(url)))

  return <Router />
}
```

Subscribe at the **root**, on first render — not on the screen the link points
at, which does not exist yet.

## Host-app setup

`lynx.lib.json` declares both native sources, so Lynx's autolinking picks them
up. What autolinking cannot supply is the scheme your app answers to, or the
delegate callbacks only your app receives.

### Android

Declare your scheme on the activity that hosts your LynxView:

```xml
<activity android:name=".MainActivity" android:launchMode="singleTask" android:exported="true">
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="myapp" />
  </intent-filter>
</activity>
```

Then forward one callback. This is the only line this library needs, and there
is no way around it — `onNewIntent` is an activity method no library can
observe:

```kotlin
override fun onNewIntent(intent: Intent) {
  super.onNewIntent(intent)
  setIntent(intent)
  DeepLinks.handleIntent(intent)
}
```

**The cold start needs nothing.** A `ContentProvider` in this library's manifest
registers an activity lifecycle callback during process startup and captures the
launching intent, which is what makes `getInitialURL()` work with no wiring at
all.

To open a **custom scheme** — another app of yours, WhatsApp, Spotify — add it
to your manifest, or `openURL` will report `noHandler` on a device where the app
is plainly installed. Android 11 hides everything you have not declared:

```xml
<queries>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="whatsapp" />
  </intent>
</queries>
```

`https`, `mailto`, `tel` and `sms` are already declared by this library and
reach your app through manifest merging.

If your build does not run Lynx's annotation processor, register the module by
hand:

```kotlin
LynxEnv.inst().registerModule("MiniLynxDeepLinkingModule", MiniLynxDeepLinkingModule::class.java)
```

### iOS

Declare your scheme in `Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>myapp</string></array>
  </dict>
</array>
```

Register the module where you build your Lynx config:

```objc
#import <MiniLynxDeepLinking/MiniLynxDeepLinkingModule.h>

[config registerModule:MiniLynxDeepLinkingModule.class];
```

Then forward what iOS delivers only to your delegate. There is no supported way
for a library to intercept these without swizzling — the same bargain
[`@amritk/lynx-notifications`](../lynx-notifications) makes for APNs:

```objc
// UIApplicationDelegate — a link into a running app
- (BOOL)application:(UIApplication *)app openURL:(NSURL *)url options:(NSDictionary *)options {
  [MiniLynxDeepLinkingCenter.shared handleURL:url];
  return YES;
}

// Universal Links (https://) arrive as a user activity instead
- (BOOL)application:(UIApplication *)application
    continueUserActivity:(NSUserActivity *)userActivity
      restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> *))restorationHandler {
  [MiniLynxDeepLinkingCenter.shared handleUserActivity:userActivity];
  return YES;
}
```

**A scene-based app needs one more**, because iOS puts a launch URL in the
scene's connection options rather than in the app's launch options — where this
library reads it automatically:

```objc
- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)options {
  [MiniLynxDeepLinkingCenter.shared handleLaunchURL:options.URLContexts.anyObject.URL];
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts {
  [MiniLynxDeepLinkingCenter.shared handleURL:URLContexts.anyObject.URL];
}
```

To open a custom scheme, list it in `LSApplicationQueriesSchemes` — `canOpenURL`
answers false for anything missing, and the list is capped at 50 entries:

```xml
<key>LSApplicationQueriesSchemes</key>
<array><string>whatsapp</string></array>
```

## API

```ts
getInitialURL(): Promise<string | null>            // the URL that launched the process
onDeepLink(listener: (link: DeepLink) => void): () => void  // the ones after that

openURL(url: string): Promise<OpenResult>          // hand a URL to the system
canOpenURL(url: string): Promise<boolean>          // …would it go anywhere?
openSettings(): Promise<boolean>                   // this app's page in Settings

isDeepLinkingAvailable(): Promise<boolean>         // is the native module linked at all

parseURL(url: string): ParsedURL                   // pure, no bridge
createURL(scheme: string, path?: string, options?: CreateURLOptions): string
```

`OpenResult` is a discriminated union — `{ ok: true }` or
`{ ok: false, error, message }` — rather than a rejection. Lynx has no error
convention for bridge callbacks, so a failure has to travel as a value anyway,
and "no app on this device opens that" is an ordinary branch in a UI.

`openSettings` is the missing half of every permission API in this repository:
[`@amritk/lynx-location`](../lynx-location) and
[`@amritk/lynx-notifications`](../lynx-notifications) both report a `denied` that
only the settings app can undo.

## The things that actually bite

- **The first segment is the host.** `myapp://profile/42` parses as host
  `profile`, path `/42` — not path `/profile/42`. A `//` opens an authority and
  the grammar does not care that a custom scheme has no host. Every parser on
  every platform agrees; route on `host` too, or put a dummy authority in your
  links (`myapp://app/profile/42`).
- **`noHandler` usually means undeclared, not uninstalled.** Android 11 package
  visibility and iOS `LSApplicationQueriesSchemes` both hide apps you never said
  you wanted to reach. See the two snippets above.
- **The launch URL is not an event.** It is `getInitialURL()`, once, at the
  root. `onDeepLink` never re-delivers it — an app wired to both would otherwise
  navigate twice for one tap.
- **`getInitialURL()` does not change.** It is the launch of *this process*, not
  the latest link. Reading it on every screen mount re-runs the launch
  navigation on every mount.
- **A link can arrive with no view up.** The native side holds one and replays
  it when `onDeepLink` subscribes — which is why subscribing at the root during
  the first render matters, and why the held link is delivered only once.
- **`launchMode="singleTask"` (or `singleTop`) on Android**, or every link
  starts a second copy of your activity and `onNewIntent` never fires.
- **Recents is not a new link.** Android re-delivers the original intent when a
  user returns through the recents screen; this library ignores those, which is
  why swiping back to your app does not re-open last week's deep link.
- **`openSettings()` does not come back.** The app is backgrounded, and on iOS a
  permission changed in Settings *terminates* it. Do not put unsaved state
  behind it.

## Testing

`@amritk/lynx-deep-linking/testing` ships the native module's contract as an
in-memory fake, which is what this package's own suite runs against:

```ts
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { MODULE } from '@amritk/lynx-deep-linking'
import { createFakeDeepLinking } from '@amritk/lynx-deep-linking/testing'

const contexts = createFakeContexts()
const emitter = createFakeEmitter()
const linking = createFakeDeepLinking(emitter)

setPeerContext(contexts.mainThread)
installNativeBridge({ peer: contexts.background, emitter, modules: { [MODULE]: linking.module } })

linking.setInitialURL('myapp://order/42') // a cold start
linking.deliver('myapp://order/99')       // a link into a running app
linking.hold('myapp://order/7')           // one that arrived with no view up
```

It reproduces the platforms rather than smoothing them over: a scheme the host
app never declared fails as `noHandler` even though the "device" could obviously
open it, and the held link is delivered exactly once. A fake friendlier than a
device would hide the bugs worth catching.

## Status, and what is actually verified

**Pre-alpha, and nothing here has run on a device.** Four checks of decreasing
reach stand behind it, and it is worth knowing which one a green run came from:

| Check | Command | Strength |
| --- | --- | --- |
| Facade behaviour | `bun run test` | real code, fake platform |
| Cross-language signatures | `src/native-contract.test.ts` | parses Kotlin + Objective-C, compares to TypeScript |
| Kotlin compiles + packages | `bun run check:android` | real Lynx AAR, real Android SDK |
| Objective-C compiles | `pod lib lint` (manual, macOS — not in CI) | real Lynx pod, real iOS SDK |

None of that is a device. Whether the `ContentProvider` initialiser wins the
race against the first activity, whether `+load` fires before the launch
notification in a host app that links statically, what a scene-based app
actually delivers, and whether Lynx's annotation processor registers the module
without the generated Spec its own template extends are all unverified. See
[`AGENTS.md`](./AGENTS.md).

## Licence

MIT
