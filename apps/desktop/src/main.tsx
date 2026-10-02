import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStark } from './state/store'
import './index.css'

// Dev only: lets the layout be driven from outside (seeding a transcript to
// check the chat view without waiting on a real model turn). Stripped from
// production builds by the `import.meta.env.DEV` guard.
if (import.meta.env.DEV) {
  ;(window as unknown as { __stark: unknown }).__stark = useStark.getState()
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
