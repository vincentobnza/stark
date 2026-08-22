import { ToolRegistry } from '../registry'
import { getSystemInfo, openApp, runCommand, sendNotification } from './system'
import { listDir, readFile, writeFile } from './files'
import { openUrl, readClipboard, writeClipboard } from './shell_io'

/** The V1 tool set. Adding a capability means adding a tool here. */
export function createDefaultRegistry(): ToolRegistry {
  return new ToolRegistry().register(
    getSystemInfo,
    sendNotification,
    listDir,
    readFile,
    readClipboard,
    writeClipboard,
    openApp,
    openUrl,
    writeFile,
    runCommand,
  )
}
