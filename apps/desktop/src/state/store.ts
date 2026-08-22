import { create } from 'zustand'
import type { ApprovalDecision, ApprovalRequest } from '../core/agent/loop'
import type { VoiceEngine } from '../voice'

export type Status = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'awaiting' | 'speaking'

/** A single transient line under the orb. Not a transcript — it is replaced, never appended. */
export interface Caption {
  kind: 'heard' | 'said' | 'tool'
  text: string
}

export interface PendingApproval {
  request: ApprovalRequest
  decide(decision: ApprovalDecision): void
}

interface StarkState {
  status: Status
  caption: Caption | null
  /** Assistant text as it streams in; takes precedence over `caption`. */
  streaming: string
  pending: PendingApproval | null
  error: string | null
  model: string
  models: string[]
  voiceReply: boolean
  /** Which engine speaks the reply. */
  voiceEngine: VoiceEngine
  /** Whether the service has an ElevenLabs key, i.e. is the option real. */
  ttsReady: boolean
  /** When true every tool runs unattended, `never-auto` ones included. */
  autoApprove: boolean

  setStatus(status: Status): void
  setCaption(caption: Caption | null): void
  pushDelta(delta: string): void
  commitStreaming(): void
  setPending(pending: PendingApproval | null): void
  setError(error: string | null): void
  setModel(model: string): void
  setModels(models: string[]): void
  toggleVoiceReply(): void
  toggleAutoApprove(): void
  setVoiceEngine(engine: VoiceEngine): void
  setTtsReady(ready: boolean): void
}

export const useStark = create<StarkState>((set) => ({
  status: 'idle',
  caption: null,
  streaming: '',
  pending: null,
  error: null,
  model: 'qwen2.5:3b',
  models: [],
  voiceReply: true,
  // Prefer the cloud voice; the session downgrades this if no key is configured.
  voiceEngine: 'elevenlabs',
  ttsReady: false,
  autoApprove: true,

  setStatus: (status) => set({ status }),
  setCaption: (caption) => set({ caption }),
  pushDelta: (delta) => set((s) => ({ streaming: s.streaming + delta })),
  commitStreaming: () => set({ streaming: '' }),
  setPending: (pending) => set({ pending }),
  setError: (error) => set({ error }),
  setModel: (model) => set({ model }),
  setModels: (models) => set({ models }),
  toggleVoiceReply: () => set((s) => ({ voiceReply: !s.voiceReply })),
  toggleAutoApprove: () => set((s) => ({ autoApprove: !s.autoApprove })),
  setVoiceEngine: (voiceEngine) => set({ voiceEngine }),
  setTtsReady: (ttsReady) => set({ ttsReady }),
}))
