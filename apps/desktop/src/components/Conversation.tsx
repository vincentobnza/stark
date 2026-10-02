import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStark } from '../state/store'
import type { ChatMessage } from '../state/store'

/** Tool results are JSON. Show enough to recognise, not enough to drown in. */
function summarise(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 220 ? `${flat.slice(0, 220)}…` : flat
}

function Row({ message }: { message: ChatMessage }) {
  if (message.role === 'tool') {
    return (
      <div className="flex justify-start">
        <div
          className={`selectable flex min-w-0 max-w-full items-baseline gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
            message.failed
              ? 'border-red-500/30 bg-red-500/8 text-red-200/90'
              : 'border-white/10 bg-white/4 text-white/50'
          }`}
        >
          <span className={message.failed ? 'shrink-0 text-red-300' : 'shrink-0 text-teal-300/80'}>
            {message.toolName ?? 'tool'}
          </span>
          <span className="min-w-0 break-words">{summarise(message.text)}</span>
        </div>
      </div>
    )
  }

  const mine = message.role === 'user'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`selectable min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap ${
          mine
            ? 'rounded-br-md bg-sky-500/15 text-white/90'
            : 'rounded-bl-md bg-white/6 text-white/85'
        }`}
      >
        {message.text}
      </div>
    </div>
  )
}

export function Conversation() {
  const { messages, streaming, status } = useStark()
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Only auto-scroll when already at the bottom, so reading back is not yanked. */
  const pinned = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (pinned.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, streaming])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6 sm:px-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Row message={m} />
            </motion.div>
          ))}
        </AnimatePresence>

        {streaming && (
          <div className="flex justify-start">
            <div className="selectable min-w-0 max-w-[85%] rounded-2xl rounded-bl-md bg-white/6 px-4 py-2.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-white/60">
              {streaming}
            </div>
          </div>
        )}

        {status === 'thinking' && !streaming && (
          <div className="flex justify-start">
            <div className="flex gap-1.5 rounded-2xl rounded-bl-md bg-white/6 px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1.5 rounded-full bg-white/50"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}
