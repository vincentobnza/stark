import { useStark } from '../state/store'
import { selectModel } from '../agent'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Settings, not conversation. Hidden until the pointer is over the window so
 * the resting state is only the orb.
 */
export function Controls() {
  const {
    model,
    models,
    voiceReply,
    toggleVoiceReply,
    autoApprove,
    toggleAutoApprove,
    voiceEngine,
    setVoiceEngine,
    ttsReady,
  } = useStark()

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-1.5 p-2.5 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
      <span data-tauri-drag-region className="flex-1 cursor-grab px-1 text-[10px] tracking-[0.35em] text-white/25">
        STARK
      </span>

      <select
        value={model}
        onChange={(e) => selectModel(e.target.value)}
        title="Local model"
        className="max-w-32 truncate border border-white/10 bg-white/6 px-1.5 py-1 text-[10px] text-white/45 outline-none hover:text-white/80"
      >
        {(models.length ? models : [model]).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <button
        onClick={toggleVoiceReply}
        title={voiceReply ? 'Spoken replies on' : 'Spoken replies off'}
        className={`px-1.5 py-1 text-[10px] hover:bg-white/8 ${
          voiceReply ? 'text-teal-300/80' : 'text-white/30'
        }`}
      >
        {voiceReply ? 'voice' : 'muted'}
      </button>

      <button
        onClick={() => setVoiceEngine(voiceEngine === 'elevenlabs' ? 'system' : 'elevenlabs')}
        disabled={!ttsReady}
        title={
          ttsReady
            ? voiceEngine === 'elevenlabs'
              ? 'ElevenLabs voice'
              : 'Windows OS voice'
            : 'Set ELEVENLABS_API_KEY in services/ai/.env to enable'
        }
        className={`px-1.5 py-1 text-[10px] hover:bg-white/8 disabled:opacity-40 disabled:hover:bg-transparent ${
          voiceEngine === 'elevenlabs' ? 'text-violet-300/90' : 'text-white/30'
        }`}
      >
        {voiceEngine === 'elevenlabs' ? '11labs' : 'os'}
      </button>

      <button
        onClick={toggleAutoApprove}
        title={
          autoApprove
            ? 'Auto-approve ON — every tool runs unattended, run_command included'
            : 'Ask before every non-safe tool'
        }
        className={`px-1.5 py-1 text-[10px] hover:bg-white/8 ${
          autoApprove ? 'text-amber-300/90' : 'text-white/30'
        }`}
      >
        {autoApprove ? 'auto' : 'ask'}
      </button>

      <button
        onClick={() => getCurrentWindow().hide()}
        title="Hide — Ctrl+Alt+Space to summon"
        className="px-1.5 py-1 text-[10px] text-white/30 hover:bg-white/8 hover:text-red-300"
      >
        ✕
      </button>
    </div>
  )
}
