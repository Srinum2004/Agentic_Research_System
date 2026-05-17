"""Citation formatter — turns raw source dumps into a styled References section."""
from __future__ import annotations

from ..llm import get_llm
from ..prompts import CITATION_FORMAT_PROMPT


def format_references(raw_sources: str, citation_style: str) -> str:
    llm = get_llm(temperature=0.0)
    response = llm.invoke(
        CITATION_FORMAT_PROMPT.format(
            citation_style=citation_style or "ieee",
            raw_sources=raw_sources[:8000],
        )
    )
    return response.content.strip()
