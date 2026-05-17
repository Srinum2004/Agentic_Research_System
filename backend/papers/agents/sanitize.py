"""LLM output sanitiser.

The LLM occasionally:
  - wraps content in deprecated <font ...>, <span style="...">, etc. when the
    user asks for typography (typography belongs to the export template, not
    the section body);
  - adds inline ``style="..."`` attributes;
  - opens with filler ("Sure, here is...", "In this section, we will...");
  - closes with meta-commentary ("Please review the changes.");
  - over-uses telltale AI vocabulary ("delve into", "leverage", "navigate").

This module strips those artefacts before we persist the body so the saved
markdown reads like a human wrote it.
"""
from __future__ import annotations

import re

# Styling HTML to strip outright. Keep semantic markdown (lists, tables,
# headings) and meaningful HTML (sub/sup, em, strong) intact.
_STYLE_TAG_RE = re.compile(
    r"</?(?:font|center|big|small|u|tt)\b[^>]*>",
    re.IGNORECASE,
)
# Strip inline style/face/size attributes from any tag.
_INLINE_STYLE_ATTR_RE = re.compile(
    r"\s+(?:style|face|size|color|bgcolor|align)\s*=\s*\"[^\"]*\"",
    re.IGNORECASE,
)
_INLINE_STYLE_ATTR_RE_SQUOTE = re.compile(
    r"\s+(?:style|face|size|color|bgcolor|align)\s*=\s*'[^']*'",
    re.IGNORECASE,
)
# A bare <span> with no remaining attributes can also go.
_EMPTY_SPAN_RE = re.compile(r"<span\b\s*>|</span>", re.IGNORECASE)

# Filler openers and closers (whole-line / leading-phrase patterns).
_FILLER_LEADING = [
    re.compile(r"^\s*(?:sure(?:,)?\s+)?(?:here(?:'s| is)(?: the| your)?[^\.\n]*[\.\n])", re.IGNORECASE),
    re.compile(r"^\s*(?:certainly|of course|absolutely)[!,\.]\s*", re.IGNORECASE),
    re.compile(r"^\s*(?:in this section,?\s+we\s+(?:will\s+)?(?:explore|discuss|examine|present|delve\s+into)[^\.\n]*[\.\n])", re.IGNORECASE),
    re.compile(r"^\s*(?:please\s+find\s+below[^\.\n]*[\.\n])", re.IGNORECASE),
    re.compile(r"^\s*(?:below(?:\s+is)?\s+(?:the|an?)\s+(?:updated|revised|rewritten)[^\.\n]*[\.\n])", re.IGNORECASE),
]

_FILLER_TRAILING = [
    re.compile(r"\n\s*(?:please\s+(?:review|let\s+me\s+know)[^\n]*)\s*$", re.IGNORECASE),
    re.compile(r"\n\s*(?:i\s+hope\s+this\s+helps|hope\s+this\s+helps)[^\n]*\s*$", re.IGNORECASE),
    re.compile(r"\n\s*(?:let\s+me\s+know\s+if[^\n]*)\s*$", re.IGNORECASE),
    re.compile(r"\n\s*(?:feel\s+free\s+to[^\n]*)\s*$", re.IGNORECASE),
    re.compile(r"\n\s*(?:the\s+(?:section|references|content)\s+(?:has\s+been|will\s+be)\s+updated[^\n]*)\s*$", re.IGNORECASE),
]

# Telltale AI vocabulary to nudge — case-insensitive whole-word matches.
# We only flag the worst offenders; the prompt does the heavy lifting for the rest.
_AI_TELLS = {
    r"\bdelve(?:s|d|\s+into)?\b": "examine",
    r"\bleverage(?:s|d)?\b": "use",
    r"\bnavigate(?:s|d)?\s+(?:the|a)\s+complexities?\b": "address the challenges",
    r"\btestament\s+to\b": "evidence of",
    r"\bunderscores?\b": "highlight",
    r"\bin\s+conclusion,\b": "Overall,",
    r"\bit\s+is\s+important\s+to\s+note\s+that\b": "Note that",
    r"\bcrucial(?:ly)?\b": "important",
    r"\bmyriad\s+of\b": "many",
}
_AI_TELL_RES = {re.compile(p, re.IGNORECASE): repl for p, repl in _AI_TELLS.items()}

# Markdown asterisk noise around link/title clusters that the LLM emits in
# references, like *"Title,"* — we want plain text or proper italics, not
# the literal asterisks visible in the output.
_ASTERISK_QUOTE_RE = re.compile(r'\*"([^"]+),?"\*')


def _strip_fenced_code_wrapper(text: str) -> str:
    """If the whole response is wrapped in ```...``` strip the fence — the
    LLM sometimes wraps section bodies in a markdown fence by mistake."""
    stripped = text.strip()
    if stripped.startswith("```") and stripped.endswith("```"):
        inner = stripped[3:-3]
        # drop optional language tag on the first line
        if "\n" in inner:
            first, rest = inner.split("\n", 1)
            if first.strip().isalnum() or first.strip() in {"md", "markdown", "html"}:
                return rest.strip()
        return inner.strip()
    return text


def sanitise_section_body(text: str) -> str:
    """Clean an LLM-produced section body before persisting it."""
    if not text:
        return ""

    out = _strip_fenced_code_wrapper(text)

    # Strip styling HTML and inline style attrs.
    out = _STYLE_TAG_RE.sub("", out)
    out = _INLINE_STYLE_ATTR_RE.sub("", out)
    out = _INLINE_STYLE_ATTR_RE_SQUOTE.sub("", out)
    out = _EMPTY_SPAN_RE.sub("", out)

    # Soften AI-vocabulary tells.
    for pat, repl in _AI_TELL_RES.items():
        out = pat.sub(repl, out)

    # *"Title,"* → "Title,"
    out = _ASTERISK_QUOTE_RE.sub(r'"\1"', out)

    # Strip filler openers (loop until no leading match left).
    changed = True
    while changed:
        changed = False
        for pat in _FILLER_LEADING:
            new = pat.sub("", out, count=1)
            if new != out:
                out = new
                changed = True

    # Strip filler closers.
    for pat in _FILLER_TRAILING:
        out = pat.sub("", out)

    return out.strip()
