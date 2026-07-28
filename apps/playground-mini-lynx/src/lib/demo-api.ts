/**
 * A fake network.
 *
 * The `/data` screen needs something asynchronous that can be slow, can fail,
 * and can be refetched under a changing key. Pointing it at a real API would
 * make the playground depend on a third party staying up, and would make a
 * device build depend on the device having a network at all — which is exactly
 * the dependency a demo of caching and retries does not want.
 */

/** One row of the fake dataset. */
export type Package = {
  readonly name: string
  readonly downloads: number
  readonly target: string
}

const DATA: Readonly<Record<string, readonly Package[]>> = {
  amritk: [
    { name: 'mini', downloads: 4_120, target: 'dom' },
    { name: 'mini-lynx', downloads: 1_880, target: 'lynx · dom · memory' },
    { name: 'runtime-validators', downloads: 960, target: 'anywhere' },
  ],
  acme: [
    { name: 'widgets', downloads: 270, target: 'dom' },
    { name: 'kettle', downloads: 40, target: 'wasm' },
  ],
  empty: [],
}

/** Every scope the fake API knows about, plus one that always fails. */
export const SCOPES = ['amritk', 'acme', 'empty', 'nobody'] as const

export type Scope = (typeof SCOPES)[number]

/**
 * Resolves after a short delay, or rejects for an unknown scope — enough
 * latency for `isFetching` to be visible on screen, and enough failure for the
 * retry and error branches to be worth rendering.
 */
export const fetchPackages = (scope: string): Promise<readonly Package[]> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      const packages = DATA[scope]
      if (packages === undefined) {
        reject(new Error(`No such scope: ${scope}`))
        return
      }
      resolve(packages)
    }, 550)
  })

/**
 * Pretends to save something, failing on demand.
 *
 * The `/forms` screen needs a submit that takes long enough for
 * `form.isSubmitting` to show, and a rejection whose message lands in
 * `form.submitError` without the screen wiring its own try/catch.
 */
export const saveProfile = (values: { readonly handle: string }): Promise<void> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      if (values.handle === 'taken') {
        reject(new Error('That handle is already registered'))
        return
      }
      resolve()
    }, 700)
  })
