import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { defineTool } from '../types'

export const listDir = defineTool({
  name: 'list_dir',
  description: 'List the entries of a directory. Returns names, whether each is a directory, and byte sizes.',
  params: z.object({
    path: z.string().min(1).describe('Absolute path to the directory'),
  }),
  risk: 'safe',
  preview: ({ path }) => `List ${path}`,
  execute: (args) => invoke('list_dir', args),
})

export const readFile = defineTool({
  name: 'read_file',
  description: 'Read a UTF-8 text file. Large files are truncated.',
  params: z.object({
    path: z.string().min(1).describe('Absolute path to the file'),
    max_bytes: z.number().int().positive().max(1_000_000).default(100_000),
  }),
  risk: 'safe',
  preview: ({ path }) => `Read ${path}`,
  execute: (args) => invoke('read_file', args),
})

export const writeFile = defineTool({
  name: 'write_file',
  description: 'Write UTF-8 text to a file, creating or overwriting it.',
  params: z.object({
    path: z.string().min(1).describe('Absolute path to the file'),
    contents: z.string(),
  }),
  // Overwrites data. Always gated.
  risk: 'confirm',
  preview: ({ path, contents }) =>
    `Write ${contents.length} chars to ${path}`,
  execute: (args) => invoke('write_file', args),
})
