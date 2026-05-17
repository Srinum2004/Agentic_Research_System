"""Shared LangChain Groq LLM factory."""
from __future__ import annotations

import os

from langchain_groq import ChatGroq


def get_llm(temperature: float = 0.3, streaming: bool = False) -> ChatGroq:
    return ChatGroq(
        api_key=os.getenv("GROQ_API_KEY"),
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        temperature=temperature,
        streaming=streaming,
    )
