"""Cloud text-to-speech via ElevenLabs.

The API key lives here rather than in the desktop bundle: anything shipped to
the frontend ends up readable in the packaged app.
"""

from __future__ import annotations

import os

import httpx

# Rachel — ElevenLabs' default English voice. Override with ELEVENLABS_VOICE_ID.
DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"
# Flash is the low-latency model. For a voice assistant that matters more than
# the marginal quality of the multilingual models.
DEFAULT_MODEL = "eleven_flash_v2_5"
DEFAULT_FORMAT = "mp3_44100_128"

API_ROOT = "https://api.elevenlabs.io/v1"


class ElevenLabs:
    """Thin client. Reads config at construction; restart to pick up new env."""

    def __init__(self) -> None:
        self.api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
        self.voice_id = os.getenv("ELEVENLABS_VOICE_ID", DEFAULT_VOICE).strip()
        self.model = os.getenv("ELEVENLABS_MODEL", DEFAULT_MODEL).strip()
        self.output_format = os.getenv("ELEVENLABS_FORMAT", DEFAULT_FORMAT).strip()

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        return {"xi-api-key": self.api_key, "Content-Type": "application/json"}

    async def synthesize(self, text: str) -> bytes:
        """Return MP3 bytes for `text`. Raises RuntimeError on any API failure."""
        url = f"{API_ROOT}/text-to-speech/{self.voice_id}"
        payload = {
            "text": text,
            "model_id": self.model,
            "voice_settings": {"stability": 0.4, "similarity_boost": 0.75},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                url,
                headers=self._headers(),
                json=payload,
                params={"output_format": self.output_format},
            )
        if res.status_code != 200:
            # ElevenLabs puts the useful part in the body, not the status line.
            raise RuntimeError(f"ElevenLabs {res.status_code}: {res.text[:300]}")
        return res.content

    async def voices(self) -> list[dict[str, str]]:
        """List the voices on this account, so voice ids can be discovered."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(f"{API_ROOT}/voices", headers=self._headers())
        if res.status_code != 200:
            raise RuntimeError(f"ElevenLabs {res.status_code}: {res.text[:300]}")
        return [
            {
                "voice_id": v.get("voice_id", ""),
                "name": v.get("name", ""),
                "category": v.get("category", ""),
            }
            for v in res.json().get("voices", [])
        ]
