"""Clarify node — asks one targeted follow-up question for the next missing field."""
from __future__ import annotations

from typing import Any

from ..llm import get_llm
from ..prompts import CLARIFY_PROMPT
from ..state import PaperState
from ...presets import list_presets
from .intake import REQUIRED_FIELDS, _format_history


def clarify_node(state: PaperState) -> PaperState:
    known = {}
    missing = []
    for f in REQUIRED_FIELDS:
        v = state.get(f)
        if v in (None, "", 0):
            missing.append(f)
        else:
            known[f] = v

    if not missing:
        state["assistant_reply"] = state.get("assistant_reply") or "All set, opening the canvas."
        return state

    # If paper_format is the next missing field, the UI surfaces the picker
    # chips alongside this message — keep the assistant text short and matched
    # to those chips so the user doesn't have to type a long sentence.
    if missing[0] == "paper_format":
        chips = ", ".join(p["name"] for p in list_presets())
        state["assistant_reply"] = (
            "Which paper format would you like to use? Pick one of "
            f"{chips} — or click a chip below."
        )
        return state

    llm = get_llm(temperature=0.4)
    prompt = CLARIFY_PROMPT.format(
        known_fields="\n".join(f"- {k}: {v}" for k, v in known.items()) or "(nothing yet)",
        missing_fields=", ".join(missing),
        chat_history=_format_history(state.get("chat_history", [])),
    )
    response = llm.invoke(prompt)
    state["assistant_reply"] = response.content.strip()
    return state
