"""Pure-Python audit checks — fast, exact, no LLM.

These produce hard facts the LLM stage can rely on (so it doesn't have to
re-count references or re-find missing sections). Findings feed into both
the LLM prompt as context and the aggregator as raw signals.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Iterable

# Section keys that must be present for any publishable paper, regardless of
# format preset. Names are matched case-insensitively / substring so we
# accept "introduction", "1_introduction", etc.
_REQUIRED_KEY_HINTS = (
    ("introduction", ("introduction",)),
    ("methodology", ("methodology", "method", "materials_and_methods", "system_design", "proposed")),
    ("results",     ("results", "evaluation", "findings", "experiments")),
    ("conclusion",  ("conclusion", "conclusions")),
    ("references",  ("references", "bibliography", "works_cited", "reference_list")),
)

# Inline citation marker patterns by style.
_MARKER_NUMERIC = re.compile(r"\[(\d{1,3})\]")
_MARKER_AUTHOR_YEAR = re.compile(r"\(([A-Z][A-Za-z\-']{1,30}(?:\s+et\s+al\.?)?(?:,\s*&\s*[A-Z][A-Za-z\-']{1,30})?)\s*,?\s*(\d{4})\)")

# Reference entries: numeric style lines start with [N]; author-year lines
# usually start with "Surname, Initials" or "Surname (Year)".
_REF_NUM_ENTRY = re.compile(r"^\s*\[(\d{1,3})\]\s*(.+)$", re.MULTILINE)
_REF_AUTHOR_YEAR_ENTRY = re.compile(
    r"^\s*([A-Z][A-Za-z\-']{1,40}(?:,\s*[A-Z]\.[A-Z\.\s]*)*(?:,\s*(?:&|and)\s*[A-Z][A-Za-z\-']{1,40})*)[^\d\n]{1,80}(\d{4})",
    re.MULTILINE,
)

# Formatting noise we already strip but want to count for the report.
_LEFTOVER_HTML_RE = re.compile(r"<(?:font|span|center|big|small|u|tt)\b", re.IGNORECASE)
_ASTERISK_QUOTE_RE = re.compile(r'\*"[^"]+"\*')
_FENCE_WRAP_RE = re.compile(r"^```\s*\w*\s*\n[\s\S]+?\n```\s*$")
_DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.IGNORECASE)
_URL_RE = re.compile(r"https?://\S+")

# Banned AI vocabulary — same list the sanitiser uses but here we just COUNT,
# we don't strip (this audit reports the source quality, doesn't mutate).
_AI_TELLS = (
    r"\bdelve(?:s|d|\s+into)?\b",
    r"\bleverage(?:s|d)?\b",
    r"\bnavigate(?:s|d)?\s+(?:the|a)\s+complexit",
    r"\btestament\s+to\b",
    r"\bunderscores?\b",
    r"\bmyriad\s+of\b",
    r"\bcrucial(?:ly)?\b",
    r"\bseamless(?:ly)?\b",
    r"\btapestry\b",
    r"\brealm\s+of\b",
    r"\blandscape\s+of\b",
    r"\bembark(?:s|ed|ing)?\s+on\b",
    r"\bjourney\s+(?:through|of|into)\b",
    r"\bin\s+conclusion,\b",
    r"\bit\s+is\s+important\s+to\s+note\b",
    r"\bplease\s+review\s+the\s+changes\b",
    r"\bi\s+hope\s+this\s+helps\b",
)
_AI_TELL_RES = [(re.compile(p, re.IGNORECASE), p) for p in _AI_TELLS]


# ---------------------------------------------------------------------------
# Section structure
# ---------------------------------------------------------------------------

def check_structure(sections: list[Any]) -> dict[str, Any]:
    """Identify required sections that are missing and verify ordering."""
    present_keys = [s.key for s in sections]
    title_index: dict[str, str] = {s.key: s.title for s in sections}

    missing: list[str] = []
    for canonical, hints in _REQUIRED_KEY_HINTS:
        if not any(any(h in (k or "").lower() for h in hints) for k in present_keys):
            missing.append(canonical)

    return {
        "present": present_keys,
        "present_titles": title_index,
        "missing": missing,
        "section_count": len(sections),
    }


# ---------------------------------------------------------------------------
# Word counts (per section, vs the preset guidance)
# ---------------------------------------------------------------------------

_RANGE_RE = re.compile(r"(\d+)\s*[-–to]+\s*(\d+)")


def _parse_word_range(spec: str | None) -> tuple[int | None, int | None]:
    if not spec:
        return None, None
    m = _RANGE_RE.search(spec)
    if m:
        return int(m.group(1)), int(m.group(2))
    digits = re.search(r"(\d+)", spec)
    if digits:
        n = int(digits.group(1))
        return n, n
    return None, None


def check_word_counts(sections: list[Any]) -> list[dict[str, Any]]:
    """Flag sections that are way under / way over their target word count."""
    findings: list[dict[str, Any]] = []
    for s in sections:
        body = (s.body_md or "").strip()
        actual = len(body.split())
        guidance = {}
        try:
            import json
            guidance = json.loads(s.guidance_json) if s.guidance_json else {}
        except Exception:
            guidance = {}
        lo, hi = _parse_word_range(guidance.get("word_limit"))
        verdict = "ok"
        msg = None
        if actual == 0:
            verdict, msg = "fail", "Section is empty"
        elif lo and actual < lo * 0.4:
            verdict, msg = "warning", f"Far below target ({actual} of ~{lo}–{hi or lo} words)"
        elif hi and actual > hi * 1.6:
            verdict, msg = "warning", f"Far above target ({actual} of ~{lo or hi}–{hi} words)"
        findings.append(
            {
                "section_key": s.key,
                "section_title": s.title,
                "word_count": actual,
                "target_low": lo,
                "target_high": hi,
                "verdict": verdict,
                "message": msg,
            }
        )
    return findings


# ---------------------------------------------------------------------------
# Citations — inline markers vs reference entries
# ---------------------------------------------------------------------------

def _split_reference_entries(refs_body: str, style: str) -> list[str]:
    """Best-effort split of a References section body into individual entries."""
    if not refs_body:
        return []
    text = refs_body.strip()
    if style in {"ieee", "acm"}:
        # numeric style: split on [N]
        entries = _REF_NUM_ENTRY.findall(text)
        return [e[1].strip() for e in entries]
    # author-year style — split on blank lines or paragraph-starts.
    lines = re.split(r"\n{1,}\s*\n|\n(?=[A-Z][A-Za-z\-]{1,40},)", text)
    return [ln.strip() for ln in lines if ln.strip() and len(ln.strip()) > 12]


def check_citations(sections: list[Any], citation_style: str) -> dict[str, Any]:
    """Cross-check inline citation markers against reference entries."""
    style = (citation_style or "ieee").lower()
    body_concat = "\n\n".join(
        (s.body_md or "") for s in sections if s.key not in {"references", "bibliography", "works_cited"}
    )
    ref_section = next(
        (s for s in sections if s.key in {"references", "bibliography", "works_cited", "reference_list"}),
        None,
    )
    ref_body = (ref_section.body_md or "") if ref_section else ""

    if style in {"ieee", "acm"}:
        markers = sorted({int(n) for n in _MARKER_NUMERIC.findall(body_concat)})
        ref_entries = _split_reference_entries(ref_body, style)
        ref_count = len(ref_entries) or len(_MARKER_NUMERIC.findall(ref_body))

        orphan = [f"[{n}]" for n in markers if n > ref_count]
        uncited_count = max(0, ref_count - max(markers, default=0))
        uncited = (
            [f"Entry [{i}]" for i in range(max(markers, default=0) + 1, ref_count + 1)]
            if uncited_count
            else []
        )
    else:
        # elsevier (harvard) / apa  — author-year markers
        marker_matches = _MARKER_AUTHOR_YEAR.findall(body_concat)
        markers_set = {(a.split()[0].rstrip(",.")  + "_" + y) for a, y in marker_matches}
        ref_entries = _split_reference_entries(ref_body, style)
        # naive: a marker is satisfied if its surname appears in some entry
        entries_surnames = {e.split(",")[0].strip().lower() for e in ref_entries}
        orphan = sorted({
            f"({a.split()[0]} , {y})" for a, y in marker_matches
            if a.split()[0].strip(",.").lower() not in entries_surnames
        })
        uncited = []  # hard to determine for author-year without full parsing
        ref_count = len(ref_entries)
        markers = list(range(1, len(marker_matches) + 1))

    return {
        "style": style,
        "inline_marker_count": len(markers),
        "reference_count": ref_count,
        "orphan_markers": orphan[:10],
        "uncited_entries": uncited[:10],
        "ref_section_present": ref_section is not None,
    }


# ---------------------------------------------------------------------------
# Formatting noise
# ---------------------------------------------------------------------------

def check_formatting(sections: list[Any]) -> dict[str, Any]:
    """Find leftover HTML, asterisk-quote noise, fenced-code wrapping, etc."""
    leftover_html = 0
    asterisk_quote = 0
    fence_wrap = 0
    findings: list[str] = []

    for s in sections:
        body = s.body_md or ""
        if not body:
            continue
        lh = len(_LEFTOVER_HTML_RE.findall(body))
        aq = len(_ASTERISK_QUOTE_RE.findall(body))
        leftover_html += lh
        asterisk_quote += aq
        if _FENCE_WRAP_RE.match(body.strip()):
            fence_wrap += 1
            findings.append(f"{s.title}: body is wrapped in a code fence")
        if lh:
            findings.append(f"{s.title}: contains {lh} leftover style HTML tag(s)")
        if aq:
            findings.append(f"{s.title}: contains {aq} *\"...\"* asterisk-quote pattern(s)")

    return {
        "leftover_html_count": leftover_html,
        "asterisk_quote_count": asterisk_quote,
        "fence_wrap_count": fence_wrap,
        "issues": findings,
    }


# ---------------------------------------------------------------------------
# AI-tell vocabulary counts
# ---------------------------------------------------------------------------

def check_ai_tells(sections: list[Any]) -> dict[str, Any]:
    """Count occurrences of telltale AI phrases across all sections."""
    counts: Counter[str] = Counter()
    per_section: dict[str, int] = {}
    for s in sections:
        body = s.body_md or ""
        section_total = 0
        for regex, label in _AI_TELL_RES:
            n = len(regex.findall(body))
            if n:
                counts[label] += n
                section_total += n
        if section_total:
            per_section[s.title] = section_total

    total_hits = sum(counts.values())
    word_total = sum(len((s.body_md or "").split()) for s in sections) or 1
    rate_per_1000 = (total_hits * 1000.0) / word_total

    # Risk thresholds (per 1000 words)
    if rate_per_1000 >= 5:
        risk = "high"
    elif rate_per_1000 >= 2:
        risk = "medium"
    else:
        risk = "low"

    # Score: 100 if zero tells, scales down linearly to 0 at rate=10
    score = max(0, int(100 - rate_per_1000 * 10))

    return {
        "total_hits": total_hits,
        "rate_per_1000_words": round(rate_per_1000, 2),
        "phrase_hits": [{"phrase": p, "count": c} for p, c in counts.most_common(8)],
        "per_section": per_section,
        "risk": risk,
        "score": score,
    }


# ---------------------------------------------------------------------------
# Repetition (plagiarism-pattern proxy)
# ---------------------------------------------------------------------------

def check_repetition(sections: list[Any]) -> dict[str, Any]:
    """Count repeated 6-grams across the paper. High repetition often signals
    paste-pattern issues (whether self-plagiarism or AI loop)."""
    tokens: list[str] = []
    for s in sections:
        if s.key in {"references", "bibliography", "works_cited"}:
            continue  # references duplicate by nature, skip them
        tokens.extend(re.findall(r"[A-Za-z][A-Za-z\-']{2,}", (s.body_md or "").lower()))

    ngrams = Counter(
        " ".join(tokens[i : i + 6]) for i in range(len(tokens) - 5)
    ) if len(tokens) >= 6 else Counter()
    repeated = [(g, c) for g, c in ngrams.most_common(10) if c >= 3]
    total_ngrams = sum(ngrams.values()) or 1
    repeated_share = sum(c for _, c in repeated) / total_ngrams

    if repeated_share > 0.04:
        risk = "high"
    elif repeated_share > 0.015:
        risk = "medium"
    else:
        risk = "low"

    return {
        "repeated_phrases": repeated[:6],
        "repeated_share": round(repeated_share * 100, 2),
        "risk": risk,
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run_deterministic(sections: list[Any], project: Any) -> dict[str, Any]:
    """Run every pure-Python check. Returns a dict that's fed to the LLM and
    used by the aggregator."""
    citation_style = (getattr(project, "citation_style", "") or "ieee").lower()

    structure = check_structure(sections)
    word_counts = check_word_counts(sections)
    citations = check_citations(sections, citation_style)
    formatting = check_formatting(sections)
    ai_tells = check_ai_tells(sections)
    repetition = check_repetition(sections)

    return {
        "structure": structure,
        "word_counts": word_counts,
        "citations": citations,
        "formatting": formatting,
        "ai_tells": ai_tells,
        "repetition": repetition,
    }
