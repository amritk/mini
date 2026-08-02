/**
 * `@amritk/lynx-dialogs/testing` — the native module's contract, executable.
 *
 * The Kotlin and the Objective-C cannot run here, so the agreement between
 * JavaScript and native is otherwise pinned by nothing. `createFakeDialogs` is
 * that agreement in a form a test can drive, and it is exported publicly
 * because an app testing a screen that opens a picker needs exactly this — a
 * second copy in every consumer would be a second thing to keep in step with
 * two native implementations.
 *
 * It is also the only way to test the branch that matters most in a consumer's
 * code: what the screen does when the user cancels.
 */
export { createFakeDialogs, type FakeDialogs, type FakePresentation } from './create-fake-dialogs'
