import { AnimatePresence, motion } from 'motion/react'
import type { StepProgress, StepState } from '../core/routine'

const MARK: Record<StepState, string> = {
  pending: '·',
  starting: '>',
  waiting: '>',
  ready: 'OK',
  failed: '!!',
  skipped: '-',
}

const TONE: Record<StepState, string> = {
  pending: 'text-white/25',
  starting: 'text-teal-300/80',
  waiting: 'text-amber-300/80',
  ready: 'text-teal-300',
  failed: 'text-red-300',
  skipped: 'text-white/25',
}

interface Props {
  steps: StepProgress[]
  /** Null while still running. */
  done: boolean
  onDismiss(): void
}

export function BootSequence({ steps, done, onDismiss }: Props) {
  if (steps.length === 0) return null
  const ready = steps.filter((s) => s.state === 'ready').length

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="absolute inset-x-2 bottom-20 z-30 border border-white/12 bg-[#0b0b0d]/97 p-3 backdrop-blur-xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[9px] tracking-[0.28em] text-white/40 uppercase">
            {done ? 'workspace ready' : 'preparing workspace'}
          </span>
          <span className="ml-auto text-[9px] text-white/30">
            {ready}/{steps.length}
          </span>
          {done && (
            <button
              onClick={onDismiss}
              className="px-1 text-[10px] text-white/30 hover:text-white/70"
              title="Dismiss"
            >
              ✕
            </button>
          )}
        </div>

        <ul className="space-y-1">
          {steps.map((s) => (
            <li key={s.id} className="flex items-baseline gap-2 text-[11px]">
              <span className={`w-5 shrink-0 ${TONE[s.state]}`}>{MARK[s.state]}</span>
              <span className={s.state === 'pending' ? 'text-white/30' : 'text-white/80'}>
                {s.label}
              </span>
              {s.detail && (
                <span className="ml-auto truncate text-[9px] text-red-300/70">{s.detail}</span>
              )}
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  )
}
