import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Tauri expects a fixed port and must fail rather than silently move.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Bind IPv4 explicitly: `localhost` resolves to ::1 on some Windows boxes,
    // and Tauri's readiness probe then never sees the server.
    host: host || '127.0.0.1',
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
}))
