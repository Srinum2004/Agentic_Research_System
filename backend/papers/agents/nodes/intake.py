"""Intake node — minimal flow. The user picks a paper FORMAT (one of four
fixed presets), then states topic + domain. Everything else (citation style,
paper type, section count, tables/figures) is auto-filled from the preset.
"""
from __future__ import annotations

import json
from typing import Any

from ..llm import get_llm
from ..prompts import INTAKE_EXTRACTION_PROMPT, INTAKE_COMPLETE_PROMPT
from ..state import PaperState
from ...presets import list_presets, load_preset, resolve_format_alias

# Only these three fields are required from the user. The rest are derived
# from the chosen preset.
REQUIRED_FIELDS = (
    "paper_format",
    "topic",
    "domain",
)

# Fields the LLM may extract — wider net than REQUIRED so users can override
# preset defaults if they want.
EXTRACTABLE_FIELDS = (
    "paper_format",
    "topic",
    "domain",
    "journal_type",
    "num_sections",
    "include_tables",
    "include_figures",
)


def _format_history(history: list[dict[str, Any]]) -> str:
    lines = []
    for m in history[-12:]:
        role = m.get("role", "user")
        content = m.get("content", "")
        lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines) or "(empty)"


def _extract_json(text: str) -> dict[str, Any]:
    """Robust JSON extraction — tolerate leading/trailing prose or fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}


def _apply_preset(state: PaperState) -> None:
    """When paper_format is set, copy preset defaults into state unless the
    user has already overridden the field."""
    fmt = state.get("paper_format")
    if not fmt:
        return
    preset = load_preset(fmt)
    if not preset:
        return
    # citation_style and paper_type always come from the preset (the user can
    # pick a different format if they want a different style).
    state["citation_style"] = preset.get("citation_style", "")
    state["paper_type"] = preset.get("paper_type", "")
    # These are only filled if the user hasn't volunteered an override.
    if not state.get("journal_type"):
        state["journal_type"] = preset.get("default_journal_type", "")
    if state.get("num_sections") in (None, 0):
        state["num_sections"] = int(preset.get("num_sections") or len(preset.get("sections", [])) or 12)
    if state.get("include_tables") is None:
        state["include_tables"] = bool(preset.get("include_tables", True))
    if state.get("include_figures") is None:
        state["include_figures"] = bool(preset.get("include_figures", True))


def intake_node(state: PaperState) -> PaperState:
    """Run intake extraction. Merges any newly-detected fields into state."""
    llm = get_llm(temperature=0.0)
    history = state.get("chat_history", [])
    user_msg = state.get("user_message", "")

    prompt = INTAKE_EXTRACTION_PROMPT.format(
        chat_history=_format_history(history),
        user_message=user_msg,
    )
    response = llm.invoke(prompt)
    extracted = _extract_json(response.content)

    # Resolve paper_format aliases ("IEEE" -> "ieee_conference" etc.).
    if extracted.get("paper_format"):
        resolved = resolve_format_alias(extracted["paper_format"])
        if resolved:
            extracted["paper_format"] = resolved
        else:
            extracted["paper_format"] = None  # invalid value — drop it

    # Only overwrite when the new value is truthy / boolean explicitly stated.
    for field in EXTRACTABLE_FIELDS:
        value = extracted.get(field)
        if value is None or value == "":
            continue
        # Booleans: always accept (user explicitly stated).
        if field in ("include_tables", "include_figures"):
            state[field] = bool(value)  # type: ignore[literal-required]
            continue
        # Strings/ints: only overwrite if not already populated, so the LLM
        # can't accidentally clobber an earlier confirmed answer.
        if state.get(field) in (None, "", 0):
            state[field] = value  # type: ignore[literal-required]

    # Apply preset defaults the moment paper_format is known.
    _apply_preset(state)

    state["intent_complete"] = all(
        state.get(f) not in (None, "", 0) for f in REQUIRED_FIELDS
    )

    if state["intent_complete"]:
        preset = load_preset(state.get("paper_format") or "")
        preset_name = (preset or {}).get("name", state.get("paper_format") or "Custom")
        confirm = llm.invoke(
            INTAKE_COMPLETE_PROMPT.format(
                topic=state.get("topic"),
                domain=state.get("domain"),
                paper_format_name=preset_name,
                citation_style=state.get("citation_style"),
                num_sections=state.get("num_sections"),
            )
        )
        state["assistant_reply"] = confirm.content.strip()
    return state
