import type { ChatRequest, ChatResponse, LLMProvider, Message, ToolCall } from './types'

/**
 * The local model, reached through the Python service rather than Ollama
 * directly.
 *
 * Talking to `:11434` from the webview needs either Ollama's CORS allowlist to
 * include the app's origin (it does not — a packaged Tauri app is
 * `http://tauri.localhost`) or Tauri's HTTP plugin, which worked in dev and
 * failed in the packaged build. The service already allows any origin and is a
 * hard dependency anyway, so one plain fetch works identically in both.
 */
const AI_SERVICE = 'http://127.0.0.1:8756'

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> }
}

interface OllamaReply {
  message?: {
    role: string
    content?: string
    /** Hybrid reasoning models put their scratchpad here. Never spoken. */
    thinking?: string
    tool_calls?: OllamaToolCall[]
  }
  error?: string
}

/**
 * Some builds inline reasoning as `<think>…</think>` in `content` instead of
 * using the separate field. Strip closed blocks, and hide an unterminated one.
 */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '')
}

/** Shape Ollama expects on the wire. */
function toWire(m: Message) {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content, tool_name: m.toolName }
  }
  if (m.toolCalls?.length) {
    return {
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls.map((c) => ({
        function: { name: c.name, arguments: c.arguments },
      })),
    }
  }
  return { role: m.role, content: m.content }
}

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama'
  readonly label = 'Ollama (local)'
  /** Mutable so switching models does not throw away the conversation. */
  model: string

  constructor(model = 'qwen2.5:3b') {
    this.model = model
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${AI_SERVICE}/ollama/tags`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`${res.status}: ${detail.slice(0, 140)}`)
    }
    const body = (await res.json()) as { models?: { name: string }[] }
    return (body.models ?? []).map((m) => m.name)
  }

  async chat({ messages, tools, signal, onToken }: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${AI_SERVICE}/ollama/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(toWire),
        tools: tools?.length ? tools : undefined,
        keep_alive: '30m',
        options: {
          // Ollama defaults to 4096 regardless of what the model supports. The
          // system prompt plus tool schemas is ~660 tokens before the user says
          // anything; overflow is silent and the model loses its instructions.
          num_ctx: 8192,
          // A spoken reply has no business being long, and every token is
          // ~50ms of silence.
          num_predict: 220,
          temperature: 0.6,
          top_p: 0.9,
        },
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Ollama ${res.status}: ${detail.slice(0, 200)}`)
    }

    const body = (await res.json()) as OllamaReply
    if (body.error) throw new Error(body.error)

    const content = stripReasoning(body.message?.content ?? '').trim()
    // Not streamed: a one-sentence spoken reply does not benefit enough to
    // justify a streaming transport through the proxy.
    if (content) onToken?.(content)

    const toolCalls: ToolCall[] = (body.message?.tool_calls ?? []).map((call, i) => ({
      id: `call_${i}_${call.function.name}`,
      name: call.function.name,
      arguments: call.function.arguments,
    }))

    return { content, toolCalls }
  }
}
