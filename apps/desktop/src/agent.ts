import { Agent } from './core/agent/loop'
import { ClaudeProvider, OllamaProvider } from './core/llm'
import type { ChatRequest, ChatResponse, LLMProvider } from './core/llm'
import { createDefaultRegistry } from './core/tools/builtin'
import { useStark } from './state/store'

export type Brain = 'ollama' | 'claude'

const ollama = new OllamaProvider(useStark.getState().model)
const claude = new ClaudeProvider()

/**
 * Delegates to whichever brain is selected. The Agent holds one provider
 * reference for its lifetime, so swapping through this keeps the conversation
 * intact instead of resetting it on every change.
 */
class SwitchableProvider implements LLMProvider {
  inner: LLMProvider = ollama

  get id() {
    return this.inner.id
  }
  get label() {
    return this.inner.label
  }
  get model() {
    return this.inner.model
  }
  listModels(): Promise<string[]> {
    return this.inner.listModels()
  }
  chat(req: ChatRequest): Promise<ChatResponse> {
    return this.inner.chat(req)
  }
}

const provider = new SwitchableProvider()
const registry = createDefaultRegistry()

export const agent = new Agent({
  provider,
  registry,

  /**
   * In ask mode this hands the request to the UI and blocks the agent loop
   * until the user answers. There is deliberately no timeout: a timeout would
   * have to default to allow or deny, and both are the wrong answer.
   *
   * In auto mode it resolves immediately and nothing is gated.
   */
  requestApproval: (request) =>
    new Promise((resolve) => {
      const { setPending, setStatus, setCaption, autoApprove } = useStark.getState()

      // Resolve with `allow-once`, never `allow-session`: the tier system stays
      // intact underneath, so flipping back to ask mode takes effect on the
      // very next call rather than after a restart.
      if (autoApprove) {
        // Nothing is gated, so this line is the only record the user gets of
        // what was done on their behalf. Show the action, not the tool name.
        setCaption({ kind: 'tool', text: request.description })
        return resolve('allow-once')
      }

      setStatus('awaiting')
      setPending({
        request,
        decide: (decision) => {
          setPending(null)
          setStatus('thinking')
          resolve(decision)
        },
      })
    }),

  onMessage: (message) => {
    const { setCaption, commitStreaming } = useStark.getState()
    switch (message.role) {
      case 'user':
        setCaption({ kind: 'heard', text: message.content })
        break
      case 'assistant':
        commitStreaming()
        // A pure tool-call turn has no prose worth showing.
        if (message.content.trim()) setCaption({ kind: 'said', text: message.content })
        break
      case 'tool': {
        // A success keeps whatever the gate already showed (the action itself,
        // which reads better than the tool name). A failure must not be
        // swallowed — in a voice-only HUD nothing else would surface it.
        const failed =
          message.content.startsWith('Error:') || message.content.startsWith('Denied')
        setCaption({
          kind: 'tool',
          text: failed
            ? `${message.toolName ?? 'tool'}: ${message.content}`
            : (useStark.getState().caption?.text ?? (message.toolName ?? 'tool')),
        })
        break
      }
    }
  },

  onToken: (delta) => useStark.getState().pushDelta(delta),
})

/** Point the local provider at a different model, keeping history intact. */
export function selectModel(model: string): void {
  ollama.model = model
  useStark.getState().setModel(model)
}

/** Swap brains mid-conversation. The transcript carries over. */
export function selectBrain(brain: Brain): void {
  provider.inner = brain === 'claude' ? claude : ollama
  useStark.getState().setBrain(brain)
}

/**
 * Populate the model picker; also doubles as an Ollama reachability check.
 *
 * Retries because at login Ollama and Stark start at the same time (both have
 * Startup entries) and Ollama takes a few seconds to bind :11434. Checking once
 * left the HUD showing "unreachable" forever even though it came up right after.
 */
export async function refreshModels(attempts = 15, gapMs = 1000): Promise<void> {
  const { setModels, setError, model, brain } = useStark.getState()
  // Only the local brain has models to choose between.
  if (brain === 'claude') {
    setModels([claude.model])
    return
  }
  let last: string | null = null
  for (let i = 0; i < attempts; i++) {
    try {
      const models = await ollama.listModels()
      setModels(models)
      if (models.length === 0) {
        setError('No models installed. Run: ollama pull qwen2.5:3b')
      } else {
        // Fall back to something that actually exists.
        if (!models.includes(model)) selectModel(models[0])
        setError(null)
      }
      return
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
      // Only complain once it is clearly not just a slow start.
      if (i === 4) setError('Waiting for Ollama on :11434...')
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs))
    }
  }
  setModels([])
  // Include the real reason: "connection refused" and "not allowed by scope"
  // need completely different fixes, and a generic string hides which it is.
  setError(`Ollama: ${last ?? 'unreachable on :11434'}`)
}

export { registry }
