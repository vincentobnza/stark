import { Agent } from './core/agent/loop'
import { OllamaProvider } from './core/llm'
import { createDefaultRegistry } from './core/tools/builtin'
import { useStark } from './state/store'

const provider = new OllamaProvider(useStark.getState().model)
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

/** Point the live provider at a different local model, keeping history intact. */
export function selectModel(model: string): void {
  provider.model = model
  useStark.getState().setModel(model)
}

/** Populate the model picker; also doubles as an Ollama reachability check. */
export async function refreshModels(): Promise<void> {
  const { setModels, setError, model } = useStark.getState()
  try {
    const models = await provider.listModels()
    setModels(models)
    if (models.length === 0) {
      setError('No models installed. Run: ollama pull qwen2.5:3b')
    } else if (!models.includes(model)) {
      // Fall back to something that actually exists.
      selectModel(models[0])
      setError(null)
    } else {
      setError(null)
    }
  } catch {
    setModels([])
    setError('Ollama unreachable on :11434')
  }
}

export { registry }
