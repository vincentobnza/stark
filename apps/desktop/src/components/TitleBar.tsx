import { useEffect, useState } from 'react'
import { hide, isMaximized, minimize, onResized, toggleMaximize } from '../window'
import { useStark } from '../state/store'
import { selectBrain, selectModel } from '../agent'
import type { Brain } from '../agent'

const BRAIN_LABEL: Record<Brain, string> = {
  ollama: 'Local',
  claude: 'Claude',
  kimi: 'Kimi K3',
}

const BRAIN_NOTE: Record<Brain, string> = {
  ollama: 'Runs on this machine. Private and fast, but limited.',
  claude: 'Claude Opus 5. Fast and capable.',
  // Measured on the free tier, not guessed.
  kimi: 'Kimi K3 via NVIDIA. Very capable, but around 2.5 minutes per reply.',
}

const STATUS_NOTE: Partial<Record<string, string>> = {
  listening: 'Listening',
  transcribing: 'Transcribing',
  thinking: 'Thinking',
  awaiting: 'Waiting for you',
  speaking: 'Speaking',
}

interface Props {
  sidebarOpen: boolean
  onToggleSidebar(): void
}

/** The window is frameless, so this supplies the drag region and the buttons. */
export function TitleBar({ sidebarOpen, onToggleSidebar }: Props) {
  const { status, brain, llmReady, kimiReady, voiceReply, toggleVoiceReply, autoApprove, toggleAutoApprove } =
    useStark()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void isMaximized().then(setMaximized)
    return onResized(() => void isMaximized().then(setMaximized))
  }, [])

  const brains: Brain[] = [
    'ollama',
    ...(llmReady ? (['claude'] as const) : []),
    ...(kimiReady ? (['kimi'] as const) : []),
  ]

  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-11 shrink-0 items-center gap-2 pl-2 select-none"
    >
      {!sidebarOpen && (
        <button
          onClick={onToggleSidebar}
          title="Show sidebar"
          className="grid size-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-raise hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <rect x="2" y="2.8" width="12" height="10.4" rx="1.6" />
            <path d="M6.4 2.8v10.4" />
          </svg>
        </button>
      )}

      <span
        className={`flex items-center gap-1.5 pl-1 text-[12px] text-ink-dim transition-opacity ${
          status === 'idle' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-sky-400" />
        {STATUS_NOTE[status] ?? ''}
      </span>

      <div data-tauri-drag-region className="min-w-0 flex-1" />

      {/* Settings collapse out before the window buttons do. */}
      <div className="hidden items-center gap-1 pr-1 md:flex">
        {/* Native select chrome is light-themed and fights the dark UI, so the
            control is restyled and the chevron drawn by hand. */}
        <div className="relative">
          <select
            value={brain}
            onChange={(e) => selectBrain(e.target.value as Brain)}
            title={BRAIN_NOTE[brain]}
            className="appearance-none rounded-lg border border-line bg-raise py-1 pr-6 pl-2.5 text-[12px] text-ink-dim outline-none hover:text-ink focus-visible:border-white/25"
          >
            {brains.map((b) => (
              <option key={b} value={b} className="bg-raise text-ink">
                {BRAIN_LABEL[b]}
              </option>
            ))}
          </select>
          <svg
            width="9"
            height="9"
            viewBox="0 0 10 10"
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-faint"
            aria-hidden
          >
            <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <button
          onClick={toggleVoiceReply}
          title={voiceReply ? 'Spoken replies on' : 'Spoken replies off'}
          className={`rounded-lg px-2 py-1 text-[12px] hover:bg-raise ${
            voiceReply ? 'text-sky-300' : 'text-ink-faint'
          }`}
        >
          {voiceReply ? 'Voice' : 'Muted'}
        </button>

        <button
          onClick={toggleAutoApprove}
          title={
            autoApprove
              ? 'Auto-approve is on — every tool runs unattended'
              : 'Asks before anything that changes your machine'
          }
          className={`rounded-lg px-2 py-1 text-[12px] hover:bg-raise ${
            autoApprove ? 'text-amber-300' : 'text-ink-faint'
          }`}
        >
          {autoApprove ? 'Auto' : 'Ask'}
        </button>
      </div>

      <div className="flex h-full items-stretch">
        <button
          onClick={minimize}
          title="Minimise"
          className="grid w-11 place-items-center text-ink-dim hover:bg-raise hover:text-ink"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={toggleMaximize}
          title={maximized ? 'Restore' : 'Maximise'}
          className="grid w-11 place-items-center text-ink-dim hover:bg-raise hover:text-ink"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden>
            {maximized ? (
              <>
                <rect x="0.5" y="2.5" width="7" height="7" />
                <path d="M2.5 2.5V0.5h7v7h-2" />
              </>
            ) : (
              <rect x="0.5" y="0.5" width="9" height="9" />
            )}
          </svg>
        </button>
        <button
          onClick={hide}
          title="Hide — Ctrl+Alt+Space brings it back"
          className="grid w-11 place-items-center text-ink-dim hover:bg-red-600 hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" aria-hidden>
            <path d="M0 0L10 10M10 0L0 10" />
          </svg>
        </button>
      </div>
    </header>
  )
}

export { selectModel }
