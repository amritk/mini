/**
 * `@amritk/mini-lynx/bridge` — the recovery path for event delivery.
 *
 * One subpath for one job: if the default worklet transport turns out not to
 * round-trip on your engine build, this is what you install instead. Nothing
 * here is imported by the core, so an app that never needs it never pays for
 * it — and an app that does needs one line at startup rather than a fork.
 *
 * The seam itself (`setEventTransport`, `workletTransport`, `EventTransport`)
 * is on the `.` entry, because `add-event` reads it on every binding.
 */
export {
  clearNamedHandlers,
  dispatchNamedEvent,
  HANDLER_PREFIX,
  namedHandlerTransport,
} from './named-handlers'
