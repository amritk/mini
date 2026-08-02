/**
 * `@amritk/lynx-deep-linking/testing` — the native module's contract,
 * executable.
 *
 * The Kotlin and the Objective-C cannot run here, so the agreement between
 * JavaScript and native is otherwise pinned by nothing. `createFakeDeepLinking`
 * is that agreement in a form a test can drive, and it is exported publicly
 * because an app testing its own link handling needs exactly this — a cold
 * start, a warm link and a link that arrived with the screen gone are three
 * cases no device makes easy to stage, and a second copy in every consumer
 * would be a second thing to keep in step with two native implementations.
 */
export { createFakeDeepLinking, type FakeDeepLinking } from './create-fake-deep-linking'
