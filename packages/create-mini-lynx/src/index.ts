/**
 * `@amritk/create-mini-lynx` — the scaffolder behind
 * `bun create @amritk/mini-lynx my-app`.
 *
 * The command is the point of this package; this entry exists so the same
 * scaffold is callable from a script — a monorepo generator, a docs example
 * builder, a test — without shelling out to it. `cli.ts` is the executable and
 * owns everything that needs a terminal.
 *
 * ```ts
 * import { scaffold } from '@amritk/create-mini-lynx'
 *
 * const { directory, files } = await scaffold({ directory: './my-app' })
 * ```
 */

export {
  DEFAULT_NAME,
  type ScaffoldOptions,
  type ScaffoldResult,
  scaffold,
  templateDirectory,
  toPackageName,
} from './scaffold'
