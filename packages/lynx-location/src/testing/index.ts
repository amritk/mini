/**
 * `@amritk/lynx-location/testing` — the native module's contract, executable.
 *
 * The Kotlin and the Objective-C cannot run here, so the agreement between
 * JavaScript and native is otherwise pinned by nothing. `createFakeLocation` is
 * that agreement in a form a test can drive, and it is exported publicly
 * because an app testing its own location screens needs exactly this — a second
 * copy in every consumer would be a second thing to keep in step with two
 * native implementations.
 */
export { createFakeLocation, type FakeLocation } from './create-fake-location'
