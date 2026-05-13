# 🚀 Agentic Research Application

A powerful, full-stack **Agentic Web Research Application** that leverages the power of Large Language Models (Gemini) and Real-time Web Search (SerpAPI) to provide deep, reasoned answers to complex queries.

## ✨ Key Features

-   **🔐 Secure Authentication**: Full user lifecycle management with signup, login (JWT-based), and secure route protection.
-   **🕵️ Agentic Workflow**:
    -   **Intent Analysis**: Understands the core objective of the user query.
    -   **Real-time Web Search**: Fetches live data from the internet using SerpAPI.
    -   **Multi-step Reasoning**: Processes search results through Gemini to synthesize a comprehensive report.
-   **📜 History Tracking**: Keeps a persistent record of all research tasks and leur findings.
-   **📊 Modern Dashboard**: A premium, glassmorphism-inspired UI with dark mode support.
-   **🐳 Fully Containerized**: One-command deployment using Docker and Docker Compose.

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React, Vite, Tailwind CSS, Framer Motion, Lucide React, Recharts |
| **Backend** | FastAPI, Python, SQLAlchemy (SQLite), JWT Authentication |
| **AI/ML** | Google Gemini (LLM), SerpAPI (Search Tool) |
| **DevOps** | Docker, Docker Compose |

---

## 🚀 Getting Started

### 📋 Prerequisites

-   [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
-   [Google Gemini API Key](https://aistudio.google.com/app/apikey)
-   [SerpAPI API Key](https://serpapi.com/)

### ⚙️ Setup Instructions

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-username/agentic-research-app.git
    cd agentic-research-app
    ```

2.  **Configure Environment Variables**:
    Create a `.env` file in the **root directory** and add your API keys:
    ```env
    GOOGLE_API_KEY=your_gemini_api_key
    SERPAPI_API_KEY=your_serpapi_api_key
    SECRET_KEY=your_random_secret_key_for_jwt
    ```


3.  **Launch the Application**:
    ```bash
    docker-compose up --build
    ```

4.  **Access the Dashboard**:
    -   **Frontend**: [http://localhost:5173](http://localhost:5173)
    -   **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📖 Usage Guide

1.  **Sign Up**: Create a new account to start your research journey.
2.  **Initiate Research**: Enter a complex query like *"Analyze the impact of quantum computing on modern cryptography."*
3.  **Monitor Agent**: Watch the real-time steps as the agent analyzes intent, searches the web, and reasons through the data.
4.  **Review Results**: Read the generated markdown report and view the step-by-step audit log.

## 📁 Project Structure

```text
.
├── backend/            # FastAPI source code & database logic
├── frontend/           # React component library & Vite config
├── docker-compose.yml  # Multi-container orchestration
└── README.md           # Project documentation
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an issue.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
starsrinu2004@gmail.com
Star@2004 ->user
srinibashmishra2004@gmail.com
Smishra9@   -> admin