"""Editor node — handles canvas-chat messages.

Classifies the user's message via EDITOR_ROUTER_PROMPT. If the user wants a
section edited/regenerated, the node either rewrites the section directly
(small edits) or signals the API layer to trigger a section_writer SSE stream
(via state["action"] == "regenerate_section").

All LLM output that becomes section body is passed through
sanitise_section_body to strip typography HTML, AI filler, and asterisk-quote
noise before persistence.
"""
from __future__ import annotations

from ..llm import get_llm
from ..prompts import CITATION_FORMAT_PROMPT, EDITOR_PROMPT, EDITOR_ROUTER_PROMPT
from ..sanitize import sanitise_section_body
from ..state import PaperState
from .intake import _extract_json


def _is_reference_section(key: str | None) -> bool:
    if not key:
        return False
    return key.lower() in {"references", "bibliography", "works_cited", "reference_list"}


def editor_node(state: PaperState) -> PaperState:
    template = state.get("template") or []
    keys = [s.get("key", "") for s in template if s.get("key")]

    router_llm = get_llm(temperature=0.0)
    router_resp = router_llm.invoke(
        EDITOR_ROUTER_PROMPT.format(
            section_keys=", ".join(keys) or "(none yet)",
            user_message=state.get("user_message", ""),
        )
    )
    decision = _extract_json(router_resp.content)
    action = decision.get("action", "answer")
    target_key = decision.get("target_key", "none")
    instruction = decision.get("instruction", state.get("user_message", ""))
    reply = (decision.get("reply") or "").strip()

    state["action"] = action
    if target_key and target_key != "none":
        state["target_section_key"] = target_key
    state["section_instruction"] = instruction

    if action == "edit_section" and state.get("current_section_body") is not None:
        # References section is special — the user often pastes a raw URL/
        # citation dump that needs to be reformatted, not edited. Route those
        # through the citation formatter for the project's citation_style.
        if _is_reference_section(state.get("target_section_key")):
            cite_llm = get_llm(temperature=0.2)
            cite_resp = cite_llm.invoke(
                CITATION_FORMAT_PROMPT.format(
                    citation_style=state.get("citation_style") or "ieee",
                    raw_sources=instruction,
                )
            )
            draft = sanitise_section_body(cite_resp.content)
        else:
            edit_llm = get_llm(temperature=0.3)
            edited = edit_llm.invoke(
                EDITOR_PROMPT.format(
                    section_title=state.get("section_title", ""),
                    citation_style=state.get("citation_style", ""),
                    instruction=instruction,
                    current_body=state.get("current_section_body", ""),
                )
            )
            draft = sanitise_section_body(edited.content)
        state["section_draft"] = draft
        state["assistant_reply"] = reply or f"Updated **{state.get('section_title','section')}**."
    else:
        state["assistant_reply"] = reply or "Got it."
    return state
