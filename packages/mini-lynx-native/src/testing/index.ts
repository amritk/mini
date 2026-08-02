/**
 * `@amritk/mini-lynx-native/testing` — the fakes both halves of the bridge run
 * against.
 *
 * There is no `lynx` object in a test runner, so without these the package
 * could only be exercised on a device. What is faked is deliberately narrow:
 * the two context proxies and the emitter, which is to say the platform and
 * nothing else. The channel, the protocol, the handshake and the serving logic
 * under test are the ones that ship.
 *
 * Exported publicly rather than kept internal because a module package built on
 * this bridge — `@amritk/mini-lynx-notifications` is the first — needs the same
 * two fakes to test its own facade, and a second copy of them would be a second
 * thing to keep faithful.
 */
export { createFakeContexts, type FakeContexts } from './create-fake-contexts'
export { createFakeEmitter, type FakeEmitter } from './create-fake-emitter'
