import { invoke } from '@tauri-apps/api/core'

export interface RoutineStep {
  id: string
  label: string
  enabled: boolean
  command: string
  args: string[]
  /** Process to wait for before moving on, e.g. "Code.exe". */
  await_process: string | null
  /** Press Play/Pause once this step's process is up. */
  media_play: boolean
  /** Spoken before the step runs. Falls back to "Opening {label}". */
  say: string | null
}

export interface Routine {
  enabled: boolean
  initial_delay_ms: number
  gap_ms: number
  speak_greeting: boolean
  /** Narrate each step as it runs. */
  speak_steps: boolean
  speak_summary: boolean
  steps: RoutineStep[]
}

export type StepState = 'pending' | 'starting' | 'waiting' | 'ready' | 'failed' | 'skipped'

export interface StepProgress {
  id: string
  label: string
  state: StepState
  detail?: string
}

export const readRoutine = (): Promise<Routine> => invoke('read_routine')
export const writeRoutine = (routine: Routine): Promise<string> =>
  invoke('write_routine', { routine })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Poll until the process appears, or give up. Returns whether it showed up. */
async function awaitProcess(name: string, timeoutMs = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await invoke<boolean>('process_running', { name })) return true
    await sleep(400)
  }
  return false
}

export interface RunOptions {
  onProgress(progress: StepProgress[]): void
  /** Announce a line. Resolves when it has finished speaking. */
  say(text: string): Promise<void>
  greeting: string
  signal?: AbortSignal
}

/**
 * Runs the boot routine in order.
 *
 * Sequential rather than parallel on purpose: launching ten apps at once makes
 * Windows thrash and they all come up slower. Each step waits for its process
 * to actually exist before the next one starts, so the pace matches the
 * machine instead of a guessed delay.
 */
export async function runRoutine(routine: Routine, opts: RunOptions): Promise<StepProgress[]> {
  const active = routine.steps.filter((s) => s.enabled)
  const progress: StepProgress[] = active.map((s) => ({
    id: s.id,
    label: s.label,
    state: 'pending',
  }))
  const emit = () => opts.onProgress([...progress])
  emit()

  const aborted = () => opts.signal?.aborted ?? false

  if (routine.speak_greeting) await opts.say(opts.greeting)
  if (aborted()) return progress

  // Let the desktop finish settling before adding to its workload.
  await sleep(routine.initial_delay_ms)

  for (let i = 0; i < active.length; i++) {
    if (aborted()) break
    const step = active[i]
    progress[i].state = 'starting'
    emit()

    // Narrate before launching, so the line lands while the app is opening
    // rather than after it is already on screen.
    if (routine.speak_steps) {
      await opts.say(step.say?.trim() || `Opening ${step.label}.`)
      if (aborted()) break
    }

    try {
      await invoke('open_app', { name: step.command, args: step.args })
    } catch (err) {
      progress[i].state = 'failed'
      progress[i].detail = err instanceof Error ? err.message : String(err)
      emit()
      continue
    }

    if (step.await_process) {
      progress[i].state = 'waiting'
      emit()
      const up = await awaitProcess(step.await_process)
      progress[i].state = up ? 'ready' : 'failed'
      // Launched but never appeared: usually a wrong process name in the
      // config rather than a genuinely failed launch, so say which.
      if (!up) progress[i].detail = `${step.await_process} never appeared`
    } else {
      progress[i].state = 'ready'
    }
    emit()

    if (step.media_play && progress[i].state === 'ready') {
      // Spotify ignores media keys for a moment after its window appears.
      await sleep(1500)
      await invoke('media_play_pause').catch(() => {})
    }

    if (i < active.length - 1) await sleep(routine.gap_ms)
  }

  if (routine.speak_summary && !aborted()) {
    const ready = progress.filter((p) => p.state === 'ready').length
    const failed = progress.filter((p) => p.state === 'failed')
    await opts.say(
      failed.length === 0
        ? 'Your workspace is ready.'
        : `Workspace ready, ${ready} of ${progress.length}. ${failed
            .map((f) => f.label)
            .join(' and ')} did not start.`,
    )
  }

  return progress
}
