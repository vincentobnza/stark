import { create } from 'zustand'
import type { ApprovalDecision, ApprovalRequest } from '../core/agent/loop'
import type { VoiceEngine } from '../voice'
import type { Brain } from '../agent'

export type Status = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'awaiting' | 'speaking'

/** A single transient line under the orb. Not a transcript — it is replaced, never appended. */
export interface Caption {
  kind: 'heard' | 'said' | 'tool'
  text: string
}

/** One entry in the conversation. Tool runs appear inline, as their own row. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  /** Set on `tool` rows: which tool ran. */
  toolName?: string
  failed?: boolean
  at: number
}

export interface PendingApproval {
  request: ApprovalRequest
  decide(decision: ApprovalDecision): void
}

interface StarkState {
  status: Status
  caption: Caption | null
  /** The conversation, oldest first. */
  messages: ChatMessage[]
  /** Assistant text as it streams in; rendered as a live row at the end. */
  streaming: string
  pending: PendingApproval | null
  error: string | null
  model: string
  models: string[]
  /** Which brain answers: the local model or Claude. */
  brain: Brain
  /** Whether the service has Anthropic credentials, i.e. is Claude offerable. */
  llmReady: boolean
  /** Whether the service has an NVIDIA key, i.e. is Kimi offerable. */
  kimiReady: boolean
  voiceReply: boolean
  /** Which engine speaks the reply. */
  voiceEngine: VoiceEngine
  /** Whether the service has an ElevenLabs key, i.e. is the option real. */
  ttsReady: boolean
  /** When true every tool runs unattended, `never-auto` ones included. */
  autoApprove: boolean

  setStatus(status: Status): void
  setCaption(caption: Caption | null): void
  addMessage(message: Omit<ChatMessage, 'id' | 'at'>): void
  clearMessages(): void
  pushDelta(delta: string): void
  commitStreaming(): void
  setPending(pending: PendingApproval | null): void
  setError(error: string | null): void
  setModel(model: string): void
  setModels(models: string[]): void
  setBrain(brain: Brain): void
  setLlmReady(ready: boolean): void
  setKimiReady(ready: boolean): void
  toggleVoiceReply(): void
  toggleAutoApprove(): void
  setVoiceEngine(engine: VoiceEngine): void
  setTtsReady(ready: boolean): void
}

/** Monotonic row ids. Timestamps collide when tools resolve in the same tick. */
let seq = 0

export const useStark = create<StarkState>((set) => ({
  status: 'idle',
  messages: [],
  caption: null,
  streaming: '',
  pending: null,
  error: null,
  model: 'qwen2.5:3b',
  models: [],
  brain: 'ollama',
  llmReady: false,
  kimiReady: false,
  voiceReply: true,
  // Prefer the cloud voice; the session downgrades this if no key is configured.
  voiceEngine: 'elevenlabs',
  ttsReady: false,
  autoApprove: true,

  setStatus: (status) => set({ status }),
  setCaption: (caption) => set({ caption }),
  addMessage: (message) =>
    set((s) => ({
      messages: [...s.messages, { ...message, id: `m${++seq}`, at: Date.now() }],
    })),
  clearMessages: () => set({ messages: [], caption: null, streaming: '' }),
  pushDelta: (delta) => set((s) => ({ streaming: s.streaming + delta })),
  commitStreaming: () => set({ streaming: '' }),
  setPending: (pending) => set({ pending }),
  setError: (error) => set({ error }),
  setModel: (model) => set({ model }),
  setModels: (models) => set({ models }),
  setBrain: (brain) => set({ brain }),
  setLlmReady: (llmReady) => set({ llmReady }),
  setKimiReady: (kimiReady) => set({ kimiReady }),
  toggleVoiceReply: () => set((s) => ({ voiceReply: !s.voiceReply })),
  toggleAutoApprove: () => set((s) => ({ autoApprove: !s.autoApprove })),
  setVoiceEngine: (voiceEngine) => set({ voiceEngine }),
  setTtsReady: (ttsReady) => set({ ttsReady }),
}))
