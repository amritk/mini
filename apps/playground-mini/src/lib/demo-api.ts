/**
 * A fake network. The `/query` page needs something asynchronous that can be
 * slow, can fail, and can be refetched under a changing key — pointing it at a
 * real API would make the playground depend on a third party staying up, and
 * Cloudflare would serve it from an edge that may be nowhere near that API.
 */

/** One row of the fake dataset. */
export type Repo = {
  readonly name: string
  readonly stars: number
  readonly language: string
}

const DATA: Readonly<Record<string, readonly Repo[]>> = {
  amritk: [
    { name: 'mini', stars: 412, language: 'TypeScript' },
    { name: 'mini-lynx', stars: 188, language: 'TypeScript' },
    { name: 'mjst', stars: 96, language: 'TypeScript' },
  ],
  acme: [
    { name: 'widgets', stars: 27, language: 'TypeScript' },
    { name: 'kettle', stars: 4, language: 'Rust' },
  ],
  empty: [],
}

/** Every owner the fake API knows about, plus one that always 404s. */
export const OWNERS = ['amritk', 'acme', 'empty', 'nobody'] as const

export type Owner = (typeof OWNERS)[number]

/**
 * Resolves after a short delay, or rejects for an unknown owner — enough
 * latency for `isFetching` to be visible and enough failure for the retry and
 * error branches to be worth rendering.
 */
export const fetchRepos = (owner: string): Promise<readonly Repo[]> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      const repos = DATA[owner]
      if (repos === undefined) {
        reject(new Error(`No such owner: ${owner}`))
        return
      }
      resolve(repos)
    }, 550)
  })
