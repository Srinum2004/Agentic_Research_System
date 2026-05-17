"""Markdown exporter — concatenates ordered sections into a single .md file."""
from __future__ import annotations

from db import PaperProject, PaperSection


def build_markdown(project: PaperProject, sections: list[PaperSection]) -> str:
    parts: list[str] = []
    title = project.title or "Untitled Paper"
    parts.append(f"# {title}\n")
    meta_bits = []
    if project.domain:
        meta_bits.append(f"**Domain:** {project.domain}")
    if project.paper_type:
        meta_bits.append(f"**Type:** {project.paper_type}")
    if project.journal_type:
        meta_bits.append(f"**Target journal:** {project.journal_type}")
    if project.citation_style:
        meta_bits.append(f"**Citation style:** {project.citation_style.upper()}")
    if meta_bits:
        parts.append(" · ".join(meta_bits) + "\n")

    for section in sections:
        parts.append(f"\n## {section.order}. {section.title}\n")
        body = (section.body_md or "").strip()
        if body:
            parts.append(body + "\n")
        else:
            parts.append("_(section pending)_\n")
    return "\n".join(parts)
