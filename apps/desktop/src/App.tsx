import { useEffect, useState } from 'react'
import { ApprovalPrompt } from './components/ApprovalPrompt'
import { Composer } from './components/Composer'
import { Conversation } from './components/Conversation'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { useStark } from './state/store'
import { useStarkSession } from './useStarkSession'

/** One-tap starters. Each is just text sent as if typed. */
const CHIPS = [
  'What time is it?',
  'How much memory do I have?',
  'Open Spotify',
  'Open Cursor',
  "What's in my clipboard?",
]

export default function App() {
  const { messages, error, pending, status } = useStark()
  const { send, interrupt, interruptible, micOpen, level } = useStarkSession()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Enter and Escape cancel a turn. The composer owns plain Enter, so these
  // only fire when nothing is focused or while a reply is in flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending) return
      if (e.key === 'Escape' && interruptible) {
        e.preventDefault()
        interrupt()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [interrupt, interruptible, pending])

  // Narrow windows cannot afford 228px of rail.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const apply = () => setSidebarOpen(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const busy = status === 'thinking' || status === 'transcribing' || status === 'speaking'
  const empty = messages.length === 0

  return (
    <div className="flex h-full w-full overflow-hidden bg-app text-ink">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(false)} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <TitleBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(true)} />

        {empty ? (
          /* Home: wordmark, composer, starters — centred in the canvas. */
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 sm:px-6">
            <div className="w-full max-w-3xl">
              <h1 className="mb-7 text-center text-[clamp(2.5rem,7vw,4.25rem)] leading-none font-bold tracking-[0.16em] text-white/85">
                STARK
              </h1>

              <Composer
                onSend={send}
                onStop={interrupt}
                busy={busy}
                micOpen={micOpen}
                level={level}
              />

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => send(c)}
                    disabled={busy}
                    className="rounded-full border border-line bg-raise/60 px-3.5 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-white/20 hover:text-ink disabled:opacity-40"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <Conversation />
            <div className="shrink-0 px-4 pb-4 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                <Composer
                  onSend={send}
                  onStop={interrupt}
                  busy={busy}
                  micOpen={micOpen}
                  level={level}
                />
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="selectable absolute inset-x-4 bottom-2 z-20 mx-auto max-w-3xl truncate rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-center text-[11px] text-red-200/90">
            {error}
          </p>
        )}

        <ApprovalPrompt />
      </main>
    </div>
  )
}
