import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const ROOT = resolve(import.meta.dirname, '..')

/**
 * Runs a command, folding the child's output into the thrown error so a
 * failure shows what broke, not just a non-zero exit code.
 */
export const runCommand = async (
  command: string,
  args: string[],
  // `env` and `maxBuffer` are here for the Android check: it needs ANDROID_HOME
  // passed through, and Gradle's output comfortably exceeds Node's 1 MB default,
  // which would otherwise fail the run with a truncation error rather than a
  // build result.
  options: { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string }> => {
  try {
    return await execFileAsync(command, args, options)
  } catch (error) {
    const details = error as { stdout?: string; stderr?: string; message: string }
    throw new Error([details.message, details.stdout, details.stderr].filter(Boolean).join('\n'))
  }
}

/** Runs `node` — kept separate because plain Node (not Bun) is the point of these tests. */
export const runNode = (args: string[], options: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> =>
  runCommand('node', args, options)
