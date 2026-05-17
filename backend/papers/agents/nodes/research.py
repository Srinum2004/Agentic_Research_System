"""Web research tool — Tavily primary, SerpAPI fallback.

Reuses backend/agent.py's web_search_tool for the fallback path instead of
duplicating the SerpAPI integration.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure backend/ is on sys.path so we can import the existing SerpAPI helper.
_BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from agent import web_search_tool as _serpapi_search  # noqa: E402


def _tavily_search(query: str, max_results: int = 6) -> str:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY not set")
    from tavily import TavilyClient

    client = TavilyClient(api_key=api_key)
    resp = client.search(query=query, max_results=max_results, search_depth="advanced")
    results = resp.get("results", [])
    if not results:
        raise RuntimeError("Tavily returned no results")

    blocks = []
    for i, r in enumerate(results, start=1):
        title = r.get("title", "Untitled")
        url = r.get("url", "")
        content = r.get("content", "")
        blocks.append(f"[{i}] {title}\nURL: {url}\nSnippet: {content}")
    return "\n\n".join(blocks)


def research(query: str) -> str:
    """Try Tavily first, fall back to SerpAPI on any failure."""
    try:
        return _tavily_search(query)
    except Exception as primary_err:
        try:
            return _serpapi_search(query)
        except Exception as fallback_err:
            return (
                "Web research failed; proceeding with model internal knowledge.\n"
                f"Tavily error: {primary_err}\nSerpAPI error: {fallback_err}"
            )
