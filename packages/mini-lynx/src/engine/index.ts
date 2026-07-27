/**
 * `@amritk/mini-lynx/engine` — the platform boundary on its own.
 *
 * Import this when you are supplying an engine rather than rendering into one:
 * a test that drives a fake, an app that wants to wrap the globals before
 * installing them, or a tool that needs to name `LynxElement` without pulling
 * the runtime in.
 *
 * The whole boundary is one type and four functions, and that is the point.
 * There is no `Host` interface to implement here, because there is nothing to
 * port to: the target is Lynx, and Lynx already runs everywhere it runs.
 */

export { clearEngine, globalEngine, requireEngine, scheduleFlush, setEngine } from './current-engine'
export type { LynxElement, LynxElementApi } from './element-api'
