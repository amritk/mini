import { describe, expect, it } from 'vitest'

import { detectPackageManager, parseArgs } from './cli'
import { DEFAULT_NAME } from './scaffold'

describe('cli', () => {
  it('takes the directory as the one positional argument', () => {
    expect(parseArgs(['my-app'], 'bun/1.3.0').directory).toBe('my-app')
  })

  it('falls back to a default directory when none is given', () => {
    expect(parseArgs([], 'bun/1.3.0').directory).toBe(DEFAULT_NAME)
  })

  it('installs by default and stops on --no-install', () => {
    expect(parseArgs(['my-app'], 'bun/1.3.0').install).toBe(true)
    expect(parseArgs(['my-app', '--no-install'], 'bun/1.3.0').install).toBe(false)
  })

  it('leaves the dev server alone unless asked', () => {
    expect(parseArgs(['my-app'], 'bun/1.3.0').start).toBe(false)
    expect(parseArgs(['my-app', '--start'], 'bun/1.3.0').start).toBe(true)
  })

  it('takes the package manager in both spellings', () => {
    expect(parseArgs(['my-app', '--pm', 'pnpm'], 'bun/1.3.0').packageManager).toBe('pnpm')
    expect(parseArgs(['my-app', '--pm=yarn'], 'bun/1.3.0').packageManager).toBe('yarn')
  })

  // A flag that swallowed the directory as its value would scaffold into a
  // directory named after the mistake, which is worse than refusing.
  it('refuses a --pm it cannot honour', () => {
    expect(() => parseArgs(['--pm', 'my-app'], 'bun/1.3.0')).toThrow(/--pm takes one of/)
    expect(() => parseArgs(['my-app', '--pm'], 'bun/1.3.0')).toThrow(/--pm takes one of/)
  })

  // Ignoring one of the two would start a dev server against a directory with
  // no node_modules in it, and fail seconds later in vite's words rather than ours.
  it('refuses --start together with --no-install', () => {
    expect(() => parseArgs(['my-app', '--start', '--no-install'], 'bun/1.3.0')).toThrow(/--start needs the install/)
  })

  it('refuses unknown options and extra positionals', () => {
    expect(() => parseArgs(['my-app', '--template=react'], 'bun/1.3.0')).toThrow(/Unknown option/)
    expect(() => parseArgs(['one', 'two'], 'bun/1.3.0')).toThrow(/Expected one directory/)
  })

  it('reads the help and version flags in both spellings', () => {
    expect(parseArgs(['-h'], 'bun/1.3.0').help).toBe(true)
    expect(parseArgs(['--help'], 'bun/1.3.0').help).toBe(true)
    expect(parseArgs(['-v'], 'bun/1.3.0').version).toBe(true)
    expect(parseArgs(['--version'], 'bun/1.3.0').version).toBe(true)
  })

  // `npm create` and `bun create` both re-invoke this package, so the user
  // agent is the only thing that survives to say which one the user typed.
  it('follows the package manager that invoked it', () => {
    expect(detectPackageManager('npm/10.8.2 node/v22.6.0')).toBe('npm')
    expect(detectPackageManager('pnpm/9.7.0')).toBe('pnpm')
    expect(detectPackageManager('yarn/4.4.0')).toBe('yarn')
    expect(detectPackageManager('bun/1.3.11')).toBe('bun')
  })

  it('falls back to the runtime it is running on when the agent says nothing', () => {
    expect(detectPackageManager(undefined)).toBe(process.versions['bun'] === undefined ? 'npm' : 'bun')
    expect(detectPackageManager('deno/2.0.0')).toBe(process.versions['bun'] === undefined ? 'npm' : 'bun')
  })
})
