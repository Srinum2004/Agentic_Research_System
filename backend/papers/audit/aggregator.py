"""Aggregator — combines deterministic findings + LLM judgements into the
final AuditReport with scores and a decision."""
from __future__ import annotations

from typing import Any

from .schema import (
    AbstractFindings,
    AITellFindings,
    AuditReport,
    CitationFindings,
    FormattingFindings,
    Improvement,
    LiteratureFindings,
    MethodologyFindings,
    ResultsFindings,
    ReviewerNotes,
    SectionFinding,
    TitleFindings,
)


# Score weights for the overall score.
_WEIGHTS = {
    "structure":   20,
    "abstract":    10,
    "references":  15,
    "methodology": 15,
    "results":     15,
    "novelty":     10,
    "ai_human":    10,   # inverse of AI-detection risk
    "formatting":   5,
}


def _structure_subscore(det: dict[str, Any]) -> int:
    missing = det.get("structure", {}).get("missing", []) or []
    return max(0, 100 - 18 * len(missing))


def _references_subscore(det: dict[str, Any]) -> int:
    c = det.get("citations", {})
    score = 100
    if not c.get("ref_section_present"):
        return 0
    ref_count = c.get("reference_count", 0)
    if ref_count < 5:
        score -= 35
    elif ref_count < 10:
        score -= 20
    score -= 8 * min(5, len(c.get("orphan_markers", []) or []))
    score -= 4 * min(5, len(c.get("uncited_entries", []) or []))
    return max(0, score)


def _formatting_subscore(det: dict[str, Any]) -> int:
    f = det.get("formatting", {})
    penalty = (
        12 * min(5, f.get("leftover_html_count", 0))
        + 6 * min(5, f.get("asterisk_quote_count", 0))
        + 10 * min(3, f.get("fence_wrap_count", 0))
    )
    return max(0, 100 - penalty)


def _ai_human_subscore(det: dict[str, Any], llm: dict[str, Any]) -> int:
    """Combine deterministic AI-tell rate with the LLM's qualitative judgement.
    Higher = more human."""
    det_score = det.get("ai_tells", {}).get("score", 100)
    llm_score = (llm.get("ai_detection") or {}).get("score", det_score)
    return int(round(0.5 * det_score + 0.5 * llm_score))


def _risk_from_score(score: int) -> str:
    if score >= 75:
        return "low"
    if score >= 45:
        return "medium"
    return "high"


def _combine_plagiarism_risk(det: dict[str, Any]) -> str:
    """Plagiarism risk in MVP = repetition risk (deterministic n-gram). LLM
    doesn't see external corpora, so we don't take its word here."""
    return det.get("repetition", {}).get("risk", "low")


def _decision_for(overall: int, plag_risk: str, ai_risk: str, missing_count: int) -> str:
    if missing_count >= 2 or overall < 35:
        return "reject"
    if overall < 55 or ai_risk == "high" or plag_risk == "high":
        return "major_revision"
    if overall < 75 or ai_risk == "medium" or plag_risk == "medium":
        return "minor_revision"
    return "accept"


def _section_findings(det: dict[str, Any], sections: list[Any]) -> list[SectionFinding]:
    word_index = {w["section_key"]: w for w in det.get("word_counts", [])}
    out: list[SectionFinding] = []
    ai_per_section = det.get("ai_tells", {}).get("per_section", {}) or {}
    fmt_issues = det.get("formatting", {}).get("issues", []) or []

    for s in sections:
        wf = word_index.get(s.key, {})
        verdict = wf.get("verdict", "ok")
        issues: list[str] = []
        notes: list[str] = []
        if wf.get("message"):
            issues.append(wf["message"])
        # cross-reference formatting issues
        for fi in fmt_issues:
            if fi.startswith(f"{s.title}:"):
                issues.append(fi.split(":", 1)[1].strip())
                verdict = "warning" if verdict == "ok" else verdict
        # AI-tell density per section
        tell_count = ai_per_section.get(s.title, 0)
        if tell_count >= 3:
            issues.append(f"Contains {tell_count} AI-tell phrases")
            verdict = "warning" if verdict == "ok" else verdict

        status = "fail" if verdict == "fail" else ("warning" if verdict == "warning" else "ok")
        out.append(
            SectionFinding(
                section_key=s.key,
                section_title=s.title,
                status=status,
                word_count=wf.get("word_count", 0),
                issues=issues,
                notes=notes,
            )
        )
    return out


def aggregate(
    project: Any,
    sections: list[Any],
    deterministic: dict[str, Any],
    llm: dict[str, Any],
) -> AuditReport:
    """Combine both stages into the final AuditReport."""

    # ---- per-dimension findings (LLM-judged, with deterministic backfill)
    title_llm = (llm.get("title") or {})
    abstract_llm = (llm.get("abstract") or {})
    lit_llm = (llm.get("literature") or {})
    method_llm = (llm.get("methodology") or {})
    results_llm = (llm.get("results") or {})
    novelty_llm = (llm.get("novelty") or {})
    ai_llm = (llm.get("ai_detection") or {})
    reviewer_llm = (llm.get("reviewer") or {})

    title = TitleFindings(
        score=int(title_llm.get("score", 70)),
        is_specific=bool(title_llm.get("is_specific", True)),
        is_clickbait=bool(title_llm.get("is_clickbait", False)),
        issues=list(title_llm.get("issues", []) or []),
        suggestion=title_llm.get("suggestion") or None,
    )

    # find abstract word count via deterministic
    abstract_section = next(
        (s for s in sections if s.key == "abstract"),
        None,
    )
    abstract_wc = len((abstract_section.body_md or "").split()) if abstract_section else 0
    abstract = AbstractFindings(
        score=int(abstract_llm.get("score", 70)),
        has_problem=bool(abstract_llm.get("has_problem", False)),
        has_method=bool(abstract_llm.get("has_method", False)),
        has_results=bool(abstract_llm.get("has_results", False)),
        has_conclusion=bool(abstract_llm.get("has_conclusion", False)),
        word_count=abstract_wc,
        issues=list(abstract_llm.get("issues", []) or []),
    )

    c = deterministic.get("citations", {})
    citations = CitationFindings(
        score=_references_subscore(deterministic),
        inline_markers=int(c.get("inline_marker_count", 0)),
        reference_entries=int(c.get("reference_count", 0)),
        orphan_markers=list(c.get("orphan_markers", []) or []),
        uncited_entries=list(c.get("uncited_entries", []) or []),
        style_consistent=True,  # MVP: leave to LLM commentary if any
        issues=[],
    )

    literature = LiteratureFindings(
        score=int(lit_llm.get("score", 65)),
        reference_count=citations.reference_entries,
        has_gap_statement=bool(lit_llm.get("has_gap_statement", False)),
        issues=list(lit_llm.get("issues", []) or []),
    )
    methodology = MethodologyFindings(
        score=int(method_llm.get("score", 65)),
        is_reproducible=bool(method_llm.get("is_reproducible", False)),
        has_dataset_detail=bool(method_llm.get("has_dataset_detail", False)),
        issues=list(method_llm.get("issues", []) or []),
    )
    results = ResultsFindings(
        score=int(results_llm.get("score", 65)),
        has_quantitative_results=bool(results_llm.get("has_quantitative_results", False)),
        has_comparison=bool(results_llm.get("has_comparison", False)),
        realism_concern=bool(results_llm.get("realism_concern", False)),
        issues=list(results_llm.get("issues", []) or []),
    )

    f = deterministic.get("formatting", {})
    formatting = FormattingFindings(
        score=_formatting_subscore(deterministic),
        leftover_html_count=int(f.get("leftover_html_count", 0)),
        asterisk_quote_count=int(f.get("asterisk_quote_count", 0)),
        fence_wrap_count=int(f.get("fence_wrap_count", 0)),
        heading_depth_issues=[],
        issues=list(f.get("issues", []) or []),
    )

    ai_human = _ai_human_subscore(deterministic, llm)
    ai_tells = AITellFindings(
        score=ai_human,
        risk=_risk_from_score(ai_human),  # type: ignore[arg-type]
        phrase_hits=deterministic.get("ai_tells", {}).get("phrase_hits", []),
        issues=list(ai_llm.get("issues", []) or []),
    )

    # ---- overall score
    parts = {
        "structure":   _structure_subscore(deterministic),
        "abstract":    abstract.score,
        "references":  citations.score,
        "methodology": methodology.score,
        "results":     results.score,
        "novelty":     int(novelty_llm.get("score", 60)),
        "ai_human":    ai_human,
        "formatting":  formatting.score,
    }
    total_w = sum(_WEIGHTS.values())
    overall = int(round(sum(parts[k] * _WEIGHTS[k] for k in parts) / total_w))
    overall = max(0, min(100, overall))

    plagiarism_risk = _combine_plagiarism_risk(deterministic)
    decision = _decision_for(
        overall=overall,
        plag_risk=plagiarism_risk,
        ai_risk=ai_tells.risk,
        missing_count=len(deterministic.get("structure", {}).get("missing", []) or []),
    )

    publication_readiness = int(round(
        0.6 * overall + 0.2 * methodology.score + 0.2 * results.score
    ))

    # ---- improvements (LLM-supplied) — normalise priority + truncate to 8
    raw_imps = (llm.get("improvements") or [])[:8]
    improvements: list[Improvement] = []
    for r in raw_imps:
        if not isinstance(r, dict):
            continue
        improvements.append(
            Improvement(
                section_key=r.get("section_key") or None,
                priority=(r.get("priority") or "medium").lower(),  # type: ignore[arg-type]
                title=(r.get("title") or "Improvement").strip()[:120],
                detail=(r.get("detail") or "").strip()[:600],
                suggested_instruction=(r.get("suggested_instruction") or "").strip()[:600],
            )
        )

    reviewer = ReviewerNotes(
        strengths=list(reviewer_llm.get("strengths", []) or []),
        weaknesses=list(reviewer_llm.get("weaknesses", []) or []),
        required_corrections=list(reviewer_llm.get("required_corrections", []) or []),
    )

    critical_issues = list((llm.get("critical_issues") or []))
    # Promote deterministic must-fixes to critical_issues so the LLM can't bury them.
    missing = deterministic.get("structure", {}).get("missing", []) or []
    for m in missing:
        critical_issues.insert(0, f"Required section missing: {m}")
    if formatting.leftover_html_count:
        critical_issues.append(
            f"{formatting.leftover_html_count} leftover styling HTML tag(s) in section bodies"
        )

    report = AuditReport(
        overall_score=overall,
        publication_readiness=publication_readiness,
        novelty_score=int(novelty_llm.get("score", 60)),
        plagiarism_risk=plagiarism_risk,  # type: ignore[arg-type]
        ai_detection_risk=ai_tells.risk,
        decision=decision,  # type: ignore[arg-type]
        title=title,
        abstract=abstract,
        literature=literature,
        methodology=methodology,
        results=results,
        citations=citations,
        formatting=formatting,
        ai_tells=ai_tells,
        sections_present=deterministic.get("structure", {}).get("present", []),
        sections_missing=missing,
        section_findings=_section_findings(deterministic, sections),
        critical_issues=critical_issues[:12],
        improvements=improvements,
        reviewer=reviewer,
    )
    return report
