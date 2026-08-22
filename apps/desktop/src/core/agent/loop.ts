import type { ToolRegistry } from '../tools/registry'
import type { RiskLevel } from '../tools/types'
import type { LLMProvider, Message } from '../llm/types'
import { SYSTEM_PROMPT } from './prompt'

export interface ApprovalRequest {
  id: string
  toolName: string
  /** Human-readable summary of exactly what will happen. */
  description: string
  risk: RiskLevel
}

export type ApprovalDecision = 'allow-once' | 'allow-session' | 'deny'

export interface AgentDeps {
  provider: LLMProvider
  registry: ToolRegistry
  /** Resolve with the user's decision. Only called for non-`safe` tools. */
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>
  /** Called whenever a message is appended to the transcript. */
  onMessage(message: Message): void
  /** Streamed assistant text. */
  onToken?(delta: string): void
}

/** Stops a confused model from burning the machine down in a loop. */
const MAX_STEPS = 12

export class Agent {
  #history: Message[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  /** Tools the user approved for the rest of the session. Never holds `never-auto` tools. */
  #sessionApprovals = new Set<string>()

  constructor(private readonly deps: AgentDeps) {}

  get history(): readonly Message[] {
    return this.#history
  }

  reset(): void {
    this.#history = [{ role: 'system', content: SYSTEM_PROMPT }]
    this.#sessionApprovals.clear()
  }

  #push(message: Message): void {
    this.#history.push(message)
    this.deps.onMessage(message)
  }

  /** Run one user turn to completion, including any tool round-trips. */
  async send(input: string, signal?: AbortSignal): Promise<string> {
    const { provider, registry, onToken } = this.deps
    this.#push({ role: 'user', content: input })

    for (let step = 0; step < MAX_STEPS; step++) {
      const { content, toolCalls } = await provider.chat({
        messages: this.#history,
        tools: registry.specs(),
        signal,
        onToken,
      })

      this.#push({ role: 'assistant', content, toolCalls })

      // No tool calls means the model is done talking.
      if (toolCalls.length === 0) return content

      for (const call of toolCalls) {
        const tool = registry.get(call.name)
        if (!tool) {
          this.#push({
            role: 'tool',
            toolName: call.name,
            toolCallId: call.id,
            content: `Error: unknown tool "${call.name}"`,
          })
          continue
        }

        const decision = await this.#gate(call.name, call.arguments, tool.risk)
        if (decision === 'deny') {
          this.#push({
            role: 'tool',
            toolName: call.name,
            toolCallId: call.id,
            content: 'Denied by the user. Do not retry this call.',
          })
          continue
        }

        const result = await registry.execute(call.name, call.arguments)
        this.#push({
          role: 'tool',
          toolName: call.name,
          toolCallId: call.id,
          content: result.ok
            ? JSON.stringify(result.value)
            : `Error: ${result.error}`,
        })
      }
    }

    const bail = `Stopped after ${MAX_STEPS} steps without finishing.`
    this.#push({ role: 'assistant', content: bail })
    return bail
  }

  /**
   * The permission gate. `safe` runs silently; `confirm` can be remembered for
   * the session; `never-auto` asks every single time, forever.
   */
  async #gate(
    toolName: string,
    args: unknown,
    risk: RiskLevel,
  ): Promise<ApprovalDecision> {
    if (risk === 'safe') return 'allow-once'
    if (risk === 'confirm' && this.#sessionApprovals.has(toolName)) return 'allow-once'

    const decision = await this.deps.requestApproval({
      id: `${toolName}-${this.#history.length}`,
      toolName,
      description: this.deps.registry.describeCall(toolName, args),
      risk,
    })

    // A `never-auto` tool can be allowed once, but never remembered.
    if (decision === 'allow-session' && risk === 'confirm') {
      this.#sessionApprovals.add(toolName)
    }
    return decision === 'allow-session' && risk === 'never-auto'
      ? 'allow-once'
      : decision
  }
}
