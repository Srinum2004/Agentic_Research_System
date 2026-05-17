"""LangGraph state for the Paper Studio pipeline."""
from __future__ import annotations

from typing import Any, Optional, TypedDict


class PaperState(TypedDict, total=False):
    # ---- routing
    project_id: int
    phase: str                              # intake | template | draft | edit
    user_message: str
    chat_history: list[dict[str, Any]]      # [{role, content}, ...] last N turns

    # ---- intake fields
    topic: Optional[str]
    domain: Optional[str]
    paper_format: Optional[str]
    paper_type: Optional[str]
    citation_style: Optional[str]
    journal_type: Optional[str]
    num_sections: Optional[int]
    include_tables: Optional[bool]
    include_figures: Optional[bool]
    intent_complete: bool

    # ---- writing
    title: Optional[str]
    template: list[dict[str, Any]]          # section specs from template_node
    target_section_key: Optional[str]
    section_title: Optional[str]
    section_guidance: dict[str, Any]
    research_context: str
    section_draft: str
    section_instruction: Optional[str]
    current_section_body: Optional[str]

    # ---- output back to caller
    assistant_reply: str
    action: Optional[str]                   # set by editor router
