import type { ToolSpec } from '../tools/types'

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  /** Ollama does not return call ids, so we mint our own. */
  id: string
  name: string
  arguments: unknown
}

export interface Message {
  role: Role
  content: string
  /** Present on assistant turns that want to call tools. */
  toolCalls?: ToolCall[]
  /** Present on `tool` turns: which tool produced this content. */
  toolName?: string
  /**
   * Present on `tool` turns: the id of the call this answers. Anthropic pairs
   * results to calls by `tool_use_id` and rejects a mismatch; Ollama ignores it.
   */
  toolCallId?: string
}

export interface ChatRequest {
  messages: Message[]
  tools?: ToolSpec[]
  signal?: AbortSignal
  /** Called with each streamed content delta. */
  onToken?(delta: string): void
}

export interface ChatResponse {
  content: string
  toolCalls: ToolCall[]
}

export interface LLMProvider {
  readonly id: string
  readonly label: string
  /** Model currently selected on this provider instance. */
  readonly model: string
  listModels(): Promise<string[]>
  chat(req: ChatRequest): Promise<ChatResponse>
}
