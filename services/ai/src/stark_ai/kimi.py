"""Kimi K3 via NVIDIA NIM.

An OpenAI-compatible endpoint, so the tool-call shapes the desktop app already
speaks need no translation — unlike the Anthropic path in `llm.py`.

Kimi K3 is a reasoning model: it streams a chain of thought in
`reasoning_content` before any answer lands in `content`. That is kept out of
the reply entirely, the same way the Ollama client strips `<think>` blocks —
a spoken assistant must never read its own scratchpad aloud.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "moonshotai/kimi-k3"
# Generous: this model is slow enough that a normal HTTP timeout trips first.
TIMEOUT_S = 600.0


class KimiBrain:
    def __init__(self) -> None:
        self.api_key = os.getenv("NVIDIA_API_KEY", "").strip()
        self.model = os.getenv("STARK_KIMI_MODEL", MODEL).strip()
        # NIM accepts low|medium|high|max. Lower is fewer reasoning tokens,
        # which on this endpoint is the only lever that affects latency at all.
        self.effort = os.getenv("STARK_KIMI_EFFORT", "low").strip()
        self.max_tokens = int(os.getenv("STARK_KIMI_MAX_TOKENS", "1024"))

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    @staticmethod
    def _to_openai(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """The app's neutral transcript is already close to OpenAI's shape."""
        out: list[dict[str, Any]] = []
        for m in messages:
            role = m.get("role")
            content = m.get("content") or ""

            if role == "tool":
                out.append(
                    {
                        "role": "tool",
                        "tool_call_id": m.get("toolCallId") or m.get("tool_call_id") or "",
                        "content": content,
                    }
                )
                continue

            if role == "assistant" and m.get("toolCalls"):
                out.append(
                    {
                        "role": "assistant",
                        "content": content or None,
                        "tool_calls": [
                            {
                                "id": c.get("id"),
                                "type": "function",
                                "function": {
                                    "name": c.get("name"),
                                    "arguments": json.dumps(c.get("arguments") or {}),
                                },
                            }
                            for c in m["toolCalls"]
                        ],
                    }
                )
                continue

            out.append({"role": role, "content": content})
        return out

    async def chat(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
    ) -> dict[str, Any]:
        """One assistant turn. Returns text plus any tool calls to execute."""
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": self._to_openai(messages),
            "max_tokens": self.max_tokens,
            "temperature": 0.6,
            "stream": False,
            "reasoning_effort": self.effort,
        }
        # The app already sends OpenAI-shaped tool specs.
        if tools:
            payload["tools"] = tools

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            res = await client.post(ENDPOINT, headers=headers, json=payload)

        if res.status_code != 200:
            raise RuntimeError(f"NVIDIA NIM {res.status_code}: {res.text[:300]}")

        body = res.json()
        choice = (body.get("choices") or [{}])[0]
        message = choice.get("message") or {}

        # `reasoning_content` is deliberately dropped: it is the model thinking,
        # not its answer, and this reply gets spoken.
        content = (message.get("content") or "").strip()

        tool_calls = []
        for call in message.get("tool_calls") or []:
            fn = call.get("function") or {}
            raw = fn.get("arguments")
            try:
                arguments = json.loads(raw) if isinstance(raw, str) else (raw or {})
            except json.JSONDecodeError:
                arguments = {}
            tool_calls.append(
                {"id": call.get("id") or "", "name": fn.get("name") or "", "arguments": arguments}
            )

        usage = body.get("usage") or {}
        details = usage.get("completion_tokens_details") or {}
        return {
            "content": content,
            "tool_calls": tool_calls,
            "usage": {
                "input": usage.get("prompt_tokens", 0),
                "output": usage.get("completion_tokens", 0),
                # Worth surfacing: on this model it is most of the output.
                "reasoning": details.get("reasoning_tokens", 0),
            },
        }
