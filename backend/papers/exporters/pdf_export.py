"""PDF exporter — markdown → HTML (markdown lib) → PDF (WeasyPrint).

Each of the four paper formats (IEEE, ACM, Elsevier, APA) has its own builder
and CSS so the exported PDF actually matches the real-world style:

  - IEEE Conference   →  A4, two-column body, 10pt serif, Roman section nums
  - ACM Article       →  A4, two-column body, 9.5pt serif, arabic nums, CCS
  - Elsevier Journal  →  A4, single column, 11pt serif, 1.5 leading, wide margins
  - APA Thesis        →  Letter, single column, 12pt serif, double-spaced,
                         separate title page

Mermaid code blocks are converted to inline SVG via Kroki and post-processed
so labels render as native <text> (WeasyPrint cannot paint <foreignObject>).
"""
from __future__ import annotations

import markdown as md_lib
from weasyprint import HTML

from db import PaperProject, PaperSection

from .diagrams import render_mermaid_in_markdown


# ---------------------------------------------------------------------------
# Shared CSS — typography rules common to every format. Format-specific CSS
# below overrides whatever it needs.
# ---------------------------------------------------------------------------
_COMMON_CSS = """
  * { box-sizing: border-box; }
  body { color: #1a1a1a; }
  table { border-collapse: collapse; margin: 0.8em 0; width: 100%; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  code, pre { font-family: "Liberation Mono", Menlo, monospace; }
  pre { background: #f6f6f6; padding: 8px; border-radius: 4px; overflow: hidden; }
  img { max-width: 100%; }
  .mermaid-svg { text-align: center; margin: 1em 0; page-break-inside: avoid; break-inside: avoid; }
  .mermaid-svg svg { max-width: 100%; height: auto; }
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _section_md(section: PaperSection, *, numbered: bool = True) -> str:
    """Markdown for a single section: `## N. Title` + body."""
    body = (section.body_md or "").strip() or "_(section pending)_"
    if numbered:
        return f"\n## {section.order}. {section.title}\n\n{body}\n"
    return f"\n## {section.title}\n\n{body}\n"


def _meta_line(project: PaperProject) -> str:
    bits = []
    if project.domain:
        bits.append(f"**Domain:** {project.domain}")
    if project.paper_type:
        bits.append(f"**Type:** {project.paper_type}")
    if project.journal_type:
        bits.append(f"**Target venue:** {project.journal_type}")
    if project.citation_style:
        bits.append(f"**Citation style:** {project.citation_style.upper()}")
    return " · ".join(bits)


def _md_to_html(md_text: str) -> str:
    rendered = render_mermaid_in_markdown(md_text)
    return md_lib.markdown(
        rendered,
        extensions=["tables", "fenced_code", "toc", "md_in_html"],
    )


def _wrap(css: str, html_body: str) -> bytes:
    html = (
        f"<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{_COMMON_CSS}{css}</style></head>"
        f"<body>{html_body}</body></html>"
    )
    return HTML(string=html).write_pdf()


# ---------------------------------------------------------------------------
# IEEE Conference — A4, two-column body, full-width header
# ---------------------------------------------------------------------------
_IEEE_HEADER_KEYS = {"title_page", "abstract", "keywords", "index_terms"}

_IEEE_CSS = """
  @page { size: A4; margin: 18mm 14mm; }
  body {
    font-family: "Liberation Serif", "Times New Roman", Times, serif;
    font-size: 10pt;
    line-height: 1.38;
  }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 0.5em 0; }
  h2 { font-size: 11pt; margin-top: 1.1em; margin-bottom: 0.4em; }
  h3 { font-size: 10.5pt; }
  table th, table td { font-size: 9pt; padding: 3px 5px; }

  .ieee-header { margin-bottom: 6mm; }
  .ieee-header h1 { text-align: center; }
  .ieee-header h2 { font-style: italic; font-size: 10.5pt; text-align: left; }
  .ieee-header p { text-align: justify; }

  .ieee-body {
    column-count: 2;
    column-gap: 6mm;
    column-fill: balance;
    text-align: justify;
    hyphens: auto;
  }
  .ieee-body h2, .ieee-body h3 { break-after: avoid; }
  .ieee-body figure, .ieee-body table, .ieee-body pre, .ieee-body .mermaid-svg {
    break-inside: avoid; page-break-inside: avoid;
  }
"""


def _build_ieee_pdf(project: PaperProject, sections: list[PaperSection]) -> bytes:
    title = project.title or "Untitled Paper"
    meta = _meta_line(project)

    header_sections = [s for s in sections if s.key in _IEEE_HEADER_KEYS]
    body_sections = [s for s in sections if s.key not in _IEEE_HEADER_KEYS]

    header_md = [f"# {title}\n"]
    if meta:
        header_md.append(meta + "\n")
    header_md.extend(_section_md(s) for s in header_sections)
    header_md_text = "\n".join(header_md)
    body_md = "\n".join(_section_md(s) for s in body_sections)

    html_body = (
        f'<div class="ieee-header">{_md_to_html(header_md_text)}</div>'
        f'<div class="ieee-body">{_md_to_html(body_md)}</div>'
    )
    return _wrap(_IEEE_CSS, html_body)


# ---------------------------------------------------------------------------
# ACM Article — A4, two-column body, CCS block full-width with header
# ---------------------------------------------------------------------------
_ACM_HEADER_KEYS = {"title_page", "abstract", "keywords", "ccs_concepts"}

_ACM_CSS = """
  @page { size: A4; margin: 18.4mm 18mm; }
  body {
    font-family: "Linux Libertine", "Liberation Serif", "Times New Roman", serif;
    font-size: 9.5pt;
    line-height: 1.3;
  }
  h1 { font-size: 17pt; text-align: center; margin: 0 0 0.5em 0; font-weight: 700; }
  h2 { font-size: 10.5pt; margin-top: 1em; margin-bottom: 0.3em; font-weight: 700; }
  h3 { font-size: 10pt; font-weight: 600; }
  table th, table td { font-size: 8.5pt; padding: 3px 5px; }

  .acm-header { margin-bottom: 5mm; }
  .acm-header h1 { text-align: center; }
  .acm-header h2 { font-size: 10pt; }
  .acm-header p { text-align: justify; }
  .acm-header .acm-reference-format {
    border-top: 1px solid #999; padding-top: 6px; font-size: 8.5pt; color: #444;
    margin-top: 1em;
  }

  .acm-body {
    column-count: 2;
    column-gap: 5mm;
    column-fill: balance;
    text-align: justify;
    hyphens: auto;
  }
  .acm-body h2, .acm-body h3 { break-after: avoid; }
  .acm-body figure, .acm-body table, .acm-body pre, .acm-body .mermaid-svg {
    break-inside: avoid; page-break-inside: avoid;
  }
"""


def _build_acm_pdf(project: PaperProject, sections: list[PaperSection]) -> bytes:
    title = project.title or "Untitled Paper"
    meta = _meta_line(project)

    header_sections = [s for s in sections if s.key in _ACM_HEADER_KEYS]
    body_sections = [s for s in sections if s.key not in _ACM_HEADER_KEYS]

    header_md = [f"# {title}\n"]
    if meta:
        header_md.append(meta + "\n")
    header_md.extend(_section_md(s) for s in header_sections)
    header_md_text = "\n".join(header_md)

    acm_ref_block = (
        '<div class="acm-reference-format">'
        '<strong>ACM Reference Format:</strong> '
        f'{project.title or "Untitled Paper"}. {project.journal_type or "Proc. ACM."}'
        '</div>'
    )

    body_md = "\n".join(_section_md(s) for s in body_sections)

    html_body = (
        f'<div class="acm-header">{_md_to_html(header_md_text)}{acm_ref_block}</div>'
        f'<div class="acm-body">{_md_to_html(body_md)}</div>'
    )
    return _wrap(_ACM_CSS, html_body)


# ---------------------------------------------------------------------------
# Elsevier Journal — single column, generous margins, journal typography
# ---------------------------------------------------------------------------
_ELSEVIER_CSS = """
  @page {
    size: A4; margin: 25mm 25mm 25mm 25mm;
    @bottom-center { content: counter(page); font-family: serif; font-size: 9pt; color: #666; }
  }
  body {
    font-family: "Liberation Serif", "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.55;
    text-align: justify;
    hyphens: auto;
  }
  h1 { font-size: 20pt; margin: 0 0 0.5em 0; line-height: 1.2; }
  h2 { font-size: 13pt; margin-top: 1.6em; margin-bottom: 0.4em; font-weight: 700; }
  h3 { font-size: 11.5pt; font-weight: 700; margin-top: 1.2em; }
  p { margin: 0.6em 0; }
  table th, table td { font-size: 10pt; padding: 5px 7px; }

  .elsevier-meta { color: #555; font-size: 10pt; margin-bottom: 1.4em; }
  .elsevier-highlights {
    border: 1px solid #d0d0d0; background: #fafafa; padding: 12px 16px;
    margin: 1.2em 0; border-radius: 4px;
  }
  .elsevier-highlights .label {
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    font-size: 9.5pt; color: #555; margin-bottom: 6px;
  }
  .elsevier-highlights ul { margin: 0; padding-left: 18px; }
  .elsevier-highlights li { margin: 4px 0; }
  .abstract-block { border-left: 3px solid #999; padding-left: 14px; margin: 1.2em 0; }
"""


def _build_elsevier_pdf(project: PaperProject, sections: list[PaperSection]) -> bytes:
    title = project.title or "Untitled Paper"
    meta = _meta_line(project)

    parts = [f"# {title}\n"]
    if meta:
        parts.append(f'<div class="elsevier-meta">{meta}</div>\n')

    for s in sections:
        if s.key == "highlights":
            # Render the highlights section as a highlighted block, bullets if any.
            body = (s.body_md or "").strip()
            parts.append(
                '<div class="elsevier-highlights">'
                '<div class="label">Highlights</div>'
                f'{_md_to_html(body)}'
                "</div>"
            )
        elif s.key == "abstract":
            body = (s.body_md or "").strip() or "_(section pending)_"
            parts.append(
                f'<h2>{s.order}. {s.title}</h2>'
                f'<div class="abstract-block">{_md_to_html(body)}</div>'
            )
        else:
            parts.append(_section_md(s))

    # Convert the markdown-flavoured parts in one pass while preserving
    # already-rendered HTML fragments (highlights, abstract block).
    rendered_parts = []
    for part in parts:
        # Already-HTML fragments start with <
        if part.lstrip().startswith("<"):
            rendered_parts.append(part)
        else:
            rendered_parts.append(_md_to_html(part))
    return _wrap(_ELSEVIER_CSS, "".join(rendered_parts))


# ---------------------------------------------------------------------------
# APA Thesis — single column, double-spaced, separate title page
# ---------------------------------------------------------------------------
_APA_CSS = """
  @page {
    size: Letter; margin: 1in;
    @top-right { content: counter(page); font-family: serif; font-size: 11pt; color: #444; }
  }
  body {
    font-family: "Times New Roman", "Liberation Serif", Times, serif;
    font-size: 12pt;
    line-height: 2.0;
    text-align: left;
  }
  h1 { font-size: 14pt; text-align: center; font-weight: 700; margin: 0 0 1em 0; }
  h2 { font-size: 12pt; text-align: center; font-weight: 700; margin: 1.4em 0 0.4em 0; }
  h3 { font-size: 12pt; font-weight: 700; margin: 1em 0 0.4em 0; }
  p { margin: 0; text-indent: 0.5in; }
  /* First paragraph after a heading should not be indented if it follows a centered title */
  h1 + p, h2 + p { text-indent: 0.5in; }

  table { font-size: 11pt; }
  table th, table td { padding: 6px 9px; }

  .apa-title-page {
    page-break-after: always;
    break-after: page;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    min-height: 80vh;
  }
  .apa-title-page h1 { margin-bottom: 0.7em; }
  .apa-title-page .author { font-size: 12pt; margin: 0.3em 0; }
  .apa-title-page .affiliation { font-size: 12pt; margin: 0.3em 0; }
  .apa-title-page .course { font-size: 12pt; margin: 0.3em 0; }
  .apa-title-page .date { font-size: 12pt; margin: 0.3em 0; }

  .apa-abstract { page-break-before: always; break-before: page; }
  .apa-abstract h2 { font-size: 12pt; text-align: center; }
  .apa-abstract p { text-indent: 0; }
  .apa-abstract .keywords { font-style: italic; margin-top: 0.5em; text-indent: 0.5in; }
"""


def _build_apa_pdf(project: PaperProject, sections: list[PaperSection]) -> bytes:
    title = project.title or "Untitled Paper"

    # Separate title page block — always page 1 by APA convention.
    title_section = next((s for s in sections if s.key == "title_page"), None)
    abstract_section = next((s for s in sections if s.key == "abstract"), None)
    keywords_section = next((s for s in sections if s.key == "keywords"), None)
    body_sections = [
        s for s in sections if s.key not in {"title_page", "abstract", "keywords"}
    ]

    title_page_html = (
        '<div class="apa-title-page">'
        f'<h1>{title}</h1>'
        f'<div class="author">{(title_section.body_md or "").strip() if title_section else ""}</div>'
        f'<div class="affiliation">{project.journal_type or ""}</div>'
        '</div>'
    )

    abstract_md = (abstract_section.body_md or "").strip() if abstract_section else ""
    keywords_md = (keywords_section.body_md or "").strip() if keywords_section else ""
    abstract_html = (
        '<div class="apa-abstract">'
        '<h2>Abstract</h2>'
        f'{_md_to_html(abstract_md) if abstract_md else "<p><em>(abstract pending)</em></p>"}'
        + (f'<p class="keywords"><em>Keywords:</em> {keywords_md}</p>' if keywords_md else "")
        + '</div>'
    )

    body_md = "\n".join(_section_md(s, numbered=False) for s in body_sections)
    body_html = _md_to_html(body_md)

    return _wrap(_APA_CSS, title_page_html + abstract_html + body_html)


# ---------------------------------------------------------------------------
# Default fallback — used when no format is selected
# ---------------------------------------------------------------------------
_DEFAULT_CSS = """
  @page { size: A4; margin: 24mm 18mm; }
  body {
    font-family: "Liberation Serif", Georgia, serif;
    font-size: 11.5pt;
    line-height: 1.55;
  }
  h1 { font-size: 22pt; margin-bottom: 0.4em; }
  h2 { font-size: 14pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 1.4em; }
  h3 { font-size: 12pt; }
"""


def _build_default_pdf(project: PaperProject, sections: list[PaperSection]) -> bytes:
    from .markdown import build_markdown

    full_md = build_markdown(project, sections)
    return _wrap(_DEFAULT_CSS, _md_to_html(full_md))


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------
_FORMAT_BUILDERS = {
    "ieee_conference": _build_ieee_pdf,
    "acm_article": _build_acm_pdf,
    "elsevier_journal": _build_elsevier_pdf,
    "apa_thesis": _build_apa_pdf,
}


def build_pdf(project: PaperProject, sections: list[PaperSection]) -> bytes:
    fmt = (getattr(project, "paper_format", "") or "").lower()
    builder = _FORMAT_BUILDERS.get(fmt, _build_default_pdf)
    return builder(project, sections)
