"""Helpers that turn DB rows into pydantic responses and load LangGraph state."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from db import PaperMessage, PaperProject, PaperSection
from .schemas import MessageOut, ProjectDetail, ProjectMeta, SectionOut


def project_meta(project: PaperProject) -> ProjectMeta:
    return ProjectMeta(
        id=project.id,
        title=project.title or "Untitled Paper",
        topic=project.topic or "",
        domain=project.domain or "",
        paper_format=project.paper_format or "",
        paper_type=project.paper_type or "",
        citation_style=project.citation_style or "",
        journal_type=project.journal_type or "",
        num_sections=project.num_sections or 15,
        include_tables=bool(project.include_tables),
        include_figures=bool(project.include_figures),
        status=project.status or "intent",
        intent_complete=bool(project.intent_complete),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def section_to_out(section: PaperSection) -> SectionOut:
    try:
        guidance = json.loads(section.guidance_json) if section.guidance_json else {}
    except (TypeError, ValueError):
        guidance = {}
    return SectionOut(
        id=section.id,
        key=section.key,
        title=section.title,
        order=section.order,
        body_md=section.body_md or "",
        guidance=guidance,
        word_count=section.word_count or 0,
        version=section.version or 1,
        updated_at=section.updated_at,
    )


def message_to_out(message: PaperMessage) -> MessageOut:
    return MessageOut(
        id=message.id,
        role=message.role,
        content=message.content,
        phase=message.phase,
        created_at=message.created_at,
    )


def project_detail(db: Session, project: PaperProject) -> ProjectDetail:
    sections = (
        db.query(PaperSection)
        .filter(PaperSection.project_id == project.id)
        .order_by(PaperSection.order.asc())
        .all()
    )
    messages = (
        db.query(PaperMessage)
        .filter(PaperMessage.project_id == project.id)
        .order_by(PaperMessage.created_at.asc())
        .all()
    )
    try:
        template = json.loads(project.template_json) if project.template_json else []
    except (TypeError, ValueError):
        template = []
    return ProjectDetail(
        project=project_meta(project),
        sections=[section_to_out(s) for s in sections],
        messages=[message_to_out(m) for m in messages],
        template=template,
    )


def chat_history_for_graph(db: Session, project_id: int, limit: int = 24) -> list[dict[str, Any]]:
    rows = (
        db.query(PaperMessage)
        .filter(PaperMessage.project_id == project_id)
        .order_by(PaperMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return [{"role": r.role, "content": r.content} for r in rows]


def load_state_from_project(project: PaperProject) -> dict[str, Any]:
    try:
        template = json.loads(project.template_json) if project.template_json else []
    except (TypeError, ValueError):
        template = []
    return {
        "project_id": project.id,
        "topic": project.topic or None,
        "domain": project.domain or None,
        "paper_format": project.paper_format or None,
        "paper_type": project.paper_type or None,
        "citation_style": project.citation_style or None,
        "journal_type": project.journal_type or None,
        "num_sections": project.num_sections,
        "include_tables": project.include_tables,
        "include_figures": project.include_figures,
        "intent_complete": project.intent_complete,
        "title": project.title or None,
        "template": template,
    }


def persist_intake_fields(project: PaperProject, state: dict[str, Any]) -> None:
    for field in (
        "topic",
        "domain",
        "paper_format",
        "paper_type",
        "citation_style",
        "journal_type",
    ):
        value = state.get(field)
        if value:
            setattr(project, field, value)
    if state.get("num_sections"):
        project.num_sections = int(state["num_sections"])
    if state.get("include_tables") is not None:
        project.include_tables = bool(state["include_tables"])
    if state.get("include_figures") is not None:
        project.include_figures = bool(state["include_figures"])
    project.intent_complete = bool(state.get("intent_complete"))
