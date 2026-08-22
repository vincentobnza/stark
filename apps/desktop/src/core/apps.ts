/**
 * The apps Stark is allowed to launch, and what people actually call them.
 *
 * A 3B model will happily emit `open_app("may")` or `open_app("zoom")` for
 * software that does not exist here. Resolving through a fixed registry turns
 * that into an honest "I don't know that app" instead of a silent no-op that
 * the model then reports as success.
 */
export interface KnownApp {
  label: string
  /** Passed to the `open_app` command. */
  command: string
  /** Spoken forms, lowercase. First entry is the canonical name. */
  aliases: string[]
}

export const KNOWN_APPS: KnownApp[] = [
  {
    label: 'Cursor',
    command: 'C:\\Users\\vince\\AppData\\Local\\Programs\\cursor\\Cursor.exe',
    aliases: ['cursor', 'vs code', 'vscode', 'visual studio code', 'code', 'the editor', 'editor'],
  },
  { label: 'Chrome', command: 'chrome', aliases: ['chrome', 'google chrome', 'browser'] },
  { label: 'Edge', command: 'msedge', aliases: ['edge', 'microsoft edge'] },
  { label: 'Spotify', command: 'spotify', aliases: ['spotify', 'music', 'my music'] },
  {
    label: 'Terminal',
    command: 'wt',
    aliases: ['terminal', 'windows terminal', 'console', 'shell', 'command line'],
  },
  {
    label: 'Postman',
    command: 'C:\\Users\\vince\\AppData\\Local\\Postman\\Postman.exe',
    aliases: ['postman'],
  },
  {
    label: 'Discord',
    command: 'C:\\Users\\vince\\AppData\\Local\\Discord\\Update.exe',
    aliases: ['discord'],
  },
  { label: 'File Explorer', command: 'explorer', aliases: ['explorer', 'file explorer', 'files'] },
  { label: 'Settings', command: 'ms-settings', aliases: ['settings', 'windows settings'] },
  { label: 'Notepad', command: 'notepad', aliases: ['notepad'] },
  { label: 'Calculator', command: 'calc', aliases: ['calculator', 'calc'] },
  { label: 'Task Manager', command: 'taskmgr', aliases: ['task manager'] },
]

/** Everything Stark can open, for prompts and error messages. */
export const APP_NAMES = KNOWN_APPS.map((a) => a.label).join(', ')

const clean = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[.!?,]+$/, '')
    .replace(/^(the|my)\s+/, '')
    .replace(/\s+(app|application)$/, '')

/**
 * Resolve a spoken app name. Exact alias first, then a contains-match, so
 * "open up chrome please" still lands on Chrome.
 */
export function resolveApp(spoken: string): KnownApp | null {
  const q = clean(spoken)
  if (!q) return null

  for (const app of KNOWN_APPS) {
    if (app.aliases.includes(q)) return app
  }
  // Longest alias first: "vs code" must beat "code" inside "open vs code".
  const byLength = KNOWN_APPS.flatMap((app) => app.aliases.map((a) => ({ app, a }))).sort(
    (x, y) => y.a.length - x.a.length,
  )
  for (const { app, a } of byLength) {
    if (q.includes(a)) return app
  }
  return null
}
