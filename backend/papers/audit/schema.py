"""Pydantic schemas for the Examine Engine audit report."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


RiskLevel = Literal["low", "medium", "high"]
Decision = Literal["accept", "minor_revision", "major_revision", "reject"]


class SectionFinding(BaseModel):
    section_key: str
    section_title: str
    status: Literal["ok", "warning", "fail"] = "ok"
    word_count: int = 0
    issues: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class Improvement(BaseModel):
    section_key: Optional[str] = None     # which section to operate on, or None for paper-wide
    priority: Literal["low", "medium", "high"] = "medium"
    title: str                            # short label, eg. "Add error analysis"
    detail: str                           # 1-2 sentence explanation
    suggested_instruction: str            # pre-filled instruction the user can send to the editor


class TitleFindings(BaseModel):
    score: int = 0                         # 0-100
    is_specific: bool = True
    is_clickbait: bool = False
    issues: list[str] = Field(default_factory=list)
    suggestion: Optional[str] = None


class AbstractFindings(BaseModel):
    score: int = 0
    has_problem: bool = False
    has_method: bool = False
    has_results: bool = False
    has_conclusion: bool = False
    word_count: int = 0
    issues: list[str] = Field(default_factory=list)


class LiteratureFindings(BaseModel):
    score: int = 0
    reference_count: int = 0
    has_gap_statement: bool = False
    issues: list[str] = Field(default_factory=list)


class MethodologyFindings(BaseModel):
    score: int = 0
    is_reproducible: bool = False
    has_dataset_detail: bool = False
    issues: list[str] = Field(default_factory=list)


class ResultsFindings(BaseModel):
    score: int = 0
    has_quantitative_results: bool = False
    has_comparison: bool = False
    realism_concern: bool = False
    issues: list[str] = Field(default_factory=list)


class CitationFindings(BaseModel):
    score: int = 0
    inline_markers: int = 0
    reference_entries: int = 0
    orphan_markers: list[str] = Field(default_factory=list)  # cited but no entry
    uncited_entries: list[str] = Field(default_factory=list)  # entry but never cited
    style_consistent: bool = True
    issues: list[str] = Field(default_factory=list)


class FormattingFindings(BaseModel):
    score: int = 0
    leftover_html_count: int = 0
    asterisk_quote_count: int = 0
    fence_wrap_count: int = 0
    heading_depth_issues: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)


class AITellFindings(BaseModel):
    score: int = 0                      # 0-100, higher = more human
    risk: RiskLevel = "low"
    phrase_hits: list[dict[str, Any]] = Field(default_factory=list)  # {phrase, count}
    issues: list[str] = Field(default_factory=list)


class ReviewerNotes(BaseModel):
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    required_corrections: list[str] = Field(default_factory=list)


class AuditReport(BaseModel):
    # ---- top-line scores
    overall_score: int = 0                # 0-100
    publication_readiness: int = 0        # 0-100
    novelty_score: int = 0                # 0-100
    plagiarism_risk: RiskLevel = "low"
    ai_detection_risk: RiskLevel = "low"
    decision: Decision = "major_revision"

    # ---- per-dimension findings
    title: TitleFindings = Field(default_factory=TitleFindings)
    abstract: AbstractFindings = Field(default_factory=AbstractFindings)
    literature: LiteratureFindings = Field(default_factory=LiteratureFindings)
    methodology: MethodologyFindings = Field(default_factory=MethodologyFindings)
    results: ResultsFindings = Field(default_factory=ResultsFindings)
    citations: CitationFindings = Field(default_factory=CitationFindings)
    formatting: FormattingFindings = Field(default_factory=FormattingFindings)
    ai_tells: AITellFindings = Field(default_factory=AITellFindings)

    # ---- structure
    sections_present: list[str] = Field(default_factory=list)
    sections_missing: list[str] = Field(default_factory=list)
    section_findings: list[SectionFinding] = Field(default_factory=list)

    # ---- distilled outputs
    critical_issues: list[str] = Field(default_factory=list)
    improvements: list[Improvement] = Field(default_factory=list)
    reviewer: ReviewerNotes = Field(default_factory=ReviewerNotes)


class AuditMeta(BaseModel):
    """Lightweight projection for the history list."""
    id: int
    version: int
    overall_score: int
    publication_readiness: int
    novelty_score: int
    plagiarism_risk: str
    ai_detection_risk: str
    decision: str
    created_at: datetime


class AuditDetail(BaseModel):
    meta: AuditMeta
    report: AuditReport
