import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { defineTool } from '../types'
import { APP_NAMES, resolveApp } from '../../apps'

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
  description: `Launch one of the installed desktop applications. Valid names: ${APP_NAMES}. Do not invent an application that is not on this list.`,
  params: z.object({
    name: z.string().min(1).describe(`One of: ${APP_NAMES}`),
    args: z.array(z.string()).default([]).describe('Optional command-line arguments'),
  }),
  risk: 'confirm',
  preview: ({ name }) => `Launch ${resolveApp(name)?.label ?? name}`,
  execute: async ({ name, args }) => {
    // Resolve through the registry rather than trusting the model. A small
    // model invents apps ("zoom", "may"); launching those silently no-ops and
    // it then reports success. An explicit failure is far more useful.
    const app = resolveApp(name)
    if (!app) {
      throw new Error(`Unknown application "${name}". Installed apps: ${APP_NAMES}`)
    }
    return invoke('open_app', { name: app.command, args })
  },
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
