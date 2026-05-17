"""FastAPI router for Paper Studio."""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from auth import get_current_user
from db import (
    PaperAsset,
    PaperAudit,
    PaperEditLayer,
    PaperMessage,
    PaperProject,
    PaperSection,
    User,
    get_db,
)

from .agents.graph import get_graph
from .agents.llm import get_llm
from .agents.nodes.section_writer import stream_section
from .agents.nodes.template import template_node
from .agents.sanitize import sanitise_section_body
from .audit.engine import run_audit
from .audit.schema import AuditDetail, AuditMeta, AuditReport
from .audit.upload_parser import build_project_and_sections
from .presets import list_presets
from .schemas import (
    ApplyImprovementRequest,
    ApplyImprovementResponse,
    AssetOut,
    ChatMessageRequest,
    ChatResponse,
    CreatePaperRequest,
    EditLayerOut,
    EditLayerSave,
    ProjectDetail,
    ProjectMeta,
    SectionEditRequest,
    SectionOut,
)
import re
from .service import (
    chat_history_for_graph,
    load_state_from_project,
    message_to_out,
    persist_intake_fields,
    project_detail,
    project_meta,
    section_to_out,
)
from . import storage

router = APIRouter(prefix="/papers", tags=["papers"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_project(db: Session, user: User, project_id: int) -> PaperProject:
    project = db.query(PaperProject).filter(PaperProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Paper project not found")
    if project.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your paper")
    return project


def _word_count(md: str) -> int:
    return len((md or "").split())


def _materialize_template(db: Session, project: PaperProject, template: list[dict]) -> None:
    """Create empty PaperSection rows from a template plan (idempotent)."""
    if not template:
        return
    existing_keys = {s.key for s in project.sections}
    for spec in template:
        key = spec.get("key")
        if not key or key in existing_keys:
            continue
        section = PaperSection(
            project_id=project.id,
            key=key,
            title=spec.get("title") or key,
            order=int(spec.get("order") or 0),
            body_md=spec.get("placeholder", "") or "",
            guidance_json=json.dumps(spec),
            word_count=_word_count(spec.get("placeholder", "")),
            version=1,
        )
        db.add(section)
    project.template_json = json.dumps(template)
    project.status = "template_ready"
    project.updated_at = datetime.utcnow()


def _save_message(db: Session, project: PaperProject, role: str, content: str, phase: str) -> None:
    db.add(PaperMessage(project_id=project.id, role=role, content=content, phase=phase))


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=ProjectMeta)
def create_project(
    body: CreatePaperRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = PaperProject(user_id=current_user.id, title=body.title or "Untitled Paper")
    db.add(project)
    db.commit()
    db.refresh(project)
    # Seed a welcome message so the intake chat feels alive immediately.
    _save_message(
        db,
        project,
        role="assistant",
        content=(
            "Hi! I'll help you draft a publishable research paper. "
            "What topic do you want to write about, and what's the goal of the paper?"
        ),
        phase="intake",
    )
    db.commit()
    return project_meta(project)


@router.get("", response_model=list[ProjectMeta])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PaperProject)
        .filter(PaperProject.user_id == current_user.id)
        .order_by(PaperProject.updated_at.desc())
        .all()
    )
    return [project_meta(p) for p in rows]


@router.get("/presets")
def get_presets(current_user: User = Depends(get_current_user)):
    """Return metadata for the four supported paper-format presets so the
    frontend can render picker chips during intake."""
    return {"presets": list_presets()}


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    return project_detail(db, project)


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    storage.delete_prefix(f"papers/{project.id}/")
    db.delete(project)
    db.commit()
    return {"message": "Paper deleted"}


# ---------------------------------------------------------------------------
# Chat (intake + edit)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/chat", response_model=ChatResponse)
def chat(
    project_id: int,
    body: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    phase = body.phase or ("edit" if project.intent_complete else "intake")

    _save_message(db, project, role="user", content=body.message, phase=phase)

    state = load_state_from_project(project)
    state.update(
        {
            "phase": phase,
            "user_message": body.message,
            "chat_history": chat_history_for_graph(db, project.id),
        }
    )

    section_update: Optional[SectionOut] = None
    if phase == "edit" and body.target_section_key:
        target = (
            db.query(PaperSection)
            .filter(
                PaperSection.project_id == project.id,
                PaperSection.key == body.target_section_key,
            )
            .first()
        )
        if target:
            state["target_section_key"] = target.key
            state["section_title"] = target.title
            state["current_section_body"] = target.body_md or ""

    result = get_graph().invoke(state)

    reply = (result.get("assistant_reply") or "").strip() or "Okay."
    _save_message(db, project, role="assistant", content=reply, phase=phase)

    if phase == "intake":
        persist_intake_fields(project, result)
        if result.get("intent_complete") and not project.template_json:
            # Auto-generate template the moment intake completes — structure
            # comes from the chosen format preset, not from the LLM.
            tmpl_state = template_node(
                {
                    **result,
                    "paper_format": project.paper_format,
                    "topic": project.topic,
                    "domain": project.domain,
                    "citation_style": project.citation_style,
                    "journal_type": project.journal_type,
                }
            )
            _materialize_template(db, project, tmpl_state.get("template") or [])
            if tmpl_state.get("title"):
                project.title = tmpl_state["title"]
    elif phase == "edit":
        # If the editor produced a section_draft, persist it.
        if result.get("section_draft") and result.get("target_section_key"):
            target = (
                db.query(PaperSection)
                .filter(
                    PaperSection.project_id == project.id,
                    PaperSection.key == result["target_section_key"],
                )
                .first()
            )
            if target:
                clean_body = sanitise_section_body(result["section_draft"])
                target.body_md = clean_body
                target.word_count = _word_count(clean_body)
                target.version = (target.version or 1) + 1
                target.updated_at = datetime.utcnow()
                db.flush()
                section_update = section_to_out(target)

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)

    return ChatResponse(
        reply=reply,
        intent_complete=bool(project.intent_complete),
        state={
            "topic": project.topic,
            "domain": project.domain,
            "paper_format": project.paper_format,
            "paper_type": project.paper_type,
            "citation_style": project.citation_style,
            "journal_type": project.journal_type,
            "num_sections": project.num_sections,
            "include_tables": project.include_tables,
            "include_figures": project.include_figures,
            "action": result.get("action"),
            "target_section_key": result.get("target_section_key"),
        },
        project=project_meta(project),
        section_update=section_update,
    )


# ---------------------------------------------------------------------------
# Template generation (idempotent — usually auto-fires on intake complete)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/generate-template", response_model=ProjectDetail)
def generate_template(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    if not project.intent_complete:
        raise HTTPException(status_code=400, detail="Intake not complete yet")
    state = load_state_from_project(project)
    state["phase"] = "template"
    out = template_node(state)
    _materialize_template(db, project, out.get("template") or [])
    if out.get("title"):
        project.title = out["title"]
    db.commit()
    db.refresh(project)
    return project_detail(db, project)


# ---------------------------------------------------------------------------
# Section drafting (SSE streaming) + manual edit
# ---------------------------------------------------------------------------

@router.post("/{project_id}/sections/{section_key}/draft", response_model=SectionOut)
def draft_section(
    project_id: int,
    section_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Non-streaming draft (used as fallback if browser cannot do SSE)."""
    project = _get_project(db, current_user, project_id)
    section = (
        db.query(PaperSection)
        .filter(PaperSection.project_id == project.id, PaperSection.key == section_key)
        .first()
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    # Paper drafting is a single logical operation per paper — sections are
    # not billed individually against the per-search quota.

    try:
        guidance = json.loads(section.guidance_json) if section.guidance_json else {}
    except (TypeError, ValueError):
        guidance = {}

    state = load_state_from_project(project)
    state.update(
        {
            "phase": "draft",
            "section_title": section.title,
            "section_guidance": guidance,
        }
    )
    from .agents.nodes.section_writer import section_writer_node

    out = section_writer_node(state)
    body = out.get("section_draft") or ""
    section.body_md = body
    section.word_count = _word_count(body)
    section.version = (section.version or 1) + 1
    section.updated_at = datetime.utcnow()
    project.status = "drafting"
    db.commit()
    db.refresh(section)
    return section_to_out(section)


@router.get("/{project_id}/sections/{section_key}/stream")
def stream_section_endpoint(
    project_id: int,
    section_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SSE — streams the LLM tokens as they arrive, then persists the full body."""
    project = _get_project(db, current_user, project_id)
    section = (
        db.query(PaperSection)
        .filter(PaperSection.project_id == project.id, PaperSection.key == section_key)
        .first()
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    # Paper drafting is one logical operation per paper — sections are not
    # billed individually against the per-search quota.

    try:
        guidance = json.loads(section.guidance_json) if section.guidance_json else {}
    except (TypeError, ValueError):
        guidance = {}

    state = load_state_from_project(project)
    state.update(
        {
            "phase": "draft",
            "section_title": section.title,
            "section_guidance": guidance,
        }
    )

    def event_gen():
        buffer = []
        try:
            for token in stream_section(state):
                buffer.append(token)
                # SSE frame
                payload = json.dumps({"delta": token})
                yield f"data: {payload}\n\n"
            full = sanitise_section_body("".join(buffer))
            section.body_md = full
            section.word_count = _word_count(full)
            section.version = (section.version or 1) + 1
            section.updated_at = datetime.utcnow()
            project.status = "drafting"
            db.commit()
            done = json.dumps({"done": True, "version": section.version, "word_count": section.word_count})
            yield f"data: {done}\n\n"
        except Exception as e:
            err = json.dumps({"error": str(e)})
            yield f"data: {err}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.patch("/{project_id}/sections/{section_key}", response_model=SectionOut)
def update_section(
    project_id: int,
    section_key: str,
    body: SectionEditRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    section = (
        db.query(PaperSection)
        .filter(PaperSection.project_id == project.id, PaperSection.key == section_key)
        .first()
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    section.body_md = body.body_md
    section.word_count = _word_count(body.body_md)
    section.version = (section.version or 1) + 1
    section.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(section)
    return section_to_out(section)


# ---------------------------------------------------------------------------
# Assets (figures uploaded by the user)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/assets", response_model=AssetOut)
async def upload_asset(
    project_id: int,
    file: UploadFile = File(...),
    label: str = Form(""),
    caption: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
    # Insert first to get an id, then build the key.
    asset = PaperAsset(
        project_id=project.id,
        kind="figure",
        label=label,
        caption=caption,
        mime=file.content_type or "application/octet-stream",
        minio_key="",
    )
    db.add(asset)
    db.flush()
    key = f"papers/{project.id}/figures/{asset.id}{ext}"
    storage.upload_bytes(key, data, mime=asset.mime)
    asset.minio_key = key
    db.commit()
    db.refresh(asset)
    return AssetOut(
        id=asset.id,
        kind=asset.kind,
        label=asset.label or "",
        caption=asset.caption or "",
        minio_key=asset.minio_key,
        mime=asset.mime,
        url=storage.presign_get(asset.minio_key),
    )


@router.get("/{project_id}/assets/{asset_id}", response_model=AssetOut)
def get_asset(
    project_id: int,
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    asset = db.query(PaperAsset).filter(PaperAsset.id == asset_id, PaperAsset.project_id == project.id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return AssetOut(
        id=asset.id,
        kind=asset.kind,
        label=asset.label or "",
        caption=asset.caption or "",
        minio_key=asset.minio_key,
        mime=asset.mime,
        url=storage.presign_get(asset.minio_key),
    )


@router.get("/{project_id}/assets", response_model=list[AssetOut])
def list_assets(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    rows = db.query(PaperAsset).filter(PaperAsset.project_id == project.id).all()
    return [
        AssetOut(
            id=a.id,
            kind=a.kind,
            label=a.label or "",
            caption=a.caption or "",
            minio_key=a.minio_key,
            mime=a.mime,
            url=storage.presign_get(a.minio_key) if a.minio_key else "",
        )
        for a in rows
    ]


# ---------------------------------------------------------------------------
# Export — assemble the paper and upload to MinIO
# ---------------------------------------------------------------------------

@router.post("/{project_id}/export")
def export_paper(
    project_id: int,
    format: str = "md",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    sections = (
        db.query(PaperSection)
        .filter(PaperSection.project_id == project.id)
        .order_by(PaperSection.order.asc())
        .all()
    )

    fmt = (format or "md").lower()
    if fmt == "md":
        from .exporters.markdown import build_markdown
        data = build_markdown(project, sections).encode("utf-8")
        mime = "text/markdown"
        ext = "md"
    elif fmt == "docx":
        from .exporters.docx_export import build_docx
        data = build_docx(project, sections)
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ext = "docx"
    elif fmt == "pdf":
        from .exporters.pdf_export import build_pdf
        data = build_pdf(project, sections)
        mime = "application/pdf"
        ext = "pdf"
    else:
        raise HTTPException(status_code=400, detail="Unknown format")

    version_count = (
        db.query(PaperAsset)
        .filter(PaperAsset.project_id == project.id, PaperAsset.kind == "export")
        .count()
    )
    key = f"papers/{project.id}/exports/paper_v{version_count + 1}.{ext}"
    storage.upload_bytes(key, data, mime=mime)

    asset = PaperAsset(
        project_id=project.id,
        kind="export",
        label=f"Export {ext.upper()}",
        caption="",
        minio_key=key,
        mime=mime,
    )
    db.add(asset)
    project.status = "done"
    db.commit()
    db.refresh(asset)
    return {
        "url": storage.presign_get(key),
        "key": key,
        "format": ext,
        "asset_id": asset.id,
    }


# ---------------------------------------------------------------------------
# Examine Engine — research paper audit
# ---------------------------------------------------------------------------

def _audit_meta(audit: PaperAudit) -> AuditMeta:
    return AuditMeta(
        id=audit.id,
        version=audit.version or 1,
        overall_score=audit.overall_score or 0,
        publication_readiness=audit.publication_readiness or 0,
        novelty_score=audit.novelty_score or 0,
        plagiarism_risk=audit.plagiarism_risk or "low",
        ai_detection_risk=audit.ai_detection_risk or "low",
        decision=audit.decision or "major_revision",
        created_at=audit.created_at,
    )


def _audit_to_detail(audit: PaperAudit) -> AuditDetail:
    try:
        report_data = json.loads(audit.json_report) if audit.json_report else {}
    except (TypeError, ValueError):
        report_data = {}
    return AuditDetail(meta=_audit_meta(audit), report=AuditReport(**report_data))


@router.post("/{project_id}/audit", response_model=AuditDetail)
def run_project_audit(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run the Examine Engine against the paper and persist the report.

    Non-streaming convenience endpoint used as a fallback. Prefer
    ``/audit/stream`` so the client can show per-stage progress.
    """
    project = _get_project(db, current_user, project_id)
    sections = (
        db.query(PaperSection)
        .filter(PaperSection.project_id == project.id)
        .order_by(PaperSection.order.asc())
        .all()
    )
    if not sections:
        raise HTTPException(status_code=400, detail="No sections to audit yet")
    if not any((s.body_md or "").strip() for s in sections):
        raise HTTPException(
            status_code=400,
            detail="Every section is empty — fill out at least one before auditing.",
        )

    report = run_audit(project, sections)
    audit = _persist_audit(db, project, report)
    return _audit_to_detail(audit)


def _persist_audit(db: Session, project: PaperProject, report: AuditReport) -> PaperAudit:
    previous = (
        db.query(PaperAudit)
        .filter(PaperAudit.project_id == project.id)
        .count()
    )
    audit = PaperAudit(
        project_id=project.id,
        version=previous + 1,
        overall_score=report.overall_score,
        publication_readiness=report.publication_readiness,
        novelty_score=report.novelty_score,
        plagiarism_risk=report.plagiarism_risk,
        ai_detection_risk=report.ai_detection_risk,
        decision=report.decision,
        json_report=report.model_dump_json(),
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit


@router.post("/{project_id}/audit/stream")
def run_project_audit_stream(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SSE stream — emits stage events while the audit runs, then the final
    AuditDetail. Frame format: ``data: {"stage": "...", "label": "..."}\\n\\n``
    for progress; ``data: {"done": true, "audit": {...}}\\n\\n`` for the
    completion event.
    """
    project = _get_project(db, current_user, project_id)
    sections = (
        db.query(PaperSection)
        .filter(PaperSection.project_id == project.id)
        .order_by(PaperSection.order.asc())
        .all()
    )
    def event_gen():
        if not sections:
            yield "data: " + json.dumps(
                {"error": "No sections to audit yet — generate a template first."}
            ) + "\n\n"
            return
        if not any((s.body_md or "").strip() for s in sections):
            yield "data: " + json.dumps(
                {"error": "Every section is empty. Draft at least one section before auditing."}
            ) + "\n\n"
            return

        # Queue stage events emitted from inside run_audit and flush after
        # each callback. Using a list as a tiny inter-thread channel: the
        # synchronous run_audit will call back in this same thread, so we
        # just append and yield as we go.
        pending: list[dict] = []

        def cb(stage: str, label: str) -> None:
            pending.append({"stage": stage, "label": label})

        try:
            # Drive the audit forward in chunks by interleaving stage drains.
            # Since run_audit is synchronous we cannot truly interleave, so we
            # emit a "starting" frame, run to completion collecting events,
            # then emit collected events. To keep the UI feeling live we
            # actually emit each event the moment it lands by using a
            # generator-side hook. Easiest portable trick: split into a
            # background generator using a queue.
            import queue
            import threading

            q: "queue.Queue[dict | None]" = queue.Queue()
            result: dict = {}

            def runner():
                def cb2(stage: str, label: str) -> None:
                    q.put({"stage": stage, "label": label})

                try:
                    report = run_audit(project, sections, on_stage=cb2)
                    audit = _persist_audit(db, project, report)
                    detail = _audit_to_detail(audit).model_dump(mode="json")
                    q.put({"done": True, "audit": detail})
                except Exception as e:
                    q.put({"error": str(e)})
                finally:
                    q.put(None)

            t = threading.Thread(target=runner, daemon=True)
            t.start()

            while True:
                msg = q.get()
                if msg is None:
                    break
                yield "data: " + json.dumps(msg) + "\n\n"
                if msg.get("done") or msg.get("error"):
                    break
            t.join(timeout=2)
        except Exception as e:
            yield "data: " + json.dumps({"error": str(e)}) + "\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/{project_id}/audits", response_model=list[AuditMeta])
def list_project_audits(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    rows = (
        db.query(PaperAudit)
        .filter(PaperAudit.project_id == project.id)
        .order_by(PaperAudit.created_at.desc())
        .all()
    )
    return [_audit_meta(a) for a in rows]


# ---------------------------------------------------------------------------
# Upload + persist a user-supplied paper (PDF / DOCX) as a PaperProject
# ---------------------------------------------------------------------------

_ACCEPTED_PAPER_TYPES = {
    "ieee_conference", "acm_article", "elsevier_journal", "apa_thesis", "generic",
}


def _resolve_citation_style(paper_type: str) -> str:
    """Pick the citation style heuristic for an uploaded paper."""
    pt = (paper_type or "").lower()
    if "ieee" in pt:
        return "ieee"
    if "acm" in pt:
        return "acm"
    if "apa" in pt:
        return "apa"
    if "elsevier" in pt or "harvard" in pt:
        return "harvard"
    return "ieee"  # safe default — engine handles unknown styles gracefully


@router.post("/verify-upload", response_model=ProjectMeta)
async def verify_uploaded_paper(
    file: UploadFile = File(...),
    paper_type: str = Form("generic"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse the uploaded file once, store it as a PaperProject the user can
    then iterate on inside the canvas (verify → apply per-section fixes →
    re-verify → export).

    The audit itself is run later from the canvas, not at upload time. This
    keeps the upload cheap (no LLM call) so the user only spends tokens when
    they actually want a review.
    """
    pt = (paper_type or "generic").strip().lower()
    if pt not in _ACCEPTED_PAPER_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown paper type: {paper_type}")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    citation_style = _resolve_citation_style(pt)
    try:
        parsed_project, parsed_sections = build_project_and_sections(
            file.filename or "uploaded", data, pt, citation_style
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not parsed_sections or not any((s.body_md or "").strip() for s in parsed_sections):
        raise HTTPException(
            status_code=400,
            detail="Could not extract any usable text from the file.",
        )

    # Build the template_json off the parsed sections so audits / exports have
    # the same structural metadata they'd have for a drafted paper.
    template = [
        {"key": s.key, "title": s.title, "order": s.order, "placeholder": ""}
        for s in parsed_sections
    ]

    project = PaperProject(
        user_id=current_user.id,
        title=parsed_project.title or "Uploaded Paper",
        topic=file.filename or "uploaded paper",
        domain="uploaded",
        paper_format=pt,                    # ieee_conference / acm_article / ... / generic
        paper_type="uploaded",              # marker so the UI can show provenance
        citation_style=citation_style,
        journal_type="",
        num_sections=len(parsed_sections),
        include_tables=True,
        include_figures=True,
        status="drafting",
        template_json=json.dumps(template),
        intent_complete=True,               # skip intake — canvas opens directly
    )
    db.add(project)
    db.flush()  # need project.id before creating sections

    for s in parsed_sections:
        db.add(
            PaperSection(
                project_id=project.id,
                key=s.key,
                title=s.title,
                order=s.order,
                body_md=s.body_md,
                word_count=len((s.body_md or "").split()),
                version=1,
            )
        )

    # Seed an assistant message so the chat panel in the canvas isn't empty
    # when the user lands. Keeps the experience consistent with drafted papers.
    _save_message(
        db,
        project,
        role="assistant",
        content=(
            f"I've imported '{project.title}' ({len(parsed_sections)} section"
            f"{'s' if len(parsed_sections) != 1 else ''}). "
            "Click Verify Paper to run the first review, then use Apply this fix → "
            "on each suggested improvement to refine sections without re-uploading."
        ),
        phase="edit",
    )

    # Store the original file as an asset so the user can re-download the
    # source if needed. Failures here are non-fatal — the parsed project is
    # what matters for the verify/edit flow.
    try:
        ext = ""
        if file.filename and "." in file.filename:
            ext = "." + file.filename.rsplit(".", 1)[-1].lower()
        asset = PaperAsset(
            project_id=project.id,
            kind="source",
            label=file.filename or "Source upload",
            caption="Original uploaded file",
            mime=file.content_type or "application/octet-stream",
            minio_key="",
        )
        db.add(asset)
        db.flush()
        key = f"papers/{project.id}/source/original{ext}"
        storage.upload_bytes(key, data, mime=asset.mime)
        asset.minio_key = key
    except Exception as e:
        print(f"[verify-upload] storing source asset failed: {e}")

    db.commit()
    db.refresh(project)
    return project_meta(project)


# ---------------------------------------------------------------------------
# Targeted audit-improvement fix — surgical single-snippet rewrite
# ---------------------------------------------------------------------------
#
# The chat-graph editor flow ("regenerate_section") rewrites entire sections,
# which means clicking one Apply-this-fix card on the audit panel can visibly
# change 2-3 things at once. For uploaded papers we want the opposite: each
# Fix It produces ONE precise old_snippet -> new_snippet replacement that the
# frontend can apply both to the section's body_md and to the matching text
# run on the rendered PDF canvas.

_TARGETED_FIX_PROMPT = """You are a research-paper copy editor. The user has identified ONE specific issue with a section of their paper and wants the smallest possible surgical fix — not a full rewrite.

You will be given (1) the issue to address and (2) the section text. Your job is to produce ONE precise replacement that fixes the issue.

Return EXACTLY this JSON object — no markdown fences, no commentary, no extra keys:

{{"old_snippet": "<verbatim substring copied from the SECTION TEXT block>", "new_snippet": "<replacement text>"}}

# Hard rules — read carefully

1. old_snippet MUST be a character-for-character verbatim substring of the SECTION TEXT block delimited by <<<SECTION>>> / <<</SECTION>>> below. Copy it exactly, including punctuation and spacing.
2. NEVER copy old_snippet from the "Issue" or "Suggested fix" lines above — those are instructions to YOU, not part of the paper. If you cannot find any sentence in the section that this fix could anchor on, return {{"old_snippet": "", "new_snippet": ""}} and stop.
3. new_snippet replaces old_snippet inside the section. The section must read coherently after the replacement — so new_snippet usually CONTAINS old_snippet plus the change.
4. For REPLACEMENT issues (rewrite this phrase, fix this wording): pick the smallest contiguous span that needs to change (a single sentence or phrase). new_snippet is the rewritten version of that span.
5. For ADDITIVE issues (e.g. "incorporate more recent studies", "include uncertainty measures", "add a comparison", "expand discussion"): pick the existing sentence in the section that the new content should follow (or precede). Set new_snippet = that same sentence + the new content. The anchor sentence MUST come from the SECTION TEXT block — never from the Issue line.
6. Never invent text and put it in old_snippet. Never paraphrase. Never echo the Issue line.
7. Return ONLY the JSON. No prose, no backticks, no preamble.

# Inputs

Section title: {section_title}
Issue: {issue_detail}
Suggested fix: {suggested_instruction}

SECTION TEXT (the ONLY text you may quote from in old_snippet):
<<<SECTION>>>
{section_body}
<<</SECTION>>>
"""


@router.post(
    "/{project_id}/improvements/apply",
    response_model=ApplyImprovementResponse,
)
def apply_improvement(
    project_id: int,
    body: ApplyImprovementRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project(db, current_user, project_id)
    if not body.section_key:
        raise HTTPException(
            status_code=400,
            detail="section_key is required for a targeted fix",
        )

    section = (
        db.query(PaperSection)
        .filter(
            PaperSection.project_id == project.id,
            PaperSection.key == body.section_key,
        )
        .first()
    )
    if not section:
        raise HTTPException(status_code=404, detail=f"Section {body.section_key} not found")

    body_md = section.body_md or ""
    if not body_md.strip():
        raise HTTPException(status_code=400, detail="Section is empty — nothing to fix")

    prompt = _TARGETED_FIX_PROMPT.format(
        section_title=section.title,
        section_body=body_md,
        issue_detail=body.detail or body.title,
        suggested_instruction=body.suggested_instruction,
    )

    llm = get_llm(temperature=0.2)
    response = llm.invoke(prompt)
    raw = (getattr(response, "content", "") or "").strip()

    # Strip ```json fences if the model added them despite the instruction.
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
        old_snippet = (data.get("old_snippet") or "").strip()
        new_snippet = (data.get("new_snippet") or "").strip()
    except (json.JSONDecodeError, AttributeError) as e:
        raise HTTPException(status_code=502, detail=f"Could not parse fix response: {e}")

    # Hallucination guard: the model is told (rule 2 in the prompt) to return
    # empty snippets when no real anchor exists. It also sometimes echoes the
    # "Issue:" / "Suggested fix:" text from the prompt as old_snippet — those
    # strings are NOT in the section body, so the matcher would fail anyway,
    # but bailing here gives the frontend a clean "Couldn't auto-apply"
    # without surfacing a fabricated snippet in the diff.
    def _is_prompt_echo(snippet: str) -> bool:
        if not snippet:
            return False
        sl = snippet.lower()
        for src in (body.detail or "", body.title or "", body.suggested_instruction or ""):
            src_l = src.strip().lower()
            if not src_l:
                continue
            # Echo = snippet is a substring of the issue text, or vice versa.
            # Either direction means the model anchored on instruction text
            # rather than on the section body.
            if sl in src_l or src_l in sl:
                return True
        return False

    if not old_snippet or _is_prompt_echo(old_snippet):
        return ApplyImprovementResponse(
            section_update=None,
            old_snippet="",
            new_snippet="",
            matched=False,
        )

    # Locate the snippet in the section body. Try exact substring first;
    # fall back to a whitespace-flexible regex (PDF extraction often
    # introduces extra newlines/double spaces that the model doesn't
    # reproduce verbatim). The match result only tells the frontend
    # whether the LLM's anchor is real — we no longer write back into
    # the section automatically for uploaded papers.
    matched = False
    if old_snippet in body_md:
        matched = True
    else:
        words = [w for w in re.split(r"\s+", old_snippet.strip()) if w]
        if words:
            flexed = r"\s+".join(re.escape(w) for w in words)
            try:
                if re.search(flexed, body_md):
                    matched = True
            except re.error:
                matched = False

    section_update = None
    is_uploaded = (project.paper_type or "").lower() == "uploaded"

    # Drafted papers (Paper Studio): keep the legacy auto-apply behaviour so
    # the chat-graph + Apply this fix experience for that flow doesn't
    # regress.
    if matched and not is_uploaded:
        if old_snippet in body_md:
            new_body = body_md.replace(old_snippet, new_snippet, 1)
        else:
            words = [w for w in re.split(r"\s+", old_snippet.strip()) if w]
            flexed = r"\s+".join(re.escape(w) for w in words)
            m = re.search(flexed, body_md)
            new_body = body_md[: m.start()] + new_snippet + body_md[m.end():]
        if new_body != body_md:
            section.body_md = sanitise_section_body(new_body)
            section.word_count = _word_count(section.body_md)
            section.version = (section.version or 1) + 1
            section.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(section)
            section_update = section_to_out(section)

    # Uploaded papers (Verify Paper): suggestion-only. The frontend stores
    # this in a "pending suggestions" list and the user manually clicks
    # Insert into editor → the change lands in the PDF edit overlay (and
    # gets persisted via PUT /edits when they hit Save).

    return ApplyImprovementResponse(
        section_update=section_update,
        old_snippet=old_snippet,
        new_snippet=new_snippet,
        matched=matched,
        section_key=section.key,
        pdf_page=None,
    )


# ---------------------------------------------------------------------------
# Verify-Paper edit layer
#
# The frontend EditableCanvas keeps a per-text-run map of user edits in
# component state. These two endpoints persist that map so it survives page
# reloads and so the audit can re-analyse the latest visible state.
# ---------------------------------------------------------------------------

def _edit_layer_for(db: Session, project_id: int) -> dict[str, dict]:
    """Return the saved edits dict for a project (empty if none)."""
    row = (
        db.query(PaperEditLayer)
        .filter(PaperEditLayer.project_id == project_id)
        .first()
    )
    if not row or not row.edits_json:
        return {}
    try:
        data = json.loads(row.edits_json)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError):
        return {}


@router.get("/{project_id}/edits", response_model=EditLayerOut)
def get_edits(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project(db, current_user, project_id)
    row = (
        db.query(PaperEditLayer)
        .filter(PaperEditLayer.project_id == project_id)
        .first()
    )
    if not row:
        return EditLayerOut(edits={}, updated_at=None)
    try:
        data = json.loads(row.edits_json) if row.edits_json else {}
    except (TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    return EditLayerOut(edits=data, updated_at=row.updated_at)


@router.put("/{project_id}/edits", response_model=EditLayerOut)
def save_edits(
    project_id: int,
    body: EditLayerSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace the entire edit layer in one shot.

    The frontend always owns the canonical state during a session — we just
    persist a snapshot so reload + re-verify see the same thing. Per-row
    CRUD would force a stricter contract for negligible UX benefit on MVP.
    """
    project = _get_project(db, current_user, project_id)

    serialised = {
        rid: {
            "original": item.original,
            "new": item.new,
            "page": item.page,
        }
        for rid, item in (body.edits or {}).items()
    }

    row = (
        db.query(PaperEditLayer)
        .filter(PaperEditLayer.project_id == project.id)
        .first()
    )
    if row is None:
        row = PaperEditLayer(project_id=project.id, edits_json=json.dumps(serialised))
        db.add(row)
    else:
        row.edits_json = json.dumps(serialised)
        row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return EditLayerOut(edits=serialised, updated_at=row.updated_at)


def _apply_edit_layer_to_sections(
    sections: list[PaperSection],
    edits: dict[str, dict],
) -> list[PaperSection]:
    """Return a list of *detached* PaperSection-like objects with the edit
    layer applied to body_md. The DB rows are never mutated — these are
    transient objects fed into the audit engine.

    Strategy: for every saved edit, search each section's body for the
    original snippet (exact substring first, whitespace-flex fallback) and
    swap in the new text. Edits that can't be located anywhere are silently
    skipped — they remain in the layer for the PDF overlay and export but
    just don't contribute to this audit run.
    """
    if not edits:
        return sections

    # Deep-ish copy: shallow dicts hold the values we'll mutate. Easiest is
    # to make detached SimpleNamespace-style mirrors so the SQLAlchemy
    # session is untouched.
    class _S:
        __slots__ = ("id", "key", "title", "order", "body_md", "guidance_json", "word_count", "version", "updated_at")
        def __init__(self, src: PaperSection):
            for f in self.__slots__:
                setattr(self, f, getattr(src, f, None))

    mirrors = [_S(s) for s in sections]

    for edit in edits.values():
        if not isinstance(edit, dict):
            continue
        original = (edit.get("original") or "").strip()
        new_text = edit.get("new") or ""
        if not original:
            continue
        for m in mirrors:
            body = m.body_md or ""
            if not body:
                continue
            if original in body:
                m.body_md = body.replace(original, new_text, 1)
                break
            words = [w for w in re.split(r"\s+", original) if w]
            if not words:
                continue
            flexed = r"\s+".join(re.escape(w) for w in words)
            try:
                match = re.search(flexed, body)
            except re.error:
                match = None
            if match:
                m.body_md = body[: match.start()] + new_text + body[match.end():]
                break

    # Re-stamp word_count so the audit's per-section length checks see the
    # post-edit reality.
    for m in mirrors:
        m.word_count = _word_count(m.body_md or "")
    return mirrors


@router.post("/{project_id}/audits/{audit_id}/export")
def export_audit_report(
    project_id: int,
    audit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Render the saved audit report to a downloadable PDF.

    The PDF is uploaded to MinIO as a regular `export` asset so the same
    presigned-URL pattern as paper export works. The HTML/CSS pipeline is
    in exporters/audit_report.py so the formatting decisions live next to
    the other exporters, not buried in router code.
    """
    project = _get_project(db, current_user, project_id)
    audit = (
        db.query(PaperAudit)
        .filter(PaperAudit.id == audit_id, PaperAudit.project_id == project.id)
        .first()
    )
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    try:
        report = json.loads(audit.json_report) if audit.json_report else {}
    except (TypeError, ValueError):
        report = {}
    if not report:
        raise HTTPException(
            status_code=400,
            detail="This audit has no report body — re-run the audit and try again.",
        )

    from .exporters.audit_report import build_audit_pdf

    data = build_audit_pdf(project, report)
    mime = "application/pdf"
    ext = "pdf"

    version_count = (
        db.query(PaperAsset)
        .filter(
            PaperAsset.project_id == project.id,
            PaperAsset.kind == "audit_export",
        )
        .count()
    )
    key = f"papers/{project.id}/audit_exports/audit_v{audit.version}_{version_count + 1}.{ext}"
    storage.upload_bytes(key, data, mime=mime)

    asset = PaperAsset(
        project_id=project.id,
        kind="audit_export",
        label=f"Audit report v{audit.version}",
        caption="",
        minio_key=key,
        mime=mime,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return {
        "url": storage.presign_get(key),
        "key": key,
        "format": ext,
        "asset_id": asset.id,
    }


@router.get("/audits/{audit_id}", response_model=AuditDetail)
def get_audit_detail(
    audit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audit = db.query(PaperAudit).filter(PaperAudit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    # ownership check via the parent project
    project = db.query(PaperProject).filter(PaperProject.id == audit.project_id).first()
    if not project or (project.user_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Not your audit")
    return _audit_to_detail(audit)
