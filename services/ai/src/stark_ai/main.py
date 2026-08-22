"""Local HTTP service for STARK's speech recognition and cloud voice.

Bound to loopback only. Nothing here should ever be exposed to a network:
it holds the ElevenLabs API key and will synthesise for any caller.
"""

from __future__ import annotations

import os
import tempfile

from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

# services/ai/.env — keys live on disk, never in the desktop bundle.
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from .llm import ClaudeBrain  # noqa: E402  (must follow load_dotenv)
from .stt import Transcriber  # noqa: E402
from .tts import ElevenLabs  # noqa: E402

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_TTS_CHARS = 2000

app = FastAPI(title="STARK AI service", version="0.1.0")

# The Tauri webview's origin differs between dev (localhost:1420) and a
# packaged build (tauri.localhost), and this service is loopback-only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

transcriber = Transcriber()
eleven = ElevenLabs()
brain = ClaudeBrain()


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TTS_CHARS)


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "model": transcriber.model_name,
        "device": transcriber.device,
        "model_loaded": transcriber.loaded,
        # The HUD uses these to decide which options are real.
        "tts_ready": eleven.configured,
        "tts_voice": eleven.voice_id if eleven.configured else None,
        "llm_ready": brain.configured,
        "llm_model": brain.model if brain.configured else None,
        "llm_fast": brain.fast,
    }


@app.post("/llm/chat")
async def llm_chat(body: ChatRequest) -> dict[str, Any]:
    """One assistant turn from Claude. 503 when unconfigured, so the app can
    fall back to the local model instead of failing the turn."""
    if not brain.configured:
        raise HTTPException(status_code=503, detail="No Anthropic credentials configured")
    try:
        # The SDK call is blocking; keep it off the event loop.
        return await run_in_threadpool(brain.chat, body.messages, body.tools)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc


@app.post("/tts")
async def tts(body: SpeakRequest) -> Response:
    """Synthesise speech. 503 when unconfigured, so the app can fall back."""
    if not eleven.configured:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY is not set")
    try:
        audio = await eleven.synthesize(body.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/mpeg")


@app.get("/voices")
async def voices() -> dict[str, object]:
    """Discover voice ids for ELEVENLABS_VOICE_ID."""
    if not eleven.configured:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY is not set")
    try:
        return {"voices": await eleven.voices()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/stt")
async def stt(audio: UploadFile = File(...)) -> dict[str, object]:
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio upload")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large")

    # faster-whisper reads from a path; PyAV handles the webm/opus container.
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(raw)
        tmp.close()
        return await run_in_threadpool(transcriber.transcribe, tmp.name)
    except Exception as exc:  # surfaced to the HUD, not swallowed
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        os.unlink(tmp.name)
