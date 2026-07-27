import { mount, setHost } from '@amritk/mini-native'
import { createDomHost, domRoot } from '@amritk/mini-native/hosts/dom'

import { App } from './app'
import { OverlayContext } from './lib/overlay'

/**
 * The entry point, and the only file in this app that knows it is on the web.
 *
 * Picking the host is the whole of that decision: `createDomHost()` here, a
 * Lynx host on a device, the memory host in a test. Everything below this line
 * is written against the `Host` contract and never against a browser — which is
 * why the DOM is a PREVIEW target for a native app here rather than the real
 * target that native approximates.
 *
 * `setHost` must run before anything renders. `requireHost()` throws otherwise,
 * because that is a boot-order mistake rather than a recoverable condition.
 *
 * The layout reset comes with the host and is load-bearing: without it an
 * unstyled container with two children stacks vertically on a device and
 * horizontally in a browser, which is the difference between a component tree
 * that runs on both and one that has to be adjusted per target.
 */
setHost(createDomHost())

const root = document.getElementById('app')
const overlay = document.getElementById('overlay')
if (root === null || overlay === null) throw new Error('#app and #overlay must both exist in index.html')

// The overlay root is created by the app, not by the host, and provided so no
// screen has to reach for `document` to open a modal. `provide` takes a
// function: an already-built child would have been built before the provider
// ran, and would have read the fallback.
mount(domRoot(root), () => OverlayContext.provide(domRoot(overlay), () => <App />))
