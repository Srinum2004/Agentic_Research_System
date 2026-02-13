import os
import time
import asyncio
import requests
from datetime import datetime
from dotenv import load_dotenv
from google import genai

# --------------------------------------------------
# ENV SETUP
# --------------------------------------------------
load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY")

if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY not found in .env")

if not SERPAPI_API_KEY:
    raise RuntimeError("SERPAPI_API_KEY not found in .env")

# Create Gemini client ONCE
client = genai.Client(api_key=GOOGLE_API_KEY)

# --------------------------------------------------
# REAL WEB SEARCH TOOL (SERPAPI)
# --------------------------------------------------
def web_search_tool(query: str) -> str:
    """
    Real Google search using SerpAPI with full validation.
    """
    url = "https://serpapi.com/search.json"
    params = {
        "engine": "google",
        "q": query,
        "api_key": SERPAPI_API_KEY,
        "num": 5,
        "hl": "en",
        "gl": "in",
    }

    response = requests.get(url, params=params, timeout=15)

    if response.status_code != 200:
        raise RuntimeError(
            f"SerpAPI HTTP {response.status_code}: {response.text}"
        )

    data = response.json()

    # SerpAPI internal error
    if "error" in data:
        raise RuntimeError(f"SerpAPI error: {data['error']}")

    organic = data.get("organic_results", [])
    if not organic:
        raise RuntimeError("No organic search results returned by SerpAPI")

    results = []
    for item in organic[:5]:
        title = item.get("title", "No title")
        snippet = item.get("snippet", "No snippet")
        link = item.get("link", "No link")

        results.append(
            f"Title: {title}\n"
            f"Snippet: {snippet}\n"
            f"Source: {link}"
        )

    return "\n\n".join(results)


# --------------------------------------------------
# AGENT LOGIC
# --------------------------------------------------
async def perform_research(query: str) -> dict:
    start_time = time.time()
    steps = []

    # Step 1: Intent analysis
    steps.append("Intent analysis completed")
    await asyncio.sleep(0.1)

    # Step 2: Web search (tool)
    steps.append("Tool selected: Google Web Search (SerpAPI)")
    try:
        search_context = web_search_tool(query)
        steps.append("Web search completed and context retrieved")
        used_web = True
    except Exception as e:
        search_context = (
            "Web search failed. Proceeding with LLM internal knowledge.\n"
            f"Reason: {str(e)}"
        )
        steps.append("Web search failed – fallback to LLM knowledge")
        used_web = False

    await asyncio.sleep(0.1)

    # Step 3: LLM reasoning
    steps.append("Sending context to Gemini for reasoning")

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=(
                f"User Query:\n{query}\n\n"
                f"Context:\n{search_context}\n\n"
                "Answer clearly. If sources are provided, use them. "
                "If not, clearly state that the answer is based on general knowledge."
            ),
        )
        output = response.text
        steps.append("Gemini reasoning completed")
    except Exception as e:
        output = f"Gemini LLM Error: {str(e)}"
        steps.append("Gemini reasoning failed")

    end_time = time.time()

    return {
        "query": query,
        "used_web_search": used_web,
        "output": output,
        "execution_time": f"{round(end_time - start_time, 2)} sec",
        "agent_steps": steps,
        "start_time": datetime.fromtimestamp(start_time).isoformat(),
        "end_time": datetime.fromtimestamp(end_time).isoformat(),
    }
