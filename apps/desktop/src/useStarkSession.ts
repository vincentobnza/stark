import { useCallback, useEffect, useRef, useState } from 'react'
import { agent, refreshModels, selectBrain } from './agent'
import { greeting } from './greeting'
import { useStark } from './state/store'
import { VoiceGate, speak, stopSpeaking, transcribe, waitForService } from './voice'
import { readRoutine, runRoutine } from './core/routine'
import { addressedToStark, tryIntent } from './core/intents'
import type { VoiceEngine } from './voice'

/** Aborting a turn is normal control flow, not an error worth showing. */
function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))
}

/**
 * Module scope, not a ref: StrictMode mounts effects twice in development and
 * the greeting must not be spoken twice.
 */
let greeted = false

/**
 * Wires the UI to the agent, hands-free: the mic stays open, speech starts a
 * turn, and the spoken reply mutes the gate so the assistant cannot hear itself.
 */
export function useStarkSession() {
  const [micOpen, setMicOpen] = useState(false)
  const [level, setLevel] = useState(0)
  const {
    status,
    setStatus,
    setError,
    setCaption,
    voiceReply,
    voiceEngine,
    setVoiceEngine,
    setTtsReady,
    setLlmReady,
    autoApprove,
  } = useStark()

  const gate = useRef<VoiceGate | null>(null)
  const inFlight = useRef(false)
  const abort = useRef<AbortController | null>(null)
  /** Bumped whenever a turn is superseded, so a stale turn cannot reset the UI. */
  const turn = useRef(0)
  /** Until this timestamp, utterances count as addressed without the wake word. */
  const followUpUntil = useRef(0)

  // Latest values, readable from the gate callbacks without re-creating the gate.
  const settings = useRef({ voiceReply, voiceEngine, autoApprove })
  settings.current = { voiceReply, voiceEngine, autoApprove }

  const interrupt = useCallback(() => {
    stopSpeaking()
    abort.current?.abort()
    abort.current = null
    turn.current++
    inFlight.current = false
    gate.current?.setMuted(false)
    setStatus('idle')
  }, [setStatus])

  const run = useCallback(
    async (input: string) => {
      // One turn at a time: the agent's history is shared mutable state.
      if (inFlight.current) return
      inFlight.current = true

      const myTurn = ++turn.current
      const controller = new AbortController()
      abort.current = controller

      setStatus('thinking')
      setError(null)
      try {
        const reply = await agent.send(input, controller.signal)
        if (turn.current !== myTurn) return

        if (settings.current.voiceReply && reply.trim()) {
          setStatus('speaking')
          // Deaf while talking: echo cancellation is not enough to stop the
          // assistant from transcribing its own voice and replying to it.
          gate.current?.setMuted(true)
          await speak(reply, {
            engine: settings.current.voiceEngine,
            onFallback: (reason) => setError(`Cloud voice failed, using OS voice - ${reason}`),
          }).catch(() => {})
        }
      } catch (err) {
        if (!isAbort(err)) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (abort.current === controller) abort.current = null
        if (turn.current === myTurn) {
          inFlight.current = false
          setStatus('idle')
          // Short cooldown so the speaker tail is not heard as a new utterance.
          setTimeout(() => gate.current?.setMuted(false), 350)
        }
      }
    },
    [setStatus, setError],
  )

  const handleUtterance = useCallback(
    async (audio: Blob) => {
      setStatus('transcribing')
      try {
        const text = await transcribe(audio)
        // Whisper returns nothing for a cough or a door. Not an error.
        if (!text) return setStatus('idle')

        const { addressed, command } = addressedToStark(text, followUpUntil.current)
        if (!addressed) {
          // Overheard, not asked. Show it so it is obvious why nothing happened.
          setCaption({ kind: 'heard', text: `(ignored) ${text}` })
          return setStatus('idle')
        }
        // A real exchange has started; allow follow-ups without the name.
        followUpUntil.current = Date.now() + 25_000
        setCaption({ kind: 'heard', text: command })

        // Deterministic first: the common commands never reach the model, so
        // they are instant and cannot be got wrong.
        const direct = await tryIntent(command)
        if (direct) {
          setCaption({ kind: 'said', text: direct })
          if (settings.current.voiceReply) {
            setStatus('speaking')
            gate.current?.setMuted(true)
            await speak(direct, { engine: settings.current.voiceEngine }).catch(() => {})
            setTimeout(() => gate.current?.setMuted(false), 350)
          }
          followUpUntil.current = Date.now() + 25_000
          return setStatus('idle')
        }

        await run(command)
        followUpUntil.current = Date.now() + 25_000
      } catch (err) {
        if (!isAbort(err)) setError(err instanceof Error ? err.message : String(err))
        setStatus('idle')
      }
    },
    [run, setStatus, setError, setCaption],
  )

  const utteranceRef = useRef(handleUtterance)
  utteranceRef.current = handleUtterance

  // Ollama comes and goes: it has its own Startup entry (so it races Stark at
  // login), and it can be stopped or restarted at any time. A one-shot check at
  // startup leaves "unreachable" on screen forever once it recovers, so keep
  // re-checking while it is down and clear the notice when it returns.
  const { brain, models } = useStark()
  useEffect(() => {
    if (brain !== 'ollama' || models.length > 0) return
    const timer = setInterval(() => {
      // One attempt per tick; the interval is the retry.
      void refreshModels(1, 0)
    }, 8000)
    return () => clearInterval(timer)
  }, [brain, models.length])

  // One gate for the lifetime of the app.
  useEffect(() => {
    let cancelled = false
    const instance = new VoiceGate({
      onSpeechStart: () => {
        if (!inFlight.current) setStatus('listening')
      },
      onSpeechEnd: (audio) => void utteranceRef.current(audio),
      // Quantised: the gate emits every frame, and re-rendering the tree 60
      // times a second for sub-perceptual changes is wasted work.
      onLevel: (next) => setLevel((prev) => (Math.abs(prev - next) > 0.02 ? next : prev)),
      onError: (message) => setError(message),
    })
    gate.current = instance

    void waitForService(20, 1000, (attempt) => {
      // Only speak up once it is clearly late, not on the first miss.
      if (attempt === 3) setError('Waiting for the speech service on :8756...')
    }).then(async (health) => {
      if (cancelled) return
      if (health) setError(null)
      setTtsReady(health?.tts_ready ?? false)
      setLlmReady(health?.llm_ready ?? false)
      if (health && !health.tts_ready) setVoiceEngine('system')
      // Claude is the better brain by a wide margin, so prefer it whenever the
      // service actually has credentials for it.
      if (health?.llm_ready) selectBrain('claude')
      // After the brain is picked: the picker's contents depend on it.
      void refreshModels()
      if (!health) {
        setError('Speech service unreachable on :8756')
        return
      }
      try {
        await instance.start()
        if (cancelled) return
        setMicOpen(true)
      } catch (err) {
        // Report the real reason: "blocked" and "no input device" need
        // different fixes, and a generic string hides which one happened.
        const why = err instanceof Error ? err.message : String(err)
        setError(`Mic unavailable - ${why}`)
        return
      }

      // Boot once per launch. Read the engine from health rather than from
      // state, which may not have applied the downgrade to `system` yet.
      if (greeted) return
      greeted = true
      const hello = greeting()
      const engine: VoiceEngine = health.tts_ready ? settings.current.voiceEngine : 'system'

      // Speaks a line and shows it, muting the gate so Stark does not hear
      // itself. Honours the voice toggle by still showing the caption.
      // Deliberately does not unmute: the caller owns the mute window.
      const say = async (text: string) => {
        setCaption({ kind: 'said', text })
        if (!settings.current.voiceReply) return
        setStatus('speaking')
        await speak(text, {
          engine,
          onFallback: (reason) => setError(`Cloud voice failed, using OS voice - ${reason}`),
        }).catch(() => {})
        setStatus('idle')
      }

      const routine = await readRoutine().catch(() => null)
      if (cancelled) return

      // Deaf for the whole boot sequence. Between steps the mic would otherwise
      // pick up Stark's own narration, the apps it just launched, and the music
      // it just started — every one of which became a spurious command.
      instance.setMuted(true)
      try {
        if (!routine?.enabled) {
          await say(hello)
        } else {
          // Progress is spoken, not drawn, so the callback is a no-op here.
          await runRoutine(routine, { greeting: hello, say, onProgress: () => {} })
        }
      } finally {
        // Let the last words and the app-launch noise die down first.
        setTimeout(() => instance.setMuted(false), 1200)
      }
    })

    return () => {
      cancelled = true
      instance.stop()
      gate.current = null
    }
  }, [setStatus, setError, setCaption, setTtsReady, setLlmReady, setVoiceEngine])

  /** Something is happening that the user can cut off. */
  const interruptible = status === 'thinking' || status === 'speaking'

  return { interrupt, interruptible, micOpen, level }
}
