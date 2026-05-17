"""DOCX exporter — uses python-docx. Renders headings, paragraphs, and tables.

This is a pragmatic markdown->docx converter that handles the constructs
the LangGraph writer actually emits:
  - paragraphs
  - GitHub-flavored markdown tables
  - fenced code blocks (rendered as monospace paragraphs)
  - level-2 and level-3 headings inside section bodies
"""
from __future__ import annotations

import io
import re
from typing import Iterable

from docx import Document
from docx.shared import Pt

from db import PaperProject, PaperSection

_TABLE_LINE = re.compile(r"^\s*\|.+\|\s*$")
_TABLE_SEP = re.compile(r"^\s*\|?(\s*:?-{3,}:?\s*\|)+(\s*:?-{3,}:?\s*)\|?\s*$")


def _add_table(doc: Document, rows: list[list[str]]) -> None:
    if not rows:
        return
    table = doc.add_table(rows=len(rows), cols=len(rows[0]))
    table.style = "Light Grid Accent 1"
    for r, row in enumerate(rows):
        for c, cell in enumerate(row):
            table.cell(r, c).text = cell


def _consume_table(lines: list[str], i: int) -> tuple[list[list[str]], int]:
    rows = []
    while i < len(lines) and _TABLE_LINE.match(lines[i]):
        if _TABLE_SEP.match(lines[i]):
            i += 1
            continue
        cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        rows.append(cells)
        i += 1
    return rows, i


def _render_section_body(doc: Document, body: str) -> None:
    lines = (body or "").splitlines()
    i = 0
    in_code = False
    code_buffer: list[str] = []
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("```"):
            if in_code:
                # close code block
                p = doc.add_paragraph()
                run = p.add_run("\n".join(code_buffer))
                run.font.name = "Courier New"
                run.font.size = Pt(9)
                code_buffer = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_buffer.append(line)
            i += 1
            continue
        if _TABLE_LINE.match(line):
            rows, i = _consume_table(lines, i)
            _add_table(doc, rows)
            continue
        if line.startswith("### "):
            doc.add_heading(line[4:].strip(), level=3)
        elif line.startswith("## "):
            doc.add_heading(line[3:].strip(), level=2)
        elif line.startswith("# "):
            doc.add_heading(line[2:].strip(), level=2)
        elif line.strip() == "":
            doc.add_paragraph("")
        else:
            doc.add_paragraph(line)
        i += 1


def build_docx(project: PaperProject, sections: Iterable[PaperSection]) -> bytes:
    doc = Document()
    doc.add_heading(project.title or "Untitled Paper", level=0)

    meta_parts = []
    if project.domain:
        meta_parts.append(f"Domain: {project.domain}")
    if project.paper_type:
        meta_parts.append(f"Type: {project.paper_type}")
    if project.journal_type:
        meta_parts.append(f"Target journal: {project.journal_type}")
    if project.citation_style:
        meta_parts.append(f"Citation style: {project.citation_style.upper()}")
    if meta_parts:
        doc.add_paragraph(" · ".join(meta_parts))

    for section in sections:
        doc.add_heading(f"{section.order}. {section.title}", level=1)
        body = (section.body_md or "").strip() or "(section pending)"
        _render_section_body(doc, body)

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
