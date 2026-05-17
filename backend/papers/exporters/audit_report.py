"""Audit-report exporter — turns an AuditReport JSON into a clean PDF the
user can download as a verification deliverable.

Pipeline:  AuditReport JSON → Markdown → HTML (markdown lib) → PDF (WeasyPrint)

The Markdown step keeps the implementation honest and inspectable: the same
content can be served as plain text if we ever expose that. The HTML+CSS
stage gives us print-quality typography without pulling in another PDF
library.

Public API:  build_audit_pdf(project, audit_report) -> bytes
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import markdown as md_lib
from weasyprint import HTML


# ---------------------------------------------------------------------------
# Plain-English vocabulary
# ---------------------------------------------------------------------------

_DECISION_COPY = {
    "accept": ("Accept", "Your paper is ready to submit."),
    "minor_revision": (
        "Minor Revision",
        "A few small fixes will get this paper over the line.",
    ),
    "major_revision": (
        "Major Revision",
        "Several sections still need substantive work before the paper is ready.",
    ),
    "reject": (
        "Reject",
        "There are foundational issues — restructure the paper before resubmitting.",
    ),
}

_RISK_COPY = {"low": "Low risk", "medium": "Medium risk", "high": "High risk"}

_DIMENSION_LABELS = {
    "title": "Title quality",
    "abstract": "Abstract completeness",
    "literature": "Literature review depth",
    "methodology": "Methodology clarity",
    "results": "Results & evidence",
    "citations": "Citations & references",
    "formatting": "Formatting cleanliness",
    "ai_tells": "Human-likeness (AI patterns)",
}

_PRIORITY_LABELS = {
    "high": "High priority",
    "medium": "Medium priority",
    "low": "Low priority",
}


# ---------------------------------------------------------------------------
# Markdown builder
# ---------------------------------------------------------------------------

def _band(score: int) -> str:
    if score >= 80:
        return "Strong"
    if score >= 60:
        return "Acceptable"
    if score >= 40:
        return "Needs work"
    return "Weak"


def _verdict_section(report: dict) -> list[str]:
    decision = report.get("decision") or "major_revision"
    label, note = _DECISION_COPY.get(decision, _DECISION_COPY["major_revision"])
    overall = int(report.get("overall_score") or 0)
    pub = int(report.get("publication_readiness") or 0)
    novelty = int(report.get("novelty_score") or 0)

    return [
        "## Overall verdict",
        "",
        f"**Decision:** {label}",
        "",
        note,
        "",
        "| Metric | Score | Reading |",
        "|---|---|---|",
        f"| Overall quality | {overall} / 100 | {_band(overall)} |",
        f"| Publication readiness | {pub} / 100 | {_band(pub)} |",
        f"| Novelty | {novelty} / 100 | {_band(novelty)} |",
        f"| Plagiarism risk | {_RISK_COPY.get(report.get('plagiarism_risk') or 'low', 'Unknown')} | — |",
        f"| AI-detection risk | {_RISK_COPY.get(report.get('ai_detection_risk') or 'low', 'Unknown')} | — |",
        "",
    ]


def _critical_section(report: dict) -> list[str]:
    issues = report.get("critical_issues") or []
    if not issues:
        return ["## Critical issues", "", "_No critical issues found._", ""]
    lines = ["## Critical issues", ""]
    lines += [f"{i + 1}. {iss}" for i, iss in enumerate(issues)]
    lines.append("")
    return lines


def _improvements_section(report: dict) -> list[str]:
    items = report.get("improvements") or []
    if not items:
        return ["## Suggested improvements", "", "_No additional suggestions._", ""]
    lines = ["## Suggested improvements", ""]
    for i, imp in enumerate(items, start=1):
        priority = imp.get("priority") or "low"
        title = (imp.get("title") or "Untitled suggestion").strip()
        section_key = imp.get("section_key") or "general"
        detail = (imp.get("detail") or "").strip()
        suggestion = (imp.get("suggested_instruction") or "").strip()

        lines.append(f"### {i}. {title}")
        lines.append("")
        lines.append(
            f"_{_PRIORITY_LABELS.get(priority, priority)} · "
            f"Affects section: **{section_key}**_"
        )
        lines.append("")
        if detail:
            lines.append(f"**What we found:** {detail}")
            lines.append("")
        if suggestion:
            lines.append(f"**Suggested action:** {suggestion}")
            lines.append("")
    return lines


def _dimensions_section(report: dict) -> list[str]:
    lines = ["## Dimension findings", "", "How the paper performs across the eight reviewer dimensions:", ""]
    lines.append("| Dimension | Score | Notes |")
    lines.append("|---|---|---|")
    for key, label in _DIMENSION_LABELS.items():
        dim = report.get(key) or {}
        score = int(dim.get("score") or 0)
        notes = (dim.get("issues") or [])[:2]
        notes_md = "; ".join(notes) if notes else "No specific issues flagged."
        lines.append(f"| {label} | {score} / 100 | {notes_md} |")
    lines.append("")
    return lines


def _section_findings(report: dict) -> list[str]:
    findings = report.get("section_findings") or []
    if not findings:
        return []
    lines = ["## Section-by-section", ""]
    for f in findings:
        title = f.get("section_title") or f.get("section_key") or "Section"
        wc = f.get("word_count") or 0
        status = f.get("status") or "ok"
        status_word = {"ok": "Looks good", "warning": "Watch out", "fail": "Needs work"}.get(status, status)
        lines.append(f"**{title}** — {wc} words · _{status_word}_")
        lines.append("")
        for iss in (f.get("issues") or [])[:6]:
            lines.append(f"- {iss}")
        if not (f.get("issues") or []):
            lines.append("- No issues raised for this section.")
        lines.append("")
    return lines


def _reviewer_section(report: dict) -> list[str]:
    rv = report.get("reviewer") or {}
    strengths = rv.get("strengths") or []
    weaknesses = rv.get("weaknesses") or []
    corrections = rv.get("required_corrections") or []
    if not (strengths or weaknesses or corrections):
        return []
    lines = ["## Reviewer summary", ""]
    if strengths:
        lines.append("**Strengths:**")
        lines += [f"- {s}" for s in strengths]
        lines.append("")
    if weaknesses:
        lines.append("**Weaknesses:**")
        lines += [f"- {w}" for w in weaknesses]
        lines.append("")
    if corrections:
        lines.append("**Required corrections:**")
        lines += [f"- {c}" for c in corrections]
        lines.append("")
    return lines


def build_audit_markdown(project: Any, report: dict) -> str:
    """Return a self-contained Markdown string describing the audit."""
    title = getattr(project, "title", None) or "Untitled paper"
    paper_format = getattr(project, "paper_format", None) or ""
    citation = (getattr(project, "citation_style", None) or "").upper()
    today = datetime.utcnow().strftime("%d %B %Y")

    head = [
        f"# Research Paper Audit",
        "",
        f"**Paper:** {title}",
        "",
    ]
    meta_bits = []
    if paper_format:
        meta_bits.append(paper_format.replace("_", " ").title())
    if citation:
        meta_bits.append(f"{citation} citation style")
    if meta_bits:
        head.append("_" + " · ".join(meta_bits) + "_")
        head.append("")
    head.append(f"_Generated on {today}_")
    head.append("")
    head.append("---")
    head.append("")

    parts = []
    parts.append("\n".join(head))
    parts.append("\n".join(_verdict_section(report)))
    parts.append("\n".join(_critical_section(report)))
    parts.append("\n".join(_improvements_section(report)))
    parts.append("\n".join(_dimensions_section(report)))
    section_lines = _section_findings(report)
    if section_lines:
        parts.append("\n".join(section_lines))
    reviewer_lines = _reviewer_section(report)
    if reviewer_lines:
        parts.append("\n".join(reviewer_lines))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# HTML / CSS
# ---------------------------------------------------------------------------

_CSS = """
@page { size: A4; margin: 1.6cm 1.8cm; }
* { box-sizing: border-box; }
body {
  font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1f2937;
}
h1 {
  font-size: 22pt;
  margin: 0 0 0.4em 0;
  color: #0f172a;
  border-bottom: 2px solid #4f8ef7;
  padding-bottom: 0.25em;
}
h2 {
  font-size: 14pt;
  color: #0f172a;
  margin-top: 1.6em;
  margin-bottom: 0.5em;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.2em;
}
h3 {
  font-size: 11.5pt;
  color: #1e3a8a;
  margin-top: 1.1em;
  margin-bottom: 0.3em;
}
p, li { margin: 0.35em 0; }
strong { color: #111827; }
em { color: #475569; }
ul { padding-left: 1.3em; }
ol { padding-left: 1.5em; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.6em 0 1em 0;
  font-size: 9.8pt;
}
th, td {
  border: 1px solid #d1d5db;
  padding: 0.45em 0.6em;
  text-align: left;
  vertical-align: top;
}
th {
  background: #f3f4f6;
  font-weight: 600;
  color: #111827;
}
hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 1.2em 0;
}
"""


def build_audit_pdf(project: Any, report: dict) -> bytes:
    """Render the audit report into a downloadable PDF."""
    md = build_audit_markdown(project, report)
    body_html = md_lib.markdown(
        md, extensions=["tables", "fenced_code", "sane_lists"]
    )
    html_doc = (
        "<!DOCTYPE html><html><head>"
        f"<style>{_CSS}</style>"
        "<meta charset=\"utf-8\">"
        "</head><body>"
        f"{body_html}"
        "</body></html>"
    )
    return HTML(string=html_doc).write_pdf()
