import type { ChatRequest, ChatResponse, LLMProvider, ToolCall } from './types'

/**
 * Kimi K3, reached through the local Python service.
 *
 * Same reasoning as the Claude provider: the NVIDIA key stays in the service,
 * because anything bundled into the Tauri app ships readable.
 */
const AI_SERVICE = 'http://127.0.0.1:8756'

interface ChatReply {
  content: string
  tool_calls: { id: string; name: string; arguments: unknown }[]
  usage?: { input: number; output: number; reasoning: number }
}

export class KimiProvider implements LLMProvider {
  readonly id = 'kimi'
  readonly label = 'Kimi K3 (NVIDIA)'
  model: string

  constructor(model = 'moonshotai/kimi-k3') {
    this.model = model
  }

  async listModels(): Promise<string[]> {
    return [this.model]
  }

  async chat({ messages, tools, signal, onToken }: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${AI_SERVICE}/kimi/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ messages, tools: tools ?? [] }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Kimi ${res.status}: ${detail.slice(0, 200)}`)
    }

    const body = (await res.json()) as ChatReply
    // Not streamed: the service drops the model's chain of thought and returns
    // only the answer, so there is nothing to stream until the turn is done.
    if (body.content) onToken?.(body.content)

    const toolCalls: ToolCall[] = (body.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      arguments: c.arguments,
    }))

    return { content: body.content ?? '', toolCalls }
  }
}
