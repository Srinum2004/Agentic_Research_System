"""Section writer node — drafts one section using research + guidance.

Supports both:
  - non-streaming (`section_writer_node`) for graph-driven calls
  - streaming   (`stream_section`) for the SSE endpoint
"""
from __future__ import annotations

from typing import Any, Iterator

from ..llm import get_llm
from ..prompts import SECTION_WRITER_PROMPT
from ..sanitize import sanitise_section_body
from ..state import PaperState
from .research import research


def _build_prompt(state: PaperState) -> str:
    guidance: dict[str, Any] = state.get("section_guidance", {}) or {}
    section_title = state.get("section_title") or "Section"
    query = f"{section_title} — {state.get('topic', '')} ({state.get('domain', '')})"
    context = research(query)
    state["research_context"] = context
    return SECTION_WRITER_PROMPT.format(
        title=state.get("title", state.get("topic", "")),
        paper_type=state.get("paper_type", ""),
        domain=state.get("domain", ""),
        citation_style=state.get("citation_style", ""),
        section_title=section_title,
        purpose=guidance.get("purpose", ""),
        word_limit=guidance.get("word_limit", ""),
        what_to_include="; ".join(guidance.get("what_to_include", []) or []),
        common_mistakes="; ".join(guidance.get("common_mistakes", []) or []),
        research_context=context[:6000],
        include_tables="Yes" if state.get("include_tables") else "No",
        include_figures="Yes" if state.get("include_figures") else "No",
    )


def section_writer_node(state: PaperState) -> PaperState:
    prompt = _build_prompt(state)
    llm = get_llm(temperature=0.4)
    response = llm.invoke(prompt)
    state["section_draft"] = sanitise_section_body(response.content)
    state["assistant_reply"] = f"Drafted section: {state.get('section_title', '')}"
    return state


def stream_section(state: PaperState) -> Iterator[str]:
    """Yield token chunks for SSE streaming."""
    prompt = _build_prompt(state)
    llm = get_llm(temperature=0.4, streaming=True)
    for chunk in llm.stream(prompt):
        text = getattr(chunk, "content", "") or ""
        if text:
            yield text
