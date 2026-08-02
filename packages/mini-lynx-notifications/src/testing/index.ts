/**
 * `@amritk/mini-lynx-notifications/testing` — the native module, in memory.
 *
 * Exported publicly because an app's own notification screens need something to
 * run against, and the alternative is every consumer writing the same fake
 * against a native contract they cannot see.
 */
export { createFakeNotifications, type FakeNotifications } from './create-fake-notifications'
