import { z } from 'zod'
import type { AnyTool, ToolResult, ToolSpec } from './types'

export class ToolRegistry {
  #tools = new Map<string, AnyTool>()

  register(...tools: AnyTool[]): this {
    for (const tool of tools) {
      if (this.#tools.has(tool.name)) {
        throw new Error(`Duplicate tool registered: ${tool.name}`)
      }
      this.#tools.set(tool.name, tool)
    }
    return this
  }

  get(name: string): AnyTool | undefined {
    return this.#tools.get(name)
  }

  list(): AnyTool[] {
    return [...this.#tools.values()]
  }

  /** Function definitions handed to the model. */
  specs(): ToolSpec[] {
    return this.list().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.params, {
          target: 'draft-7',
          io: 'input',
        }) as Record<string, unknown>,
      },
    }))
  }

  /**
   * Validate then run. Never throws: a failed call is fed back to the model as
   * an error string so it can correct itself rather than killing the turn.
   */
  async execute(name: string, rawArgs: unknown): Promise<ToolResult> {
    const tool = this.#tools.get(name)
    if (!tool) return { ok: false, error: `Unknown tool: ${name}` }

    const parsed = tool.params.safeParse(rawArgs ?? {})
    if (!parsed.success) {
      return { ok: false, error: `Invalid arguments: ${z.prettifyError(parsed.error)}` }
    }

    try {
      return { ok: true, value: await tool.execute(parsed.data) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Human-readable line for the approval prompt. */
  describeCall(name: string, rawArgs: unknown): string {
    const tool = this.#tools.get(name)
    if (!tool) return `${name}(?)`
    const parsed = tool.params.safeParse(rawArgs ?? {})
    if (parsed.success && tool.preview) return tool.preview(parsed.data)
    return `${name}(${JSON.stringify(rawArgs ?? {})})`
  }
}
