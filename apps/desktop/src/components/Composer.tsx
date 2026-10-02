import { useEffect, useRef, useState } from 'react'
import { useStark } from '../state/store'
import { Waveform } from './Waveform'

interface Props {
  onSend(text: string): void
  onStop(): void
  busy: boolean
  micOpen: boolean
  level: number
}

/** Grow with content, then scroll inside the box rather than shoving the page. */
const MAX_ROWS = 8

export function Composer({ onSend, onStop, busy, micOpen, level }: Props) {
  const [text, setText] = useState('')
  const { status, brain } = useStark()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 21
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS)}px`
  }, [text])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const send = () => {
    const value = text.trim()
    if (!value || busy) return
    setText('')
    onSend(value)
  }

  const listening = status === 'listening'
  const brainLabel = brain === 'ollama' ? 'Local' : brain === 'claude' ? 'Claude' : 'Kimi K3'

  return (
    <div
      className={`rounded-2xl border bg-raise transition-colors ${
        listening ? 'border-sky-500/50' : 'border-line focus-within:border-white/20'
      }`}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        placeholder="Ask anything, or just say “Stark”…"
        className="selectable block max-h-[11rem] w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
      />

      <div className="flex items-center gap-2 px-3 pb-2.5">
        {/* Mic state. The dot is the whole indicator when idle; the waveform
            only appears once the gate has actually opened. */}
        <span
          title={micOpen ? 'Listening for “Stark”' : 'Microphone unavailable'}
          className="grid size-8 shrink-0 place-items-center"
        >
          <span
            className={`size-2 rounded-full ${
              !micOpen
                ? 'bg-red-400/80'
                : listening
                  ? 'bg-sky-400'
                  : 'animate-pulse bg-teal-400/70'
            }`}
          />
        </span>

        <div className="h-7 min-w-0 flex-1">
          {listening && <Waveform level={level} active />}
        </div>

        <span className="shrink-0 text-[12px] text-ink-faint">{brainLabel}</span>

        {busy ? (
          <button
            onClick={onStop}
            title="Stop"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-hover text-ink hover:bg-white/20"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <rect width="12" height="12" rx="2.5" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!text.trim()}
            title="Send"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-black transition-colors hover:bg-white/90 disabled:bg-hover disabled:text-ink-faint"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M8 13V3M3.8 7.2 8 3l4.2 4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
