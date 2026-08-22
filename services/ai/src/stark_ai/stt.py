"""Speech-to-text on faster-whisper."""

from __future__ import annotations

import os


class Transcriber:
    """Wraps a Whisper model, loaded on first use rather than at import."""

    def __init__(self) -> None:
        # small.en is the sweet spot for command dictation on CPU. Use
        # STARK_WHISPER_MODEL=medium.en if you want accuracy over latency,
        # or a device of "cuda" with compute "float16" if you have the VRAM.
        self.model_name = os.getenv("STARK_WHISPER_MODEL", "small.en")
        self.device = os.getenv("STARK_WHISPER_DEVICE", "cpu")
        self.compute_type = os.getenv("STARK_WHISPER_COMPUTE", "int8")
        self._model = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _ensure_model(self):
        if self._model is None:
            # First call downloads the weights to the HuggingFace cache.
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self.model_name,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model

    def transcribe(self, path: str) -> dict[str, object]:
        """Blocking. Callers must push this off the event loop."""
        segments, info = self._ensure_model().transcribe(
            path,
            beam_size=1,
            # Trims silence so a held-too-long push-to-talk does not cost seconds.
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return {
            "text": text,
            "language": info.language,
            "duration": round(info.duration, 2),
        }
