# STARK

A local-first, **voice-only** desktop assistant for Windows. Hold a key, speak, and it
operates your machine. No text box, no chat log — one orb and a spoken reply.

Built as an **agent platform with tools**, not a chat window. Every capability is a
registered tool with an explicit risk tier; the model chooses tools, the user
approves the dangerous ones.

## Layout

```
apps/desktop/          Tauri 2 app
  src/                 React 19 + TypeScript frontend
    core/tools/        Tool contracts, registry, built-in tools
    core/llm/          Provider interface + Ollama client
    core/agent/        Agent loop and permission gate
    components/        HUD
  src-tauri/           Rust backend: privileged OS operations
services/ai/           Python 3.12 FastAPI service (Whisper speech-to-text)
```

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Node 20+ and pnpm 11 | frontend |
| Rust (stable, MSVC) + VS 2022 C++ Build Tools | Tauri |
| WebView2 runtime | ships with Windows 11 |
| [uv](https://docs.astral.sh/uv/) | manages the Python 3.12 service |
| [Ollama](https://ollama.com) | the local model |

Pull a model that supports tool calling:

```powershell
ollama pull qwen2.5:3b
```

**Do not use a reasoning model here.** See [Latency](#latency).

## Running

```powershell
pnpm install
pnpm ai      # terminal 1 - speech-to-text on 127.0.0.1:8756 (REQUIRED - it is the only input)
pnpm dev     # terminal 2 - the app
```

`Ctrl+Alt+Space` summons or hides the HUD from anywhere.

Ollama must also be reachable on `:11434` — the installer runs it on login, or
start it with `ollama serve`.

Because there is no text input, **the speech service is not optional**: if
`:8756` is down there is no way to talk to Stark at all. The HUD says
`Mic unavailable` when that happens.

## Interaction

**Hands-free.** There is no button and no push-to-talk. The mic stays open and
speech starts a turn on its own. On launch it greets you once, by name and by
time of day ([greeting.ts](apps/desktop/src/greeting.ts)).

`Enter` or `Escape` cuts the assistant off mid-sentence and cancels an
in-flight generation. Those are the only keys, and they are controls rather
than input.

Two things on screen. A single transient line under the orb — what it heard,
which tool it ran, or what it said, replaced and never accumulated. And an
animated waveform along the bottom that tracks the room: it flatlines to
`MIC OFF` when the mic is closed. Settings appear on hover.

### The gate

Voice-activity detection lives in `VoiceGate`
([voice.ts](apps/desktop/src/voice.ts)) and adapts to the room instead of
needing tuning: it learns the noise floor while quiet, and opens when sound
exceeds it by 2.6×.

| Knob | Value | Why |
| --- | --- | --- |
| onset | 3 frames (~50ms) | shorter clips the first phoneme, longer misses it |
| hangover | 700ms | pauses mid-sentence must not end the turn |
| min utterance | 320ms | rejects coughs, doors, keystrokes |
| max utterance | 15s | a noisy room cannot record forever |

Two constraints shaped this:

- **Opus chunks are not independently decodable** — only the first carries the
  container header — so a rolling pre-roll buffer cannot be sliced. Hence a
  fresh `MediaRecorder` per utterance, and the tight onset budget to keep the
  clipped head short enough that Whisper does not care.
- **The gate mutes itself while the assistant talks.** Echo cancellation is not
  enough to stop it transcribing its own voice and replying to itself, so it
  goes deaf for the duration plus a 350ms tail.

One Chromium quirk worth knowing: `AudioContext` starts *suspended* until the
page has user activation, and a suspended analyser reports pure silence —
indistinguishable from a quiet room. With no button left to press, the gate
resumes the context explicitly, warns if it stays suspended, and retries on any
click or keypress.

## The tool system

A capability is a tool. Adding one means adding a file, not touching the agent.

```ts
export const myTool = defineTool({
  name: 'do_thing',
  description: 'What the model needs to know to choose this.',
  params: z.object({ target: z.string() }),   // JSON Schema for the LLM + runtime validation
  risk: 'confirm',
  preview: ({ target }) => `Do the thing to ${target}`,
  execute: (args) => invoke('do_thing', args), // usually a Rust command
})
```

Register it in [builtin/index.ts](apps/desktop/src/core/tools/builtin/index.ts).

### Risk tiers

This is the part that matters. The tier decides whether the user is asked.

| Tier | Behaviour | Tools |
| --- | --- | --- |
| `safe` | runs silently | `get_system_info`, `list_dir`, `read_file`, `read_clipboard`, `write_clipboard`, `send_notification` |
| `confirm` | asks once, may be approved for the session | `open_app`, `open_url`, `write_file` |
| `never-auto` | asks every single time, cannot be remembered | `run_command` |

The gate lives in [core/agent/loop.ts](apps/desktop/src/core/agent/loop.ts). An
unanswered prompt blocks the agent forever by design — there is no timeout that
could default to allow.

### Auto-approve

**Default: on.** The `auto` / `ask` toggle in the hover controls flips it. In
`auto`, the table above stops applying: every tool runs unattended, `run_command`
included, and the only record of what happened is the transient line under the
orb.

Worth understanding before leaving it on. The chain is
speech → Whisper → a 3B local model → arbitrary shell, with nothing in between.
A misheard phrase reaches `run_command` with no confirmation step. `ask` mode
costs one keypress (`Enter`) per action and removes that path entirely.

The tier system stays intact underneath either way — auto-approve resolves each
request as `allow-once`, never `allow-session`, so switching back to `ask` takes
effect on the very next tool call rather than after a restart.

## Latency

Everything is local, so latency is entirely a function of tokens generated and
whether a GPU is present. Measured on this machine (22 GB RAM, **no NVIDIA GPU**,
so CPU inference at ~17-20 tok/s), replying to "hey there" with 10 tools loaded:

| Model | Wall | Gen tokens | Reply |
| --- | --- | --- | --- |
| `qwen3:4b` (reasoning) | **77.9 s** | 639 | *empty* — all of it was thinking |
| `qwen2.5:3b` (instruct) | **2.1 s** | 10 | "Hello, how may I assist you today?" |

The lesson: **a hybrid reasoning model is the wrong tool for a voice assistant.**
`qwen3:4b` spent 2,791 characters of thinking on a greeting before saying a word,
and it wrongly called `send_notification` for it. Two non-fixes:

- `think: false` does not help — the model dumps its reasoning into the visible
  reply as plain text, with no `<think>` tags for the filter in
  [ollama.ts](apps/desktop/src/core/llm/ollama.ts) to strip.
- `num_predict` does not help either — capping a reasoning model at 220 tokens
  truncates it mid-thought and yields an empty reply.

So the client pins `num_predict: 220` and `keep_alive: 30m`, the system prompt
demands one sentence, and the default model does not reason. With a CUDA GPU you
could afford a 7-8B model; on CPU, 3B is the right trade.

## Voice

Two engines, switched by the `11labs` / `os` toggle in the hover controls.

| Engine | Where | Notes |
| --- | --- | --- |
| `os` | Windows SAPI, in the webview | Free, offline, instant. Picks a female voice (Zira here). |
| `11labs` | ElevenLabs, via the Python service | Much better. Costs credits, needs network. |

Copy [.env.example](services/ai/.env.example) to `services/ai/.env` and set
`ELEVENLABS_API_KEY`. That file is gitignored, and the key stays in the Python
service — never in the desktop bundle, which ships readable.

If the cloud call fails for any reason — no key, no quota, no network — the reply
is spoken in the OS voice rather than lost, and the HUD says why. The toggle is
disabled outright when the service reports no key.

### Voice library voices need a paid plan

`GET /voices` lists the ids available to your key. Be aware of two free-tier
walls, both of which return a clear error rather than failing quietly:

- **Library voices return `402 paid_plan_required`.** Anything from
  `elevenlabs.io/app/voice-library` — Vanessa, Aria, Charlotte — is unusable on
  the free tier via the API, no matter that the dashboard lets you preview it.
- **`/voices` needs the `voices_read` scope.** A key created without it returns
  `401 missing_permissions` for listing while still working fine for synthesis.

Default voices that do work on a free key: `Sarah`, `Laura`, `Alice`, `Matilda`,
`Jessica`, `Lily`. Ids are listed in the `.env` comments.

`eleven_flash_v2_5` is the default model deliberately — it is the low-latency
one, and on a voice assistant that matters more than the marginal quality of
`eleven_multilingual_v2`.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `STARK_WHISPER_MODEL` | `small.en` | `medium.en` for accuracy, `base.en` for speed |
| `STARK_WHISPER_DEVICE` | `cpu` | `cuda` if you have the VRAM |
| `STARK_WHISPER_COMPUTE` | `int8` | `float16` with CUDA |

Speech recognition costs ~1.6 s for a 5 s utterance once the model is resident
(the first call downloads it, ~80 s).

## Roadmap

- **V1 (done)** — voice-only orb HUD, push-to-talk, local LLM, spoken replies, tool system with a permission gate, file/system/clipboard tools, global hotkey
- **V2** — SQLite conversation persistence, tray icon, richer system control (volume, media, windows), Piper for a better voice
- **V3** — Playwright browser automation, web search with results, screenshots, vision-driven clicking
- **V4** — Persistent memory over SQLite + sqlite-vec, task planning, background agents, scheduled tasks
- **V5** — wake word, autonomous agents, cross-device control

## Notes

- **Provider is pluggable.** `LLMProvider` in
  [core/llm/types.ts](apps/desktop/src/core/llm/types.ts) is a four-member
  interface; a cloud adapter is one file. Ollama is the default so nothing leaves
  the machine.
- **HTTP to Ollama routes through Rust** via `tauri-plugin-http`, which sidesteps
  the CORS rejection a packaged build would otherwise hit on `tauri.localhost`.
- **Text-to-speech uses the OS voices** exposed to the webview. Piper is the V2
  upgrade; `speak()` in [voice.ts](apps/desktop/src/voice.ts) is the only call
  site to change.
