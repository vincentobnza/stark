import type { ReactNode } from 'react'
import { useStark } from '../state/store'

/** 16px stroke icons, so they sit on the same optical weight as Selawik text. */
const I = {
  newChat: (
    <>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 5.4v5.2M5.4 8h5.2" />
    </>
  ),
  routine: (
    <>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 4.4V8l2.4 1.6" />
    </>
  ),
  tools: (
    <>
      <path d="M10.4 2.6a3.2 3.2 0 0 0-3.9 4L2.6 10.5a1.3 1.3 0 0 0 1.9 1.9l3.9-3.9a3.2 3.2 0 0 0 4-3.9L10.6 6.4 9.1 4.9z" />
    </>
  ),
  voice: (
    <>
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M4 7.5a4 4 0 0 0 8 0M8 11.5V14" />
    </>
  ),
  apps: (
    <>
      <rect x="2.2" y="2.2" width="4.6" height="4.6" rx="1" />
      <rect x="9.2" y="2.2" width="4.6" height="4.6" rx="1" />
      <rect x="2.2" y="9.2" width="4.6" height="4.6" rx="1" />
      <rect x="9.2" y="9.2" width="4.6" height="4.6" rx="1" />
    </>
  ),
  collapse: (
    <>
      <rect x="2" y="2.8" width="12" height="10.4" rx="1.6" />
      <path d="M6.4 2.8v10.4" />
    </>
  ),
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function Row({
  icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  shortcut?: string
  active?: boolean
  onClick?(): void
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
        active ? 'bg-hover text-ink' : 'text-ink-dim hover:bg-raise hover:text-ink'
      }`}
    >
      <Icon>{icon}</Icon>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">
          {shortcut}
        </span>
      )}
    </button>
  )
}

interface Props {
  open: boolean
  onToggle(): void
}

export function Sidebar({ open, onToggle }: Props) {
  const { messages, clearMessages, brain, model } = useStark()
  const hasChat = messages.length > 0

  if (!open) return null

  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-rail">
      {/* Matches the title bar height so the two align across the seam. */}
      <div data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 px-3">
        <img src="/icon.png" alt="" className="size-6 rounded" />
        <div data-tauri-drag-region className="flex-1" />
        <button
          onClick={onToggle}
          title="Collapse sidebar"
          className="grid size-7 place-items-center rounded-md text-ink-faint hover:bg-raise hover:text-ink"
        >
          <Icon>{I.collapse}</Icon>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <Row
          icon={I.newChat}
          label="New chat"
          shortcut="Ctrl K"
          active
          onClick={clearMessages}
        />

        <div className="mt-1 space-y-0.5">
          <Row icon={I.voice} label="Voice" />
          <Row icon={I.routine} label="Boot routine" />
          <Row icon={I.tools} label="Tools" />
          <Row icon={I.apps} label="Apps" />
        </div>

        <p className="mt-5 px-2.5 pb-1 text-[11px] text-ink-faint">Brain</p>
        <div className="px-2.5 py-1 text-[12px] text-ink-dim">
          <span className="capitalize">{brain === 'ollama' ? 'Local' : brain}</span>
          {brain === 'ollama' && model && (
            <span className="block truncate text-[11px] text-ink-faint">{model}</span>
          )}
        </div>

        <p className="mt-5 px-2.5 pb-1 text-[11px] text-ink-faint">Chats</p>
        {hasChat ? (
          <Row icon={I.newChat} label="Current conversation" active />
        ) : (
          <p className="px-2.5 text-[12px] text-ink-faint">Nothing yet</p>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-raise text-[11px] text-ink-dim">
          V
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-dim">Vincent</span>
      </div>
    </aside>
  )
}
