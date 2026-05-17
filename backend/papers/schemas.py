"""Pydantic schemas for the Paper Studio API."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class CreatePaperRequest(BaseModel):
    title: Optional[str] = None


class ChatMessageRequest(BaseModel):
    message: str
    phase: Optional[str] = "intake"          # intake | edit
    target_section_key: Optional[str] = None  # used when phase == edit


class SectionEditRequest(BaseModel):
    body_md: str


class ProjectMeta(BaseModel):
    id: int
    title: str
    topic: str
    domain: str
    paper_format: str
    paper_type: str
    citation_style: str
    journal_type: str
    num_sections: int
    include_tables: bool
    include_figures: bool
    status: str
    intent_complete: bool
    created_at: datetime
    updated_at: datetime


class SectionOut(BaseModel):
    id: int
    key: str
    title: str
    order: int
    body_md: str
    guidance: dict[str, Any]
    word_count: int
    version: int
    updated_at: datetime


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    phase: str
    created_at: datetime


class ProjectDetail(BaseModel):
    project: ProjectMeta
    sections: list[SectionOut]
    messages: list[MessageOut]
    template: list[dict[str, Any]]


class ChatResponse(BaseModel):
    reply: str
    intent_complete: bool
    state: dict[str, Any]
    project: ProjectMeta
    section_update: Optional[SectionOut] = None


class AssetOut(BaseModel):
    id: int
    kind: str
    label: str
    caption: str
    minio_key: str
    mime: str
    url: str


class ApplyImprovementRequest(BaseModel):
    # Anchors the fix to a specific section so the LLM only rewrites the
    # smallest substring that needs to change, instead of regenerating
    # everything reachable from the chat graph.
    section_key: Optional[str] = None
    title: str
    detail: str
    suggested_instruction: str


class ApplyImprovementResponse(BaseModel):
    # `section_update` is non-null ONLY for drafted papers (Paper Studio
    # chat-graph flow). Uploaded papers always come back with section_update
    # null and the user must manually accept the suggestion via the canvas.
    section_update: Optional[SectionOut] = None
    old_snippet: str
    new_snippet: str
    matched: bool                       # True if old_snippet was located in the section
    # Best-effort page hint so the frontend can scroll to / highlight the
    # right area of the rendered PDF when the user reviews the suggestion.
    section_key: Optional[str] = None
    pdf_page: Optional[int] = None


# ---------------------------------------------------------------------------
# Verify-Paper edit layer
# ---------------------------------------------------------------------------

class EditLayerItem(BaseModel):
    original: str
    new: str
    page: Optional[int] = None


class EditLayerSave(BaseModel):
    # Map of PDF.js text-run id ("p1_t42") -> edit. We replace the entire
    # layer on each PUT — keeps the contract dead-simple and lines up with
    # the frontend's pdfTextEdits component-state shape.
    edits: dict[str, EditLayerItem] = {}


class EditLayerOut(BaseModel):
    edits: dict[str, EditLayerItem] = {}
    updated_at: Optional[datetime] = None
