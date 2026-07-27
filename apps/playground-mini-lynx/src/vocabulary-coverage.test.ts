import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every tag in the vocabulary is demonstrated somewhere in this app.
 *
 * The playground's job is to make the ceiling visible: the package owns no
 * vocabulary of its own, so what it can express is whatever Lynx builds, and a
 * screen that quietly covers a subset is back to the thing the Lynx rewrite
 * removed. That drifts in one direction and drifts silently — a tag arrives in
 * `@lynx-js/types`, the vocabulary picks it up for free because it is DERIVED
 * rather than transcribed, and nobody has any reason to notice it is undemoed.
 *
 * So the question "is the playground up to date with the engine?" is asked here
 * on every run rather than by whoever next wonders about it.
 *
 * This is a SOURCE scan, and it has to be: the vocabulary is a hundred percent
 * type, so there is no runtime value to enumerate. That makes it approximate in
 * one known direction — it sees a tag that is written down, not a tag that is
 * genuinely exercised — which is the right failure to accept. Writing the tag
 * is what pins the attribute spellings and the nesting rules, and it is exactly
 * what a reviewer of a new tag would check for.
 */

const HERE = new URL('.', import.meta.url).pathname
const VOCABULARY = join(HERE, '../../../packages/mini-lynx/src/vocabulary/intrinsic.ts')

/**
 * The two tags deliberately absent, and why.
 *
 * Both are stated on the elements screen too, in prose, so a reader of the app
 * gets the same answer as a reader of this file. Neither is a gap: they are the
 * two tags an app built on this runtime has no business authoring.
 */
const NOT_DEMONSTRATED: Readonly<Record<string, string>> = {
  page: 'the root the framework already generates, and whose size the engine will not let you set',
  component: "Lynx's own component instantiation, which this runtime does not drive — it owns the whole tree",
}

/**
 * The tag keys of `IntrinsicElements`, read out of the package's source.
 *
 * Sliced to the type body first so the helper types below it — which have keys
 * of their own — cannot leak in and be mistaken for tags.
 */
const vocabularyTags = (): readonly string[] => {
  const source = readFileSync(VOCABULARY, 'utf8')
  const start = source.indexOf('export type IntrinsicElements = {')
  const body = source.slice(start, source.indexOf('\n}', start))

  const tags = [...body.matchAll(/^ {2}'?([a-z][a-z0-9-]*)'?:/gm)].map((match) => match[1] as string)

  // A guard on the guard. If this file's regex ever stops matching the way the
  // vocabulary is written, every assertion below would pass vacuously and this
  // test would become decoration.
  expect(tags.length).toBeGreaterThan(30)
  return tags
}

/** Every `.tsx` under `src/`, which is where a demo can live. */
const screenSources = (): string => {
  const read = (dir: string): string =>
    readdirSync(dir, { withFileTypes: true })
      .map((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return read(path)
        return entry.name.endsWith('.tsx') ? readFileSync(path, 'utf8') : ''
      })
      .join('\n')

  return read(HERE)
}

/**
 * Whether a tag is written as JSX anywhere.
 *
 * The trailing character class is what keeps `list` from matching inside
 * `list-item` — the bug this check would otherwise have, and the one that would
 * make the whole suite pass while `<list>` itself went undemoed.
 */
const isBuilt = (tag: string, sources: string): boolean => new RegExp(`<${tag}[\\s>/]`).test(sources)

describe('vocabulary coverage', () => {
  const tags = vocabularyTags()
  const sources = screenSources()

  const missing = tags.filter((tag) => NOT_DEMONSTRATED[tag] === undefined && !isBuilt(tag, sources))

  it('builds every tag in the vocabulary on some screen', () => {
    expect(missing).toEqual([])
  })

  it('accounts for the tags it does not build', () => {
    // The exemption list is checked in both directions. A tag that gets demoed
    // after all should lose its exemption rather than keep a stale reason
    // sitting next to a working demo.
    for (const [tag, reason] of Object.entries(NOT_DEMONSTRATED)) {
      expect(tags, `${tag} is exempted but is not in the vocabulary`).toContain(tag)
      expect(reason.length).toBeGreaterThan(20)
    }
  })
})
