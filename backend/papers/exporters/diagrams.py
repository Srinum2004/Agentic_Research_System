"""Server-side mermaid → SVG via Kroki, for embedding in PDF/DOCX exports.

WeasyPrint and python-docx don't run JavaScript, so the browser-side mermaid
library can't help here. We POST each mermaid block to a local Kroki service
(see docker-compose) and get back an SVG string that we splice into the
generated HTML.
"""
from __future__ import annotations

import os
import re
from typing import Optional

import requests


# Same sanitizer as the frontend MermaidBlock — LLMs commonly emit
# `-->|label|>` (invalid) instead of `-->|label|` (valid).
_PIPE_GT_RE = re.compile(r"\|>+")
_DASH_RUNAWAY_RE = re.compile(r"(--+)>{2,}")
_EQ_RUNAWAY_RE = re.compile(r"(={2,})>{2,}")
_LEADING_HDR_RE = re.compile(r"^\s*mermaid\s*\n", re.IGNORECASE)


def sanitize_mermaid(src: str) -> str:
    out = src or ""
    out = _PIPE_GT_RE.sub("|", out)
    out = _DASH_RUNAWAY_RE.sub(r"\1>", out)
    out = _EQ_RUNAWAY_RE.sub(r"\1>", out)
    out = _LEADING_HDR_RE.sub("", out)
    return out


# Forces Mermaid to render labels as native SVG <text> elements instead of
# <foreignObject> + HTML. WeasyPrint (used by the PDF exporter) cannot paint
# <foreignObject>, which is why diagrams in the exported PDF show empty boxes.
_MERMAID_NATIVE_TEXT_INIT = (
    '%%{init: {"flowchart": {"htmlLabels": false}, '
    '"classDiagram": {"htmlLabels": false}, '
    '"sequence": {"htmlLabels": false}, '
    '"themeVariables": {"fontFamily": "Liberation Sans, Arial, sans-serif"}}}%%'
)


def _ensure_native_text(src: str) -> str:
    """Prepend the native-text init directive unless the user already supplied
    a custom %%{init: ...}%% line (don't fight their config)."""
    if not src:
        return src
    if re.search(r"%%\{\s*init\s*:", src):
        return src
    return _MERMAID_NATIVE_TEXT_INIT + "\n" + src


# Kroki's bundled Mermaid emits node labels inside <foreignObject> (HTML), which
# WeasyPrint cannot render — the boxes show up but text is invisible. We
# post-process the SVG to replace every <foreignObject> with a native <text>
# element so WeasyPrint paints the label.
_FOREIGN_OBJECT_RE = re.compile(
    r"<foreignObject\b([^>]*)>(.*?)</foreignObject>",
    re.DOTALL,
)
_ATTR_RE = re.compile(r'(\w[\w-]*)\s*=\s*"([^"]*)"')
_TAG_STRIP_RE = re.compile(r"<[^>]+>")
_BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)


def _foreign_object_to_text(svg: str) -> str:
    """Replace every <foreignObject> in an SVG with a centered <text> node
    carrying the inner HTML's text content."""

    def repl(match: re.Match) -> str:
        attrs = dict(_ATTR_RE.findall(match.group(1)))
        try:
            w = float(attrs.get("width", "0") or 0)
            h = float(attrs.get("height", "0") or 0)
        except ValueError:
            w = h = 0.0

        inner = match.group(2)
        # Treat <br> as a line break, then strip remaining HTML tags.
        inner = _BR_RE.sub("\n", inner)
        text = _TAG_STRIP_RE.sub(" ", inner)
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        if not lines:
            return ""

        def esc(s: str) -> str:
            return (
                s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            )

        cx = w / 2.0
        # Vertical: distribute lines around the box center.
        line_height = 13
        total = line_height * len(lines)
        start_y = (h - total) / 2.0 + line_height * 0.8

        if len(lines) == 1:
            return (
                f'<text x="{cx:.2f}" y="{h / 2 + 4:.2f}" '
                f'text-anchor="middle" '
                f'font-family="Liberation Sans, Arial, sans-serif" '
                f'font-size="11" fill="#1a1a1a">{esc(lines[0])}</text>'
            )

        tspans = "".join(
            f'<tspan x="{cx:.2f}" dy="{(0 if i == 0 else line_height):.2f}">{esc(line)}</tspan>'
            for i, line in enumerate(lines)
        )
        return (
            f'<text x="{cx:.2f}" y="{start_y:.2f}" '
            f'text-anchor="middle" '
            f'font-family="Liberation Sans, Arial, sans-serif" '
            f'font-size="11" fill="#1a1a1a">{tspans}</text>'
        )

    return _FOREIGN_OBJECT_RE.sub(repl, svg)


def mermaid_to_svg(code: str, timeout: float = 8.0) -> Optional[str]:
    """Render a single mermaid diagram to inline SVG via Kroki.

    Returns the SVG string (root element starts with ``<svg``) on success,
    or None if Kroki is unreachable / rejects the diagram. Callers should
    fall back to keeping the raw code block in that case.
    """
    base = os.getenv("KROKI_URL", "http://kroki:8000").rstrip("/")
    sanitized = _ensure_native_text(sanitize_mermaid(code).strip())
    if not sanitized:
        return None
    try:
        resp = requests.post(
            f"{base}/mermaid/svg",
            data=sanitized.encode("utf-8"),
            headers={"Content-Type": "text/plain"},
            timeout=timeout,
        )
    except requests.RequestException:
        return None
    if resp.status_code != 200 or not resp.text.lstrip().startswith("<svg"):
        return None
    return _foreign_object_to_text(resp.text)


# Matches a fenced mermaid block:  ```mermaid\n ... \n```
_MERMAID_BLOCK_RE = re.compile(
    r"```mermaid\s*\n(.*?)\n```",
    re.DOTALL | re.IGNORECASE,
)


def render_mermaid_in_markdown(md_text: str) -> str:
    """Replace each ```mermaid``` block with an inline SVG figure.

    The SVG is wrapped in a ``<div class="mermaid-svg">`` so the markdown
    library treats it as a raw HTML block (when ``md_in_html`` or similar
    is enabled, or when the SVG is allowed through fenced_code escape).
    Blocks that fail to render are left as-is so the user still sees the
    source.
    """
    def repl(match: re.Match) -> str:
        code = match.group(1)
        svg = mermaid_to_svg(code)
        if not svg:
            # Keep the original fenced block so the user can still see the
            # mermaid source in the export.
            return match.group(0)
        # Strip XML declaration if present — WeasyPrint handles bare <svg>.
        svg = re.sub(r"^\s*<\?xml[^>]*\?>\s*", "", svg)
        return (
            "\n\n<div class=\"mermaid-svg\">\n"
            + svg
            + "\n</div>\n\n"
        )

    return _MERMAID_BLOCK_RE.sub(repl, md_text or "")
