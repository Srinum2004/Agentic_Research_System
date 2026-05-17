"""LLM-judged audit checks. Phase-1 strategy: one consolidated call returning
all eight judgement dimensions as strict JSON."""
from __future__ import annotations

import json
import re
from typing import Any

from ..agents.llm import get_llm
from ..agents.nodes.intake import _extract_json
from .prompts import AUDIT_PROMPT


# Cap how much paper body we send to the LLM. Most papers fit comfortably;
# extremely long drafts are truncated section-tail-first to preserve the
# introduction + methodology + results signal.
_MAX_PAPER_CHARS = 18000


def _build_paper_body(sections: list[Any]) -> str:
    parts = []
    for s in sections:
        body = (s.body_md or "").strip()
        parts.append(f"## {s.order}. {s.title}\n\n{body if body else '(empty)'}\n")
    full = "\n".join(parts)
    if len(full) <= _MAX_PAPER_CHARS:
        return full
    head = full[: _MAX_PAPER_CHARS - 200]
    return head + "\n\n[... paper truncated for audit ...]"


def _build_deterministic_summary(det: dict[str, Any]) -> str:
    structure = det.get("structure", {})
    citations = det.get("citations", {})
    fmt = det.get("formatting", {})
    ai = det.get("ai_tells", {})
    rep = det.get("repetition", {})

    lines = [
        f"- Sections present ({structure.get('section_count', 0)}): "
        + ", ".join(structure.get("present", []) or ["(none)"]),
    ]
    if structure.get("missing"):
        lines.append("- Required sections MISSING: " + ", ".join(structure["missing"]))
    lines.append(
        f"- Inline citation markers: {citations.get('inline_marker_count', 0)} | "
        f"Reference entries: {citations.get('reference_count', 0)} | "
        f"Style: {citations.get('style', '?')}"
    )
    if citations.get("orphan_markers"):
        lines.append("- Orphan citation markers (no matching entry): "
                     + ", ".join(citations["orphan_markers"]))
    if citations.get("uncited_entries"):
        lines.append("- Reference entries never cited inline: "
                     + ", ".join(citations["uncited_entries"]))
    lines.append(
        f"- AI-tell phrase count: {ai.get('total_hits', 0)} "
        f"({ai.get('rate_per_1000_words', 0)}/1000 words, risk={ai.get('risk', 'low')})"
    )
    if ai.get("phrase_hits"):
        top = ", ".join(f"{p['phrase']}×{p['count']}" for p in ai["phrase_hits"][:5])
        lines.append(f"  Top phrases: {top}")
    lines.append(
        f"- Repetition share: {rep.get('repeated_share', 0)}% (risk={rep.get('risk', 'low')})"
    )
    lines.append(
        f"- Formatting noise: leftover HTML tags={fmt.get('leftover_html_count', 0)}, "
        f"*\"...\"* patterns={fmt.get('asterisk_quote_count', 0)}, "
        f"fence-wrapped sections={fmt.get('fence_wrap_count', 0)}"
    )
    short_word_counts = [
        f"{w['section_title']}:{w['word_count']}w[{w['verdict']}]"
        for w in det.get("word_counts", [])
    ]
    if short_word_counts:
        lines.append("- Word counts: " + ", ".join(short_word_counts))
    return "\n".join(lines)


def run_llm_judgement(project: Any, sections: list[Any], deterministic: dict[str, Any]) -> dict[str, Any]:
    """Single LLM call covering every judged dimension. Returns a dict matching
    the AUDIT_PROMPT JSON schema (best-effort; missing fields fall back to
    defaults at the aggregator stage).

    Returns ``{"_error": "..."}`` when the LLM call itself fails (rate limit,
    network, etc.) so the aggregator can surface the reason instead of
    silently producing zero scores.
    """
    prompt = AUDIT_PROMPT.format(
        title=getattr(project, "title", "") or "Untitled Paper",
        domain=getattr(project, "domain", "") or "",
        paper_type=getattr(project, "paper_type", "") or "",
        journal_type=getattr(project, "journal_type", "") or "",
        citation_style=(getattr(project, "citation_style", "") or "").upper() or "IEEE",
        paper_format=getattr(project, "paper_format", "") or "",
        deterministic_summary=_build_deterministic_summary(deterministic),
        paper_body=_build_paper_body(sections),
    )
    llm = get_llm(temperature=0.15)
    try:
        response = llm.invoke(prompt)
    except Exception as e:
        msg = str(e)
        # Trim long upstream error payloads for the user-facing report.
        if len(msg) > 240:
            msg = msg[:240] + "…"
        return {"_error": msg}
    data = _extract_json(response.content)
    return data or {}
