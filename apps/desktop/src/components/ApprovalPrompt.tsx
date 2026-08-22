import { useEffect } from 'react'
import { motion } from 'motion/react'
import { useStark } from '../state/store'

export function ApprovalPrompt() {
  const pending = useStark((s) => s.pending)

  // Enter allows once, Escape denies. Nothing auto-resolves on its own.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') pending.decide('allow-once')
      if (e.key === 'Escape') pending.decide('deny')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) return null

  const { request, decide } = pending
  const critical = request.risk === 'never-auto'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`absolute inset-x-2 bottom-2 z-30 border bg-[#0b0b0d]/98 p-3 backdrop-blur-xl ${
        critical ? 'border-red-500/45' : 'border-amber-400/35'
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`px-1.5 py-0.5 text-[9px] tracking-[0.18em] uppercase ${
            critical ? 'bg-red-500/15 text-red-300' : 'bg-amber-400/15 text-amber-200'
          }`}
        >
          {critical ? 'every time' : 'approval'}
        </span>
        <span className="text-[10px] text-white/40">{request.toolName}</span>
      </div>

      <p className="selectable mb-2.5 text-[11px] leading-snug break-words text-white/85">
        {request.description}
      </p>

      <div className="flex gap-1.5 text-[11px]">
        <button
          onClick={() => decide('allow-once')}
          className="bg-teal-400/15 px-2.5 py-1.5 text-teal-200 hover:bg-teal-400/25"
        >
          Allow once <span className="text-white/30">↵</span>
        </button>
        {!critical && (
          <button
            onClick={() => decide('allow-session')}
            className="bg-white/8 px-2.5 py-1.5 text-white/50 hover:text-white/80"
          >
            Session
          </button>
        )}
        <button
          onClick={() => decide('deny')}
          className="ml-auto bg-white/8 px-2.5 py-1.5 text-white/50 hover:text-red-300"
        >
          Deny <span className="text-white/30">esc</span>
        </button>
      </div>
    </motion.div>
  )
}
