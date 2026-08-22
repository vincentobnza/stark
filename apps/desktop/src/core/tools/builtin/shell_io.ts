import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { defineTool } from '../types'

export const readClipboard = defineTool({
  name: 'read_clipboard',
  description: 'Read the current text contents of the system clipboard.',
  params: z.object({}),
  risk: 'safe',
  preview: () => 'Read the clipboard',
  execute: () => invoke('read_clipboard'),
})

export const writeClipboard = defineTool({
  name: 'write_clipboard',
  description: 'Replace the system clipboard with the given text.',
  params: z.object({ text: z.string() }),
  risk: 'safe',
  preview: ({ text }) => `Copy ${text.length} chars to the clipboard`,
  execute: (args) => invoke('write_clipboard', args),
})

export const openUrl = defineTool({
  name: 'open_url',
  description: 'Open a URL in the default browser.',
  params: z.object({ url: z.string().url() }),
  risk: 'confirm',
  preview: ({ url }) => `Open ${url}`,
  execute: (args) => invoke('open_url', args),
})
