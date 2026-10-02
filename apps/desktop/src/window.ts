import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Window controls that cannot take the UI down with them.
 *
 * `getCurrentWindow()` reads `__TAURI_INTERNALS__.metadata`, which does not
 * exist in a plain browser — it throws "Cannot read properties of undefined".
 * The window chrome is not worth crashing the app over, and guarding it also
 * makes the UI renderable in a browser for layout work.
 */
function win() {
  try {
    return getCurrentWindow()
  } catch {
    return null
  }
}

export const minimize = () => void win()?.minimize()
export const toggleMaximize = () => void win()?.toggleMaximize()
export const hide = () => void win()?.hide()

export async function isMaximized(): Promise<boolean> {
  try {
    return (await win()?.isMaximized()) ?? false
  } catch {
    return false
  }
}

/** Subscribe to resize. Returns a no-op unsubscribe when unavailable. */
export function onResized(fn: () => void): () => void {
  const w = win()
  if (!w) return () => {}
  let off: (() => void) | null = null
  let cancelled = false
  void w
    .onResized(() => fn())
    .then((unlisten) => {
      if (cancelled) unlisten()
      else off = unlisten
    })
    .catch(() => {})
  return () => {
    cancelled = true
    off?.()
  }
}
