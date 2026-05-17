"""LangGraph state machine for Paper Studio.

The graph is phase-routed: a single `POST /papers/{id}/chat` endpoint sends
state into the graph and the START router picks the right node based on
state["phase"]. Section drafting and full template generation run as
direct node calls (not through the chat router) because they are kicked
off by dedicated endpoints.
"""
from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .nodes.clarify import clarify_node
from .nodes.editor import editor_node
from .nodes.intake import intake_node
from .nodes.section_writer import section_writer_node
from .nodes.template import template_node
from .state import PaperState


def _route(state: PaperState) -> str:
    phase = state.get("phase", "intake")
    if phase == "intake":
        return "intake"
    if phase == "edit":
        return "editor"
    if phase == "draft":
        return "section_writer"
    if phase == "template":
        return "template"
    return "intake"


def _after_intake(state: PaperState) -> str:
    return END if state.get("intent_complete") else "clarify"


def build_graph():
    g = StateGraph(PaperState)
    g.add_node("intake", intake_node)
    g.add_node("clarify", clarify_node)
    g.add_node("template", template_node)
    g.add_node("section_writer", section_writer_node)
    g.add_node("editor", editor_node)

    g.add_conditional_edges(
        START,
        _route,
        {
            "intake": "intake",
            "clarify": "clarify",
            "template": "template",
            "section_writer": "section_writer",
            "editor": "editor",
        },
    )
    g.add_conditional_edges("intake", _after_intake, {"clarify": "clarify", END: END})
    g.add_edge("clarify", END)
    g.add_edge("template", END)
    g.add_edge("section_writer", END)
    g.add_edge("editor", END)

    return g.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
