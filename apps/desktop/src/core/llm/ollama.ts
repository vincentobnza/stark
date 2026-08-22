import { fetch } from '@tauri-apps/plugin-http'
import type { ChatRequest, ChatResponse, LLMProvider, Message, ToolCall } from './types'

const DEFAULT_HOST = 'http://127.0.0.1:11434'

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> }
}

interface OllamaChunk {
  message?: {
    role: string
    content?: string
    /** Hybrid reasoning models stream their scratchpad here. Never spoken. */
    thinking?: string
    tool_calls?: OllamaToolCall[]
  }
  done?: boolean
  error?: string
}

/**
 * Some builds inline reasoning as `<think>…</think>` in `content` instead of
 * using the separate field. Strip closed blocks, and hide an unterminated one
 * until it closes.
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

  constructor(
    model = 'qwen2.5:3b',
    private readonly host: string = DEFAULT_HOST,
  ) {
    this.model = model
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.host}/api/tags`)
    if (!res.ok) throw new Error(`Ollama not reachable (${res.status})`)
    const body = (await res.json()) as { models?: { name: string }[] }
    return (body.models ?? []).map((m) => m.name)
  }

  async chat({ messages, tools, signal, onToken }: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(toWire),
        tools: tools?.length ? tools : undefined,
        stream: true,
        // Keep the model resident so turn two does not pay the load cost again.
        keep_alive: '30m',
        options: {
          // Ollama defaults to 4096 regardless of what the model supports.
          // The system prompt plus ten tool schemas is ~660 tokens before the
          // user says anything; add history and tool results (file contents,
          // system info JSON) and 4096 overflows within a couple of turns.
          // Overflow is silent — the model loses its instructions and starts
          // answering incoherently, which reads as "the AI got worse".
          num_ctx: 8192,
          // A spoken reply has no business being long, and every token is
          // ~50ms of silence. This is the single biggest latency lever.
          num_predict: 220,
          temperature: 0.6,
          top_p: 0.9,
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`Ollama chat failed (${res.status}): ${await res.text()}`)
    }
    if (!res.body) throw new Error('Ollama returned an empty response body')

    let raw = ''
    let emitted = 0
    const toolCalls: ToolCall[] = []
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // NDJSON: one JSON object per line, and a chunk may split mid-line.
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        const chunk = JSON.parse(line) as OllamaChunk
        if (chunk.error) throw new Error(chunk.error)

        const delta = chunk.message?.content
        if (delta) {
          raw += delta
          // Emit only the newly visible text, so reasoning never reaches the UI.
          const visible = stripReasoning(raw)
          if (visible.length > emitted) {
            onToken?.(visible.slice(emitted))
          }
          emitted = visible.length
        }
        for (const call of chunk.message?.tool_calls ?? []) {
          toolCalls.push({
            id: `call_${toolCalls.length}_${call.function.name}`,
            name: call.function.name,
            arguments: call.function.arguments,
          })
        }
      }
    }

    return { content: stripReasoning(raw).trim(), toolCalls }
  }
}
