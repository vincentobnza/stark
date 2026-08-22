"""Claude as STARK's brain.

The agent loop lives in the desktop app, because the tools it calls run on
Windows. So this is deliberately stateless: one request in, one assistant turn
out, tool calls handed back for the app to execute and approve.

The API key stays here rather than in the Tauri bundle — anything shipped to the
frontend is readable in the packaged app.
"""

from __future__ import annotations

import os
from typing import Any

import anthropic

MODEL = "claude-opus-5"
# Voice commands are short. Low effort means fewer, more-consolidated tool
# calls, less preamble and terser confirmations — all of which are latency.
# Raise to "high" via STARK_CLAUDE_EFFORT for harder multi-step work.
DEFAULT_EFFORT = "low"
# The reply is one sentence, but adaptive thinking also draws from this budget.
MAX_TOKENS = 2000


class ClaudeBrain:
    def __init__(self) -> None:
        self.model = os.getenv("STARK_CLAUDE_MODEL", MODEL).strip()
        self.effort = os.getenv("STARK_CLAUDE_EFFORT", DEFAULT_EFFORT).strip()
        # Fast mode runs the same model at up to 2.5x output tokens/sec at
        # premium pricing. On a voice assistant that is the biggest single
        # latency lever, so it is on unless explicitly disabled.
        self.fast = os.getenv("STARK_CLAUDE_FAST", "1").strip() not in ("0", "false", "")
        self._client: anthropic.Anthropic | None = None

    @property
    def configured(self) -> bool:
        """The SDK also accepts an `ant auth login` profile, not just a key."""
        return bool(
            os.getenv("ANTHROPIC_API_KEY")
            or os.getenv("ANTHROPIC_AUTH_TOKEN")
            or os.path.isdir(os.path.expanduser("~/.config/anthropic"))
        )

    def _ensure_client(self) -> anthropic.Anthropic:
        if self._client is None:
            # Zero-arg: resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
            # `ant auth login` profile, in that order.
            self._client = anthropic.Anthropic()
        return self._client

    @staticmethod
    def _to_anthropic(messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
        """Convert the app's neutral transcript into Anthropic's shape.

        Adjacent tool results are merged into one user message: splitting them
        across messages teaches Claude to stop making parallel tool calls.
        """
        system_parts: list[str] = []
        out: list[dict[str, Any]] = []

        for m in messages:
            role = m.get("role")
            content = m.get("content") or ""

            if role == "system":
                system_parts.append(content)
                continue

            if role == "tool":
                block = {
                    "type": "tool_result",
                    "tool_use_id": m.get("toolCallId") or m.get("tool_call_id") or "",
                    "content": content,
                }
                # Surface failures as errors rather than as plausible results.
                if content.startswith("Error:") or content.startswith("Denied"):
                    block["is_error"] = True
                if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list):
                    out[-1]["content"].append(block)
                else:
                    out.append({"role": "user", "content": [block]})
                continue

            if role == "assistant":
                blocks: list[dict[str, Any]] = []
                if content.strip():
                    blocks.append({"type": "text", "text": content})
                for call in m.get("toolCalls") or []:
                    blocks.append(
                        {
                            "type": "tool_use",
                            "id": call.get("id"),
                            "name": call.get("name"),
                            "input": call.get("arguments") or {},
                        }
                    )
                if blocks:
                    out.append({"role": "assistant", "content": blocks})
                continue

            out.append({"role": "user", "content": content})

        return "\n\n".join(system_parts), out

    def chat(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
    ) -> dict[str, Any]:
        """One assistant turn. Returns text plus any tool calls to execute."""
        client = self._ensure_client()
        system, converted = self._to_anthropic(messages)

        # The app sends OpenAI-shaped tool specs; Anthropic wants them flat.
        anthropic_tools = [
            {
                "name": t["function"]["name"],
                "description": t["function"]["description"],
                "input_schema": t["function"]["parameters"],
            }
            for t in (tools or [])
        ]

        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "system": system,
            "messages": converted,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": self.effort},
            # Route around a policy decline instead of returning nothing.
            "fallbacks": "default",
            "betas": ["server-side-fallback-2026-07-01"],
        }
        if anthropic_tools:
            params["tools"] = anthropic_tools
        if self.fast:
            params["speed"] = "fast"
            params["betas"] = [*params["betas"], "fast-mode-2026-02-01"]

        response = client.beta.messages.create(**params)

        # A refusal is an HTTP 200 with no usable content — check before reading.
        if response.stop_reason == "refusal":
            detail = getattr(response, "stop_details", None)
            reason = getattr(detail, "explanation", None) or "the request was declined"
            return {"content": f"I can't help with that: {reason}", "tool_calls": []}

        text = "".join(b.text for b in response.content if b.type == "text").strip()
        tool_calls = [
            {"id": b.id, "name": b.name, "arguments": b.input}
            for b in response.content
            if b.type == "tool_use"
        ]

        return {
            "content": text,
            "tool_calls": tool_calls,
            "usage": {
                "input": response.usage.input_tokens,
                "output": response.usage.output_tokens,
                "cache_read": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
            },
        }
