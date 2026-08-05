# AI.md — @amritk/lynx-deep-linking

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

A native module on each platform, plus a promise-shaped facade that reaches it.
`Intent.ACTION_VIEW` and `onNewIntent` on Android; `UIApplication.open` and the
app-delegate URL callbacks on iOS.

Two directions, and they are not symmetrical:

- **In.** A link that *launched* the app is a value (`getInitialURL`). A link
  that arrives while it runs is an event (`onDeepLink`). The launch URL is never
  delivered as an event, so an app can use both without handling one tap twice.
- **Out.** `openURL` / `canOpenURL` / `openSettings`.

Everything is a promise, because `NativeModules` lives in Lynx's background
context and a `@amritk/mini-lynx` tree renders on the main thread. There is no
synchronous read of anything here.

## Setup: one line you will forget

```ts
// background chunk — without this every call queues forever and nothing says why
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
installNativeBridge()
```

The native side links itself through `lynx.lib.json`. **The scheme does not.**
`<intent-filter>` in the host's `AndroidManifest.xml`, `CFBundleURLTypes` in its
`Info.plist`, plus one forwarded callback per platform for links into a running
app — all in the README.

## The surface, in full

```ts
import {
  canOpenURL,
  createURL,
  getInitialURL,
  isDeepLinkingAvailable,
  onDeepLink,
  openSettings,
  openURL,
  parseURL,
} from '@amritk/lynx-deep-linking'

getInitialURL(): Promise<string | null>                       // the URL that launched this process
onDeepLink(listener: (link: { url: string }) => void): () => void   // every URL after that

openURL(url: string): Promise<OpenResult>
canOpenURL(url: string): Promise<boolean>
openSettings(): Promise<boolean>                              // this app's page in system Settings

isDeepLinkingAvailable(): Promise<boolean>                    // whether the module is linked at all

parseURL(url: string): ParsedURL                              // pure, no bridge, no await
createURL(scheme: string, path?: string, options?: CreateURLOptions): string

type OpenResult =
  | { ok: true }
  | { ok: false; error: 'invalidURL' | 'noHandler' | 'unavailable'; message: string }

type ParsedURL = {
  scheme: string | null            // lowercased
  host: string | null              // the first segment of a custom-scheme URL — read this
  path: string                     // still percent-encoded
  query: Record<string, string>    // decoded
  fragment: string | null          // decoded
}

type CreateURLOptions = { host?: string; query?: Record<string, string>; fragment?: string }
```

## The two moments, wired together

```tsx
import { onCleanup } from '@amritk/mini-lynx'

const open = (url: string) => router.navigate(parseURL(url).path)

getInitialURL().then((url) => url && open(url))   // cold start, once, at the root
onCleanup(onDeepLink(({ url }) => open(url)))     // everything after
```

Subscribe at the **app root during first render**. A link that arrived with no
view up is held natively and replayed to whoever subscribes first, exactly once
— subscribing on the screen the link points at loses it, because that screen
does not exist yet.

## Results are unions, not rejections

```ts
const result = await openURL('whatsapp://send?phone=15550100')
if (!result.ok && result.error === 'noHandler') showTheNumberInstead()
```

`callNativeAsync` rejects only when the call could not be *made* (module not
linked, method missing). "Nothing opens that" comes back as `{ ok: false }`.

## Wiring it into signals

There are no signals in this package, on purpose: a second edge onto
`alien-signals` gives a consumer two reactive graphs that cannot see each
other's writes. Wiring is one line.

```tsx
import { onCleanup, signal } from '@amritk/mini-lynx'

const link = signal<string | null>(null)
getInitialURL().then(link)
onCleanup(onDeepLink(({ url }) => link(url)))
```

## Getting this wrong

- **Routing on `path` alone.** `myapp://profile/42` is host `profile`, path
  `/42`. This is the single most common deep-linking bug and it is the URL
  grammar, not this parser. Route on `host` too, or mint links with a dummy
  authority (`myapp://app/profile/42`).
- **Expecting `onDeepLink` to fire for the launch URL.** It never does. That is
  `getInitialURL`.
- **Re-reading `getInitialURL()` on every mount.** It answers the same URL for
  the whole process lifetime, so a screen that reads it on mount re-navigates on
  every mount.
- **Reading `noHandler` as "the app is not installed".** It usually means the
  host app never declared the scheme — `<queries>` on Android 11+,
  `LSApplicationQueriesSchemes` on iOS.
- **Forgetting `onNewIntent`.** Without that one line the app receives no links
  at all once it is running; cold start still works, which makes it look like a
  routing bug rather than a wiring one.
- **Forgetting `launchMode="singleTask"`.** Every link starts a second copy of
  the activity instead.
- **Building link strings by hand.** `createURL` encodes; concatenation does
  not, and an unencoded `&` in an OAuth state token loses half the link.
- **Assuming `path` is decoded.** It is not. `matchRoute` from
  `@amritk/mini-helpers` decodes per segment, which is the level that is safe.

## Testing your own screens

```ts
import { MODULE } from '@amritk/lynx-deep-linking'
import { createFakeDeepLinking } from '@amritk/lynx-deep-linking/testing'

const links = createFakeDeepLinking()
installNativeBridge({ peer, emitter, modules: { [MODULE]: links.module } })
```

It is the executable statement of the JavaScript-to-native contract, and it
reproduces platform rules rather than smoothing them: an undeclared scheme fails
as `noHandler`, a URL with no scheme as `invalidURL`, and a held link is
replayed exactly once. Handles: `setInitialURL`, `deliver`, `hold`,
`setHandledSchemes`, `opened()`, `settingsOpened()`.

`MODULE` is the key `NativeModules` exposes the native module under, and the
one the fake registers against. `EVENTS` names the global events the native
side publishes — there is exactly one, `EVENTS.link` — and you need it only to
forward or assert on the emitter directly; `onDeepLink` is the way in.

## Status

Pre-alpha. The Kotlin compiles in CI against the real Lynx AAR, and a parity
suite pins both native method surfaces against the TypeScript. The Objective-C
compiles only when somebody runs `pod lib lint` on a Mac by hand — the macOS CI
job was disabled on cost — and **none of it has run on a device.** The cold-start
capture on both platforms depends on load-order behaviour (a `ContentProvider`
on Android, `+load` on iOS) that nothing here can exercise. Do not present it as
proven.
