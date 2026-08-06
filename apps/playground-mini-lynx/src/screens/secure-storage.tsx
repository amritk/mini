import {
  clearSecureStorage,
  getSecureItem,
  hasSecureItem,
  isSecureStorageAvailable,
  MAX_VALUE_BYTES,
  removeSecureItem,
  type SecureItemOptions,
  setSecureItem,
} from '@amritk/lynx-secure-storage'
import { type LynxElement, signal } from '@amritk/mini-lynx'
import { Show } from '@amritk/mini-lynx/flow'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'
import { fakeDevice } from '../lib/fake-device'

/**
 * `/secure-storage` — `@amritk/lynx-secure-storage`, a credential on the disk.
 *
 * The iOS Keychain and Android's `EncryptedSharedPreferences` over a
 * Keystore-backed master key. Lynx ships no storage at all, so before this
 * package there was nowhere in a Lynx app to put a session token that was not a
 * plain file.
 *
 * ## The one thing this screen exists to show
 *
 * `getSecureItem` answers `string | null` and **throws** when the store cannot
 * be read. Every other package here reports failure as a value, and this one
 * does too for `setSecureItem` — but a read is different, because `null` has to
 * keep meaning exactly one thing: *there is no such key*. A store that would not
 * open, reported as an empty one, signs a user out of an app whose credential is
 * sitting on the disk intact.
 *
 * The panels below let you break the store four different ways and watch which
 * of them answer and which throw.
 *
 * ## What is real here and what is not
 *
 * The facade is the shipping one and the module underneath it is the package's
 * own published fake, driven over the real bridge. Nothing here is encrypted:
 * the fake is a `Map`, deliberately, because a preview that pretended to
 * encrypt would be asserting against its own invention. What it does reproduce
 * is every state the platforms can be in — and those are the states a device
 * will not produce on request.
 */
export const SecureStorageScreen = (): LynxElement => {
  const log = signal<readonly string[]>([])
  const record = (line: string): void => log([line, ...log()])

  return (
    <Stack gap="md">
      <Prose>
        Values are strings, not JSON — the Keychain stores `Data` and `EncryptedSharedPreferences` stores a `String`, so
        serialising is yours and the contract stays something you can read off the type. Nothing on this screen ever
        prints a stored value, and that is not squeamishness: a value that reaches a log has reached a file.
      </Prose>

      <Store record={record} />
      <AbsentOrBroken record={record} />
      <Locked record={record} />
      <Recovery record={record} />
      <Lifetimes record={record} />
      <Limits record={record} />
      <Results log={log} />
    </Stack>
  )
}

type RecordProps = {
  record: (line: string) => void
}

/** The value a demo writes. Long enough to have a length worth printing, and not a secret. */
const TOKEN = 'demo.session.token.9f2a1c'

/**
 * Runs one call and records what came back — including a throw, which on this
 * screen is a first-class outcome rather than an accident.
 *
 * Every call site here goes through this rather than a bare `.then`, because
 * the point being made is that four of these six functions can reject and one
 * of them cannot. Writing the `catch` once, visibly, is closer to what an app
 * should do than scattering it.
 */
const attempt = async (record: (line: string) => void, label: string, call: () => Promise<string>): Promise<void> => {
  try {
    record(`${label} → ${await call()}`)
  } catch (error) {
    record(`${label} → THREW ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** What is in the store, and the four calls that change it. */
const Store = (props: RecordProps): LynxElement => {
  const device = fakeDevice()
  const available = signal<boolean | null>(null)

  /** Reads the revision, so the listing re-runs whenever anything crossed the bridge. */
  const contents = (): string => {
    device.revision()
    const stored = device.secureStorage.stored()
    const keys = Object.keys(stored)
    if (keys.length === 0) return 'the store is empty'
    return keys
      .map((key) => `${key} · ${stored[key]?.accessibility} · ${stored[key]?.value.length ?? 0} chars`)
      .join('\n')
  }

  const write = (key: string, value: string, options?: SecureItemOptions): void => {
    void attempt(props.record, `set ${key}`, async () => {
      const result = await setSecureItem(key, value, options)
      // The one result on this screen that is a value rather than a throw. An
      // app that has just been handed a credential has to branch on this: a
      // failed write means signed in for this launch only.
      return result.ok ? 'ok' : `${result.error}: ${result.message}`
    })
  }

  return (
    <Panel
      title="The store"
      blurb="Keys, the accessibility each was written with, and the length of what is under them — never the value itself."
    >
      <Readout>{contents}</Readout>
      <Row>
        <Action onTap={() => write('session', TOKEN)}>set session</Action>
        <Action onTap={() => write('refresh', `${TOKEN}.refresh`)}>set refresh</Action>
        <Action
          onTap={() =>
            void attempt(props.record, 'get session', async () => {
              const value = await getSecureItem('session')
              return value === null ? 'null — there is no such key' : `${value.length} chars, unchanged`
            })
          }
        >
          get session
        </Action>
        <Action
          onTap={() => void attempt(props.record, 'has session', async () => String(await hasSecureItem('session')))}
        >
          has session
        </Action>
        <Action
          onTap={() =>
            void attempt(props.record, 'remove session', async () => {
              await removeSecureItem('session')
              return 'removed'
            })
          }
        >
          remove session
        </Action>
        <Action
          onTap={() =>
            void attempt(props.record, 'clear', async () => {
              await clearSecureStorage()
              return 'cleared'
            })
          }
        >
          clear
        </Action>
        <Action onTap={() => void isSecureStorageAvailable().then(available)}>isSecureStorageAvailable()</Action>
        <Chip tone={() => (available() === true ? 'good' : available() === false ? 'bad' : 'neutral')}>
          {() => `usable: ${available() === null ? '—' : available()}`}
        </Chip>
      </Row>
      <Prose>
        Removing a key that is not there is not an error on either platform, and neither is signing out twice.
        `clearSecureStorage` is scoped to this package — a host app's own Keychain items, filed under a service of their
        own, are never in reach of it.
      </Prose>
      <Prose>
        `hasSecureItem` exists so a splash screen can decide which route to show without the token ever crossing the
        bridge. On iOS the query does not ask for `kSecReturnData` at all, so the value is not even decrypted.
      </Prose>
    </Panel>
  )
}

/** The rule the whole surface is shaped around. */
const AbsentOrBroken = (props: RecordProps): LynxElement => {
  const device = fakeDevice()

  const read = (label: string): void => {
    void attempt(props.record, label, async () => {
      const value = await getSecureItem('session')
      return value === null ? 'null — signed out' : `${value.length} chars — signed in`
    })
  }

  return (
    <Panel
      title="null is absent, and only absent"
      blurb="Write a session, then read it twice: once from a healthy store, once from a keystore that will not answer. One of those is a null and the other is a throw."
    >
      <Row>
        <Action
          onTap={() => {
            void setSecureItem('session', TOKEN).then(() => read('healthy read'))
          }}
        >
          write, then read
        </Action>
        <Action
          onTap={() => {
            device.secureStorage.breakKeystore(true)
            read('broken read')
          }}
        >
          break the keystore, then read
        </Action>
        <Action
          onTap={() => {
            device.secureStorage.breakKeystore(false)
            props.record('the keystore works again')
          }}
        >
          repair it
        </Action>
      </Row>
      <Prose>
        Both reads are of a key that is really there. If the second one answered `null` — which is what a `catch` that
        falls back to `null` turns it into — the app would show a sign-in screen to a user whose credential is intact on
        the disk, and nothing anywhere would say why. That is the bug this API is shaped to make unwritable.
      </Prose>
      <Prose>
        `setSecureItem` is the exception and reports failure as a value, because its failure changes what the app does
        next rather than what it believes. `isSecureStorageAvailable()` never throws either — it is the version to reach
        for when a branch reads better than a `catch`.
      </Prose>
    </Panel>
  )
}

/** `whenUnlocked`, and the reason it is not the default. */
const Locked = (props: RecordProps): LynxElement => {
  const device = fakeDevice()
  const locked = signal(false)

  const read = (key: string): void => {
    void attempt(props.record, `get ${key}`, async () => {
      const value = await getSecureItem(key)
      return value === null ? 'null' : `${value.length} chars`
    })
  }

  return (
    <Panel
      title="Accessibility, and a locked screen"
      blurb="An iOS-only attribute, set per item at write time. Both spellings map to a ThisDeviceOnly protection class, so nothing here ever rides out through iCloud Keychain or an encrypted backup."
    >
      <Row>
        <Action onTap={() => void setSecureItem('session', TOKEN).then(() => props.record('set session (default)'))}>
          set session · afterFirstUnlock
        </Action>
        <Action
          onTap={() =>
            void setSecureItem('pin', '4821', { accessibility: 'whenUnlocked' }).then(() =>
              props.record('set pin (whenUnlocked)'),
            )
          }
        >
          set pin · whenUnlocked
        </Action>
        <Action
          onTap={() => {
            const next = !locked()
            locked(next)
            device.secureStorage.setDeviceLocked(next)
            props.record(next ? 'the screen locked' : 'the screen unlocked')
          }}
        >
          {() => (locked() ? 'unlock the device' : 'lock the device')}
        </Action>
        <Action onTap={() => read('session')}>get session</Action>
        <Action onTap={() => read('pin')}>get pin</Action>
        <Chip tone={() => (locked() ? 'bad' : 'good')}>{() => (locked() ? 'locked' : 'unlocked')}</Chip>
      </Row>
      <Prose>
        Lock the screen and the two reads part company: the session still answers, and the pin throws
        `errSecInteractionNotAllowed` — reported here as `unavailable`, because it will work again later. That is the
        whole argument for `afterFirstUnlock` being the default: whatever your app does in the background after a reboot
        has to be able to read its token, and a `whenUnlocked` token is unreadable in a pocket.
      </Prose>
      <Prose>
        The attribute does nothing on Android, and the package says so rather than pretending: a Keystore key is usable
        whenever the process runs, and `setUnlockedDeviceRequired` is per-key and API 28+. Do not build a security
        argument on a guarantee only one platform makes.
      </Prose>
    </Panel>
  )
}

/** The two ways a keystore goes wrong, and why only one of them recovers. */
const Recovery = (props: RecordProps): LynxElement => {
  const device = fakeDevice()

  const read = (label: string): void => {
    void attempt(props.record, label, async () => {
      const value = await getSecureItem('session')
      return value === null ? 'null — the store was discarded and rebuilt' : `${value.length} chars`
    })
  }

  return (
    <Panel
      title="When the keystore turns on you"
      blurb="A restored backup, a lock-screen change that invalidated the keys, or a keystore that is simply broken. Two of those recover and one does not."
    >
      <Row>
        <Action onTap={() => void setSecureItem('session', TOKEN).then(() => props.record('set session'))}>
          set session
        </Action>
        <Action
          onTap={() => {
            device.secureStorage.corruptKeyset()
            read('read after a corrupted keyset')
          }}
        >
          corrupt the keyset, then read
        </Action>
        <Action
          onTap={() => {
            device.secureStorage.setAvailable(false)
            read('read with no store at all')
          }}
        >
          take the store away
        </Action>
        <Action
          onTap={() => {
            device.secureStorage.setAvailable(true)
            device.secureStorage.breakKeystore(false)
            props.record('the store is back')
          }}
        >
          give it back
        </Action>
      </Row>
      <Prose>
        A corrupted keyset **succeeds**, having thrown everything away. `EncryptedSharedPreferences` throws when it
        cannot read its keyset, and for most apps that happens on `create`, on the path to the first screen — so the
        library discards the file and the master key and rebuilds the pair. The data was unrecoverable either way; the
        only question was whether the app opens. Treat it as "the user is signed out", never as corruption to report.
      </Prose>
      <Prose>
        That is also why the Android half excludes its own preferences file from backup, through the library's own
        manifest rather than through a line in a README. The master key never leaves the device, so a restored copy of
        the file is undecryptable ciphertext — which is worse than an absent file, because it reads as corruption rather
        than as a signed-out user.
      </Prose>
    </Panel>
  )
}

/** A process restart and a reinstall differ by one flag, and that flag is the story. */
const Lifetimes = (props: RecordProps): LynxElement => {
  const device = fakeDevice()

  const read = (label: string): void => {
    void attempt(props.record, label, async () => {
      const value = await getSecureItem('session')
      return value === null ? 'null — nothing survived' : `${value.length} chars — still here`
    })
  }

  return (
    <Panel
      title="Restart, and reinstall"
      blurb="Keychain items outlive the app they belong to. NSUserDefaults does not, and that difference is the entire mechanism."
    >
      <Row>
        <Action onTap={() => void setSecureItem('session', TOKEN).then(() => props.record('set session'))}>
          set session
        </Action>
        <Action
          onTap={() => {
            device.secureStorage.restartProcess()
            read('read after a restart')
          }}
        >
          restart the process
        </Action>
        <Action
          onTap={() => {
            device.secureStorage.reinstall()
            read('read after a reinstall')
          }}
        >
          delete and reinstall the app
        </Action>
      </Row>
      <Prose>
        A restart keeps the value: the disk survives being killed, and so does the first-run flag. A reinstall does not,
        and the reason is worth knowing rather than accepting — deleting an app on iOS leaves its Keychain items behind,
        so without this a reinstalled app would find a live session belonging to an install the user deliberately
        removed. The flag lives in `NSUserDefaults`, which an uninstall *does* clear, so its absence is the only signal
        iOS gives a process that it is new.
      </Prose>
      <Prose>
        The wipe runs once per process, not once per call — so the write immediately after a reinstall survives, which
        is exactly what a sign-in on a fresh install needs to do.
      </Prose>
    </Panel>
  )
}

/** Strings, and the cap that is this package's rather than the platform's. */
const Limits = (props: RecordProps): LynxElement => (
  <Panel
    title="Strings, and a cap"
    blurb="Both platforms would take far more than this. The cap exists so that a value which stores on one phone stores on the other."
  >
    <Row>
      <Action
        onTap={() =>
          void attempt(props.record, 'set a document', async () => {
            const result = await setSecureItem('blob', 'a'.repeat(MAX_VALUE_BYTES + 1))
            return result.ok ? 'ok' : `${result.error}: ${result.message}`
          })
        }
      >
        {`write ${MAX_VALUE_BYTES + 1} bytes`}
      </Action>
      <Action
        onTap={() =>
          void attempt(props.record, 'set a token', async () => {
            const result = await setSecureItem('blob', 'a'.repeat(MAX_VALUE_BYTES))
            return result.ok ? 'ok' : `${result.error}: ${result.message}`
          })
        }
      >
        {`write ${MAX_VALUE_BYTES} bytes`}
      </Action>
    </Row>
    <Prose>
      `tooLarge` rather than a truncated value, and counted in UTF-8 bytes on all three sides — counting characters
      would make the cap mean something different for a Japanese token. If you are anywhere near 8 KiB you are storing
      the wrong thing here: this is for credentials, and a document belongs in a file.
    </Prose>
  </Panel>
)

type ResultsProps = {
  log: () => readonly string[]
}

/** Everything the six functions answered, newest first — lengths, never values. */
const Results = (props: ResultsProps): LynxElement => (
  <Panel
    title="What came back"
    blurb="Results and throws in one list, in order. The distinction to watch for: a throw is not a null."
  >
    <Show when={() => props.log().length > 0} fallback={() => <TextLine class="card-meta">nothing yet</TextLine>}>
      {() => <Readout>{() => props.log().slice(0, 12).join('\n')}</Readout>}
    </Show>
  </Panel>
)
