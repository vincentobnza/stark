import type { z } from 'zod'

/**
 * How much damage a tool can do if the model calls it wrongly.
 *
 * - `safe`       runs immediately, no user involvement
 * - `confirm`    needs approval, but the user may approve it for the session
 * - `never-auto` needs approval every single time; cannot be pre-approved
 *
 * This is the whole safety story. A tool that mutates the machine or reaches
 * the network must not be `safe`, no matter how convenient that would be.
 */
export type RiskLevel = 'safe' | 'confirm' | 'never-auto'

export type ToolResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string
  description: string
  /** One schema serves two masters: JSON Schema for the LLM, runtime validation for us. */
  params: S
  risk: RiskLevel
  /** One-line summary of what this call will do, shown in the approval prompt. */
  preview?(args: z.infer<S>): string
  // Method shorthand (not an arrow property) so specific tools stay assignable to AnyTool.
  execute(args: z.infer<S>): Promise<unknown>
}

export type AnyTool = Tool<z.ZodType>

/** Identity function that pins `S` so `args` is fully typed inside `execute`. */
export function defineTool<S extends z.ZodType>(tool: Tool<S>): Tool<S> {
  return tool
}

/** The shape Ollama and the OpenAI-compatible APIs both expect. */
export interface ToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}
