/**
 * Voice I/O. Both directions go through the local Python service: speech-to-text
 * on Whisper, and optionally speech-to-audio on ElevenLabs. The OS voices remain
 * the zero-dependency fallback and always work offline.
 */
const AI_SERVICE = 'http://127.0.0.1:8756'

/** Which engine produces the spoken reply. */
export type VoiceEngine = 'system' | 'elevenlabs'

export interface ServiceHealth {
  ok: boolean
  model_loaded: boolean
  /** True when ELEVENLABS_API_KEY is set on the service. */
  tts_ready: boolean
  tts_voice: string | null
  /** True when the service has Anthropic credentials. */
  llm_ready: boolean
  llm_model: string | null
  llm_fast: boolean
}

export async function serviceHealth(): Promise<ServiceHealth | null> {
  try {
    const res = await fetch(`${AI_SERVICE}/health`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    return (await res.json()) as ServiceHealth
  } catch {
    return null
  }
}

export interface GateEvents {
  /** Speech detected; capture has begun. */
  onSpeechStart(): void
  /** Speech ended. `audio` is the utterance, ready for transcription. */
  onSpeechEnd(audio: Blob): void
  /** Smoothed level, 0-1, emitted continuously for the UI. */
  onLevel(level: number): void
  onError(message: string): void
}

/** Confirmations before a rise counts as speech. ~3 frames at 60fps ≈ 50ms. */
const ONSET_FRAMES = 3
/** Silence needed to call an utterance finished. */
const HANGOVER_MS = 700
/** Shorter than this is a cough, a door, a keyboard. Discard it. */
const MIN_UTTERANCE_MS = 320
/** Hard stop, so a noisy room cannot record forever. */
const MAX_UTTERANCE_MS = 15_000
/** Absolute floor, so a silent room never trips the gate. */
const MIN_THRESHOLD = 0.055
/** Speech must exceed the measured room noise by this factor. */
const NOISE_MARGIN = 2.6

/**
 * Always-on microphone with voice-activity detection. Holds one stream open and
 * spins up a MediaRecorder per utterance.
 *
 * Opus chunks are not independently decodable — only the first carries the
 * container header — so a rolling buffer cannot be sliced. Hence a fresh
 * recorder per utterance, and the ~50ms onset detection budget to keep the
 * clipped head short enough that Whisper does not care.
 */
export class VoiceGate {
  #stream: MediaStream | null = null
  #ctx: AudioContext | null = null
  #analyser: AnalyserNode | null = null
  #samples: Float32Array<ArrayBuffer> | null = null
  #frame = 0

  #recorder: MediaRecorder | null = null
  #chunks: Blob[] = []
  #startedAt = 0

  #loud = 0
  #quietSince = 0
  /** Rolling estimate of the room, so the gate adapts instead of being tuned. */
  #noiseFloor = MIN_THRESHOLD / NOISE_MARGIN
  #muted = false
  #warnedSuspended = false
  #unlock: (() => void) | null = null

  constructor(private readonly events: GateEvents) {}

  get capturing(): boolean {
    return this.#recorder?.state === 'recording'
  }

  async start(): Promise<void> {
    if (this.#stream) return
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })

    // Analysed but never connected to the destination: routing the mic to the
    // speakers would feed the assistant its own voice.
    this.#ctx = new AudioContext()
    // Chromium starts an AudioContext suspended until the page has user
    // activation. There is no button to press any more, so resume explicitly —
    // a suspended analyser reports pure silence and the gate would never open.
    if (this.#ctx.state === 'suspended') {
      try {
        await this.#ctx.resume()
      } catch {
        /* reported by the watchdog in #tick */
      }
    }
    this.#analyser = this.#ctx.createAnalyser()
    this.#analyser.fftSize = 512
    this.#analyser.smoothingTimeConstant = 0.5
    this.#ctx.createMediaStreamSource(this.#stream).connect(this.#analyser)
    this.#samples = new Float32Array(this.#analyser.fftSize)

    // Backstop for the autoplay policy: any interaction counts as activation,
    // so one click on the window recovers a context that refused to resume.
    this.#unlock = () => {
      void this.#ctx?.resume().then(() => {
        this.#warnedSuspended = false
      })
    }
    window.addEventListener('pointerdown', this.#unlock)
    window.addEventListener('keydown', this.#unlock)

    this.#tick()
  }

  /**
   * Stop reacting to sound without dropping the stream. Used while the
   * assistant talks: even with echo cancellation, speaker output leaks back in
   * and would trigger an endless self-conversation.
   */
  setMuted(muted: boolean): void {
    if (this.#muted === muted) return
    this.#muted = muted
    if (muted && this.capturing) this.#abortCapture()
    if (!muted) {
      // Re-arm from scratch so the tail of our own speech is not an onset.
      this.#loud = 0
      this.#quietSince = 0
    }
  }

  stop(): void {
    cancelAnimationFrame(this.#frame)
    this.#abortCapture()
    if (this.#unlock) {
      window.removeEventListener('pointerdown', this.#unlock)
      window.removeEventListener('keydown', this.#unlock)
      this.#unlock = null
    }
    this.#stream?.getTracks().forEach((t) => t.stop())
    void this.#ctx?.close()
    this.#stream = null
    this.#ctx = null
    this.#analyser = null
    this.#samples = null
  }

  #rms(): number {
    if (!this.#analyser || !this.#samples) return 0
    this.#analyser.getFloatTimeDomainData(this.#samples)
    let sum = 0
    for (const s of this.#samples) sum += s * s
    return Math.sqrt(sum / this.#samples.length)
  }

  #tick = (): void => {
    this.#frame = requestAnimationFrame(this.#tick)

    // A context that never leaves `suspended` reads as permanent silence, which
    // is indistinguishable from a quiet room. Say so rather than sit there deaf.
    if (this.#ctx && this.#ctx.state !== 'running' && !this.#warnedSuspended) {
      this.#warnedSuspended = true
      this.events.onError('Audio engine suspended - click the window once to enable the mic')
    }

    const rms = this.#rms()
    // Curve lifts speech-level RMS into a range that reads on screen.
    this.events.onLevel(this.#muted ? 0 : Math.min(1, Math.pow(rms * 7, 0.7)))
    if (this.#muted) return

    const threshold = Math.max(MIN_THRESHOLD, this.#noiseFloor * NOISE_MARGIN)
    const speaking = rms > threshold
    const now = performance.now()

    if (!speaking) {
      // Only learn the room while it is quiet, or speech would raise the floor
      // until the gate stops opening at all.
      this.#noiseFloor = this.#noiseFloor * 0.97 + rms * 0.03
      this.#loud = 0
    } else {
      this.#loud++
    }

    if (!this.capturing) {
      if (this.#loud >= ONSET_FRAMES) void this.#beginCapture()
      return
    }

    if (speaking) {
      this.#quietSince = 0
    } else if (this.#quietSince === 0) {
      this.#quietSince = now
    } else if (now - this.#quietSince >= HANGOVER_MS) {
      this.#endCapture()
      return
    }

    if (now - this.#startedAt >= MAX_UTTERANCE_MS) this.#endCapture()
  }

  async #beginCapture(): Promise<void> {
    if (!this.#stream || this.capturing) return
    try {
      this.#chunks = []
      this.#recorder = new MediaRecorder(this.#stream, { mimeType: 'audio/webm;codecs=opus' })
      this.#recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.#chunks.push(e.data)
      }
      this.#recorder.start()
      this.#startedAt = performance.now()
      this.#quietSince = 0
      this.events.onSpeechStart()
    } catch (err) {
      this.events.onError(err instanceof Error ? err.message : String(err))
    }
  }

  #endCapture(): void {
    const recorder = this.#recorder
    if (!recorder || recorder.state === 'inactive') return

    const spoken = performance.now() - this.#startedAt
    this.#recorder = null
    this.#loud = 0
    this.#quietSince = 0

    recorder.onstop = () => {
      const audio = this.#chunks.length
        ? new Blob(this.#chunks, { type: 'audio/webm' })
        : null
      this.#chunks = []
      // Subtract the hangover: what remains is actual speech, not trailing silence.
      if (audio && spoken - HANGOVER_MS >= MIN_UTTERANCE_MS) {
        this.events.onSpeechEnd(audio)
      }
    }
    recorder.stop()
  }

  /** Throw the current capture away without emitting it. */
  #abortCapture(): void {
    const recorder = this.#recorder
    this.#recorder = null
    this.#chunks = []
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
  }
}

export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData()
  form.append('audio', audio, 'utterance.webm')
  const res = await fetch(`${AI_SERVICE}/stt`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`)
  const { text } = (await res.json()) as { text: string }
  return text.trim()
}

/**
 * Text-to-speech via the OS voices exposed to the webview. Local, no model
 * download, no extra process. Piper can replace this later for a better voice;
 * the call sites do not need to change.
 */
/** Common female voice names across Windows/Edge installs. */
const FEMALE =
  /zira|aria|jenny|michelle|ava|emma|hazel|susan|linda|catherine|libby|sonia|natasha|clara|female/i

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  if (voices.length === 0) return null
  const en = voices.filter((v) => v.lang.startsWith('en'))

  // "Natural" voices sound markedly better than the legacy SAPI set, so a
  // natural female wins outright; otherwise any female; then anything English.
  return (
    en.find((v) => FEMALE.test(v.name) && /natural/i.test(v.name)) ??
    en.find((v) => FEMALE.test(v.name)) ??
    voices.find((v) => FEMALE.test(v.name)) ??
    en[0] ??
    voices[0]
  )
}

/** getVoices() is empty until the engine has enumerated them. */
function voicesReady(): Promise<void> {
  if (speechSynthesis.getVoices().length > 0) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done)
      resolve()
    }
    speechSynthesis.addEventListener('voiceschanged', done)
    // Some webviews never fire the event; do not hang the turn on it.
    setTimeout(done, 1000)
  })
}

/**
 * Settles the in-flight `speak()` promise. Chromium does not reliably fire
 * `end` when `cancel()` lands before speech actually starts, which would leave
 * the caller awaiting forever.
 */
let finishCurrent: (() => void) | null = null

/** Playing ElevenLabs audio, if that is the active engine. */
let current: HTMLAudioElement | null = null

async function speakSystem(text: string): Promise<void> {
  if (!('speechSynthesis' in window)) return
  await voicesReady()

  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice()
  if (voice) utterance.voice = voice
  utterance.rate = 1.05
  utterance.pitch = 1.05

  try {
    await new Promise<void>((resolve) => {
      finishCurrent = resolve
      utterance.onend = () => resolve()
      // An error here is not worth failing the turn over; the text is on screen.
      utterance.onerror = () => resolve()
      speechSynthesis.speak(utterance)
    })
  } finally {
    finishCurrent = null
  }
}

async function speakEleven(text: string): Promise<void> {
  const res = await fetch(`${AI_SERVICE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`TTS ${res.status}: ${detail.slice(0, 160)}`)
  }

  const url = URL.createObjectURL(await res.blob())
  const audio = new Audio(url)
  current = audio
  try {
    await new Promise<void>((resolve, reject) => {
      finishCurrent = resolve
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Audio playback failed'))
      void audio.play().catch(reject)
    })
  } finally {
    URL.revokeObjectURL(url)
    if (current === audio) current = null
    finishCurrent = null
  }
}

export interface SpeakOptions {
  engine: VoiceEngine
  /** Called when the chosen engine failed and the OS voice took over. */
  onFallback?(reason: string): void
}

/** Speak `text` aloud, resolving when playback finishes or is cancelled. */
export async function speak(text: string, options: SpeakOptions): Promise<void> {
  stopSpeaking()

  if (options.engine === 'elevenlabs') {
    try {
      return await speakEleven(text)
    } catch (err) {
      // No key, no quota, no network — say it in the OS voice rather than
      // going silent, but do not hide that the cloud voice failed.
      options.onFallback?.(err instanceof Error ? err.message : String(err))
    }
  }
  return speakSystem(text)
}

export function stopSpeaking(): void {
  current?.pause()
  current = null
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  // Settle the awaiting caller even if `end`/`ended` never arrives.
  finishCurrent?.()
  finishCurrent = null
}
