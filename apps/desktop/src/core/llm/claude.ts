import type { ChatRequest, ChatResponse, LLMProvider, ToolCall } from './types'

/**
 * Claude, reached through the local Python service.
 *
 * The API call deliberately does not happen here: a key bundled into the Tauri
 * app ships readable. The service owns the credential and this is a thin client
 * for it, so the desktop app never sees one.
 */
const AI_SERVICE = 'http://127.0.0.1:8756'

interface ChatReply {
  content: string
  tool_calls: { id: string; name: string; arguments: unknown }[]
  usage?: { input: number; output: number; cache_read: number }
}

export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude'
  readonly label = 'Claude (cloud)'
  model: string

  constructor(model = 'claude-opus-5') {
    this.model = model
  }

  async listModels(): Promise<string[]> {
    // The service pins the model; the picker has nothing to offer here.
    return [this.model]
  }

  async chat({ messages, tools, signal, onToken }: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${AI_SERVICE}/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ messages, tools: tools ?? [] }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Claude ${res.status}: ${detail.slice(0, 200)}`)
    }

    const body = (await res.json()) as ChatReply
    // Not streamed: the turn is one spoken sentence, so a single emit keeps the
    // caption behaviour identical without a streaming transport to maintain.
    if (body.content) onToken?.(body.content)

    const toolCalls: ToolCall[] = (body.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      arguments: c.arguments,
    }))

    return { content: body.content ?? '', toolCalls }
  }
}
