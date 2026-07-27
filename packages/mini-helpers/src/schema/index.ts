/**
 * `@amritk/mini-helpers/schema` — JSON Schema compiled to the plain
 * `(values) => errors` function both packages' `createForm` already accepts.
 *
 * Its own entry rather than part of `.` because it is the only thing here with
 * a dependency: `@amritk/runtime-validators`, an optional peer. Keeping it off
 * the main entry means a consumer who only wants route matching never has to
 * install a validator to get it, and it keeps the promise `.` makes — that it
 * resolves with nothing installed but itself.
 */
export type { FormErrors } from './schema-to-validator'
export { schemaToValidator } from './schema-to-validator'
