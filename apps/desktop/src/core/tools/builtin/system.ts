import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { defineTool } from '../types'

export const getSystemInfo = defineTool({
  name: 'get_system_info',
  description:
    'Read the host machine state: OS, CPU count, total/used memory, hostname, and current time.',
  params: z.object({}),
  risk: 'safe',
  preview: () => 'Read system information',
  execute: () => invoke('get_system_info'),
})

export const openApp = defineTool({
  name: 'open_app',
  description:
    'Launch a desktop application by name or executable, e.g. "code", "chrome", "notepad", "spotify".',
  params: z.object({
    name: z.string().min(1).describe('Application name or executable, without a path'),
    args: z.array(z.string()).default([]).describe('Optional command-line arguments'),
  }),
  risk: 'confirm',
  preview: ({ name, args }) =>
    `Launch ${name}${args.length ? ` with ${args.join(' ')}` : ''}`,
  execute: (args) => invoke('open_app', args),
})

export const sendNotification = defineTool({
  name: 'send_notification',
  description: 'Show a native desktop notification.',
  params: z.object({
    title: z.string().min(1),
    body: z.string().default(''),
  }),
  risk: 'safe',
  preview: ({ title }) => `Notify: ${title}`,
  execute: (args) => invoke('send_notification', args),
})

export const runCommand = defineTool({
  name: 'run_command',
  description:
    'Run an arbitrary shell command and return its stdout, stderr and exit code. ' +
    'Use only when no dedicated tool exists for the task.',
  params: z.object({
    command: z.string().min(1).describe('The full command line to execute'),
    cwd: z.string().optional().describe('Working directory; defaults to the user home'),
  }),
  // Never pre-approvable. This is the one tool that can do anything.
  risk: 'never-auto',
  preview: ({ command, cwd }) => `Run: ${command}${cwd ? `  (in ${cwd})` : ''}`,
  execute: (args) => invoke('run_command', args),
})
