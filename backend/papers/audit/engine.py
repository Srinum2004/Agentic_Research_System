"""Examine Engine orchestrator — wires the deterministic + LLM stages and
hands the merged result to the aggregator.

Supports an optional ``on_stage`` callback so the router can stream
fine-grained progress events to the browser. Stages emitted, in order:

    structure → references → word_counts → formatting → ai_tells →
    repetition → llm_judging → aggregating → done

The callback receives ``(stage_id, label)``. ``done`` fires last with the
final report attached separately by the router.
"""
from __future__ import annotations

from typing import Any, Callable, Optional

from .aggregator import aggregate
from .deterministic import (
    check_ai_tells,
    check_citations,
    check_formatting,
    check_repetition,
    check_structure,
    check_word_counts,
)
from .llm_checks import run_llm_judgement
from .schema import AuditReport


StageCb = Callable[[str, str], None]


def _emit(cb: Optional[StageCb], stage: str, label: str) -> None:
    if cb is not None:
        try:
            cb(stage, label)
        except Exception:
            pass  # callback failures must not abort the audit


def run_audit(
    project: Any,
    sections: list[Any],
    on_stage: Optional[StageCb] = None,
) -> AuditReport:
    """Run the full audit pipeline and return a strict AuditReport."""
    # ---- deterministic stage (fast)
    _emit(on_stage, "structure", "Analysing section structure")
    structure = check_structure(sections)

    _emit(on_stage, "references", "Cross-checking citations and references")
    citations = check_citations(sections, (getattr(project, "citation_style", "") or "ieee").lower())

    _emit(on_stage, "word_counts", "Measuring section lengths against targets")
    word_counts = check_word_counts(sections)

    _emit(on_stage, "formatting", "Scanning for formatting issues")
    formatting = check_formatting(sections)

    _emit(on_stage, "ai_tells", "Detecting AI-generated writing patterns")
    ai_tells = check_ai_tells(sections)

    _emit(on_stage, "repetition", "Checking phrase repetition")
    repetition = check_repetition(sections)

    deterministic = {
        "structure": structure,
        "citations": citations,
        "word_counts": word_counts,
        "formatting": formatting,
        "ai_tells": ai_tells,
        "repetition": repetition,
    }

    # ---- LLM stage (slow — typically 12-25s)
    _emit(on_stage, "llm_judging", "Running 8-dimension reviewer simulation")
    llm = run_llm_judgement(project, sections, deterministic)
    if llm.get("_error"):
        # LLM call itself failed (rate limit, network, etc.). Surface the
        # cause in the report so the user understands the partial result.
        llm = {
            "critical_issues": [f"Reviewer simulation unavailable: {llm['_error']}"]
        }
    elif not llm:
        llm = {
            "critical_issues": [
                "Reviewer simulation returned no parseable JSON — scores are approximate."
            ]
        }

    # ---- merge
    _emit(on_stage, "aggregating", "Compiling report")
    report = aggregate(project, sections, deterministic, llm)
    _emit(on_stage, "done", "Audit complete")
    return report
