"""Template node — loads the chosen preset's deterministic section skeleton and
asks the LLM to fill ONLY the topic-specific placeholder paragraphs + suggest a
publishable title. Structure (section keys/titles/order/guidance) is frozen by
the preset, so output is reproducible for the same inputs.
"""
from __future__ import annotations

import copy
import json
from typing import Any

from ..llm import get_llm
from ..prompts import TOPIC_TAILORING_PROMPT
from ..state import PaperState
from ...presets import load_preset
from .intake import _extract_json


def _slugify(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "_":
            out.append("_")
    return "".join(out).strip("_") or "section"


def _normalize_section(spec: dict[str, Any], fallback_order: int) -> dict[str, Any]:
    title = (spec.get("title") or spec.get("name") or f"Section {fallback_order}").strip()
    key = spec.get("key") or _slugify(title)
    return {
        "key": key,
        "title": title,
        "order": int(spec.get("order") or fallback_order),
        "purpose": spec.get("purpose", ""),
        "word_limit": spec.get("word_limit", ""),
        "what_to_include": spec.get("what_to_include", []) or [],
        "common_mistakes": spec.get("common_mistakes", []) or [],
        "placeholder": spec.get("placeholder", ""),
        "formatting_notes": spec.get("formatting_notes", ""),
        "citation_example": spec.get("citation_example", ""),
    }


def _section_list_text(sections: list[dict[str, Any]]) -> str:
    lines = []
    for s in sections:
        lines.append(f"- {s['key']}: {s['title']} — {s.get('purpose', '')[:120]}")
    return "\n".join(lines)


def template_node(state: PaperState) -> PaperState:
    fmt = state.get("paper_format") or ""
    preset = load_preset(fmt)
    if not preset or not preset.get("sections"):
        state["assistant_reply"] = (
            "I couldn't load that format preset. Please pick one of "
            "IEEE Conference, ACM Article, Elsevier Journal, or APA Thesis."
        )
        state["template"] = []
        return state

    # Step 1 — deterministic skeleton from the preset.
    raw_sections = copy.deepcopy(preset["sections"])
    sections = [_normalize_section(s, i) for i, s in enumerate(raw_sections, start=1)]
    sections.sort(key=lambda s: s["order"])

    # Step 2 — ask the LLM only for a title + per-section topic placeholders.
    llm = get_llm(temperature=0.3)
    prompt = TOPIC_TAILORING_PROMPT.format(
        preset_name=preset.get("name", fmt),
        topic=state.get("topic", ""),
        domain=state.get("domain", ""),
        citation_style=state.get("citation_style", preset.get("citation_style", "")),
        journal_type=state.get("journal_type", preset.get("default_journal_type", "")),
        section_list=_section_list_text(sections),
    )
    try:
        response = llm.invoke(prompt)
        data = _extract_json(response.content)
    except Exception:
        data = {}

    placeholders = {p.get("key"): p.get("placeholder", "") for p in (data.get("placeholders") or []) if p.get("key")}
    for sec in sections:
        ph = placeholders.get(sec["key"])
        if ph:
            sec["placeholder"] = ph

    title = (data.get("title_suggestion") or state.get("topic") or "Untitled Paper").strip()

    state["template"] = sections
    state["title"] = title
    state["assistant_reply"] = (
        f"Template generated from the {preset.get('name', fmt)} preset — "
        f"{len(sections)} sections ready. Opening canvas."
    )
    return state
