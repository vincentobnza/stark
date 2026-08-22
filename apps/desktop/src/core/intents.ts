import { invoke } from '@tauri-apps/api/core'
import { APP_NAMES, resolveApp } from './apps'

/**
 * Deterministic handling for the things people actually say to a desktop
 * assistant.
 *
 * The local model is 3B. Asked to route "open spotify" it takes seconds and
 * sometimes invents an app; a regex takes microseconds and is never wrong. So
 * the common commands never reach the model at all — it only sees genuine
 * conversation. That is most of the speed and nearly all of the accuracy.
 */

/**
 * Whisper mishears the wake word constantly — "stark" becomes start, spark,
 * stock, dark. All of them are accepted: a false accept costs one ignored
 * command, a false reject makes Stark look deaf.
 */
const WAKE = /^(?:hey\s+|ok\s+|okay\s+)?(?:stark|start|starke|spark|stock|dark|jarvis|jervis)\b[\s,.:!-]*/i

export interface Addressed {
  /** Whether the utterance was directed at Stark. */
  addressed: boolean
  /** The command with any wake word removed. */
  command: string
}

/**
 * With an always-on mic in a room playing music, everything Whisper hears would
 * otherwise become a command — which is exactly how `send_notification("Goodbye")`
 * happened. Requiring the name fixes that, except during a short follow-up
 * window so a real conversation does not need it every sentence.
 */
export function addressedToStark(text: string, followUpUntil: number): Addressed {
  const match = text.match(WAKE)
  if (match) return { addressed: true, command: text.slice(match[0].length).trim() }
  if (Date.now() < followUpUntil) return { addressed: true, command: text.trim() }
  return { addressed: false, command: text.trim() }
}

interface Intent {
  pattern: RegExp
  run(match: RegExpMatchArray): Promise<string>
}

interface SystemInfo {
  total_memory_mb: number
  used_memory_mb: number
  cpu_count: number
  os: string
  local_time: string
}

const INTENTS: Intent[] = [
  {
    // "open spotify", "launch vs code", "start chrome for me"
    pattern: /^(?:please\s+)?(?:open|launch|start|run|fire up|bring up)\s+(?:up\s+)?(.+)$/i,
    async run(m) {
      const app = resolveApp(m[1])
      if (!app) {
        // Naming the real options beats a vague failure, and stops the model
        // being blamed for something the registry simply does not contain.
        return `I don't know that app. I can open ${APP_NAMES}.`
      }
      await invoke('open_app', { name: app.command, args: [] })
      return `Opening ${app.label}.`
    },
  },
  {
    pattern: /\b(?:what(?:'s| is)? the )?time\b|what time is it/i,
    async run() {
      const info = await invoke<SystemInfo>('get_system_info')
      // The command returns "YYYY-MM-DD HH:MM:SS TZ"; only the clock is wanted.
      const [, clock = ''] = info.local_time.split(' ')
      const [h, min] = clock.split(':')
      const hour = Number(h)
      const suffix = hour >= 12 ? 'PM' : 'AM'
      const twelve = hour % 12 === 0 ? 12 : hour % 12
      return `It's ${twelve}:${min} ${suffix}.`
    },
  },
  {
    pattern: /\b(?:memory|ram)\b/i,
    async run() {
      const info = await invoke<SystemInfo>('get_system_info')
      const total = (info.total_memory_mb / 1024).toFixed(0)
      const used = (info.used_memory_mb / 1024).toFixed(1)
      return `${used} of ${total} gigabytes in use.`
    },
  },
  {
    pattern: /\b(?:play|pause|resume|stop)\b.*\b(?:music|song|spotify|track)\b|^(?:play|pause|resume)$/i,
    async run() {
      await invoke('media_play_pause')
      return 'Done.'
    },
  },
  {
    pattern: /\bclipboard\b/i,
    async run() {
      const text = await invoke<string>('read_clipboard')
      return text ? `Your clipboard says: ${text.slice(0, 200)}` : 'Your clipboard is empty.'
    },
  },
]

/**
 * Returns a spoken reply if a rule matched, or null to hand off to the model.
 */
export async function tryIntent(command: string): Promise<string | null> {
  const text = command.trim()
  if (!text) return null
  for (const intent of INTENTS) {
    const match = text.match(intent.pattern)
    if (match) {
      try {
        return await intent.run(match)
      } catch (err) {
        return `That failed: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }
  return null
}
