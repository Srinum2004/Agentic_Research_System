"""Paper format presets — loads canonical templates (IEEE, ACM, Elsevier, APA)
from JSON files so the intake/template flow uses deterministic structures
instead of asking the LLM to invent them.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

_TEMPLATES_DIR = Path(__file__).parent / "templates"

# Order matters — first listed is shown first in the picker chips.
PRESET_KEYS: list[str] = [
    "ieee_conference",
    "acm_article",
    "elsevier_journal",
    "apa_thesis",
]


def _load_all() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for key in PRESET_KEYS:
        path = _TEMPLATES_DIR / f"{key}.json"
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as fp:
            data = json.load(fp)
        if data.get("key") != key:
            data["key"] = key
        out[key] = data
    return out


_PRESETS: dict[str, dict[str, Any]] = _load_all()


def list_presets() -> list[dict[str, Any]]:
    """Return the metadata for every preset (no sections payload)."""
    summary = []
    for key in PRESET_KEYS:
        p = _PRESETS.get(key)
        if not p:
            continue
        summary.append(
            {
                "key": p["key"],
                "name": p.get("name", key),
                "description": p.get("description", ""),
                "citation_style": p.get("citation_style", ""),
                "paper_type": p.get("paper_type", ""),
                "num_sections": int(p.get("num_sections") or len(p.get("sections", []))),
                "include_tables": bool(p.get("include_tables", True)),
                "include_figures": bool(p.get("include_figures", True)),
                "default_journal_type": p.get("default_journal_type", ""),
            }
        )
    return summary


def load_preset(key: str) -> dict[str, Any] | None:
    """Return a deep copy of the preset so callers can mutate freely."""
    preset = _PRESETS.get(key)
    if not preset:
        return None
    return copy.deepcopy(preset)


def resolve_format_alias(value: str | None) -> str | None:
    """Map common aliases / display names back to a canonical preset key.

    Lets the intake LLM say 'IEEE' / 'ACM' / 'Elsevier' / 'APA' and have it
    resolve to the right preset key.
    """
    if not value:
        return None
    v = value.strip().lower().replace("-", "_").replace(" ", "_")
    if v in _PRESETS:
        return v
    # Substring aliases
    aliases = {
        "ieee_conference": ("ieee", "ieee_conf", "ieee_journal", "ieee_transactions"),
        "acm_article": ("acm", "sigconf", "acmart", "acm_journal", "acm_conference"),
        "elsevier_journal": ("elsevier", "sciencedirect", "esa", "imrad"),
        "apa_thesis": ("apa", "apa7", "thesis", "psychology"),
    }
    for canonical, hints in aliases.items():
        if v == canonical:
            return canonical
        for h in hints:
            if h in v:
                return canonical
    return None
