# 🦙 Ollama Studio: Autonomous AI Workspace & Agent Hub

<p align="center">
  <img src="public/icon.svg" width="80" height="80" alt="Ollama Studio Logo" />
</p>

<p align="center">
  <strong>A modern, local-first, privacy-focused AI Workspace and Agent Hub built for Ollama & Cloud LLMs.</strong>
  <br />
  <em>Equipped with Claude-style Projects, In-Memory RAG, 16K Context Guard, MCP Connectors (Blender 3D, GitHub, Slack), Autonomous Scheduled Agents, and Live Codespace.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?style=flat-square&logo=tailwind-css" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Ollama-Local_LLMs-teal?style=flat-square&logo=ollama" alt="Ollama" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## 🌟 Key Highlights

- 🔒 **100% Private & Local-First**: Run entirely on your machine. Chats, documents, agent configurations, and persistent memory stay on your local disk.
- ⚡ **Local RAG & 16K Context Guard**: Smart in-memory BM25 chunking & relevance retrieval. Upload thick multi-page documents without VRAM crashes or model-swapping latency — specifically engineered for local models like **Gemma 4**, **Llama 3**, and **Qwen**.
- 📁 **Claude-Style Projects**: Organize your work with isolated project workspaces, persistent knowledge files, granular hyperparameter tuning, and custom agent instructions.
- 🧩 **MCP & Ecosystem Connectors**:
  - **Blender 3D (MCP)**: 1-click Python daemon bridge script with `/blender` procedural 3D generation.
  - **GitHub**: Fetch live issues and repository metrics with `/github`.
  - **Slack & Discord**: Real-time webhook dispatching via `/slack` and `/discord`.
  - **NocoDB, PostgreSQL, Notion, Supabase, and more**.
- 🛠️ **16 Agentic Skills & 12 Suite Plugins**: Inject Anthropic-style skill tools (Software Architect, Canvas, Data Analyst, Web Search) and industry personas into your prompt runtime.
- ⏰ **Autonomous Background Agents**: Built-in cron and interval scheduler that executes periodic research, monitoring, and briefing tasks with execution logs.
- ⚔️ **Model Arena**: Real-time side-by-side battle mode comparing your local Ollama models with Cloud AI (Gemini 2.5 Flash, Claude 3.5, GPT-4o, DeepSeek R1).
- 💻 **Live Sandbox & Codespace**: In-browser JavaScript execution console and live interactive HTML/SVG artifact preview sandbox.
- 🎨 **13 Premium Themes & 11 Fonts**: Claude Amber, Catppuccin Mocha, Tokyo Night, Dracula, Rosé Pine, paired with Fira Code, Outfit, Poppins, and more.
- 🎧 **Ambient Focus Music Player**: Built-in Lofi beats, Rain, Coffee Shop, and Forest ambient soundscapes with persistent status indicators.

---

## 🏗️ Architecture & 16K Context Guard

Local 9B models (such as Gemma 4) typically run with an 8K–16K context window (`num_ctx: 16384`). Dumping large documents directly into the prompt exhausts VRAM and triggers token truncation.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        16K CONTEXT WINDOW BUDGET                       │
├─────────────┬───────────────────┬──────────────────────┬───────────────┤
│ System Core │  Retrieved RAG    │ Rolling Chat History │ Output Space  │
│  (~800 tok) │ Chunks (~3.5K tok)│     (~6.0K tok)      │  (~4.0K tok)  │
└─────────────┴───────────────────┴──────────────────────┴───────────────┘
```

- **Zero GPU VRAM Retrieval**: Our in-memory **BM25 / TF-IDF ranker** runs in Node.js/browser memory in `< 5ms`.
- **Dynamic Context Budgeting**: Only the Top-K relevant document fragments are injected, reserving 100% of GPU VRAM for the primary model.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ or v20+
- [Ollama](https://ollama.com/) installed and running locally

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/ollama-studio.git
   cd ollama-studio
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Ollama** (in a separate terminal):
   ```bash
   ollama serve
   ```
   *(Optional: pull your preferred models, e.g. `ollama pull gemma2:9b` or your custom GGUF models)*

4. **Launch Development Server**:
   ```bash
   npm run dev
   ```

5. **Open in Browser**:
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## 🛠️ Slash Commands & Integrations

| Command | Description | Example |
| :--- | :--- | :--- |
| `/search` | Real-time web search via SearXNG | `/search latest news on AI agents` |
| `/blender` | Procedural 3D Python script generation for Blender MCP | `/blender studio lighting with glass doughnut` |
| `/github` | Fetch live GitHub issues or repo metrics | `/github issues facebook/react` |
| `/slack` | Dispatch a notification to your Slack channel | `/slack Deploy successful to production` |
| `/discord` | Dispatch a message to Discord via webhook | `/discord Agent finished morning briefing` |
| `/think` | Force step-by-step chain-of-thought reasoning | `/think analyze security incident log` |
| `/code` | Software architect clean code mode | `/code implement binary search tree in Rust` |
| `/summarize` | Distill text into key bullet points | `/summarize <paste text>` |

---

## 📁 Repository Structure

```
ollama-chat-web/
├── app/
│   ├── api/
│   │   ├── connectors/route.ts      # Live GitHub, Slack, Discord, Blender dispatch
│   │   ├── db/route.ts              # Local SQLite persistent storage sync
│   │   ├── fs/route.ts              # Local disk explorer & file reader
│   │   ├── ollama/[...path]/        # Streaming proxy to Ollama (/api/chat, /api/tags)
│   │   └── search/route.ts          # SearXNG web search engine API
│   ├── globals.css                  # Tailwind styles, KaTeX fonts & themes
│   ├── layout.tsx                   # Root HTML & theme container
│   └── page.tsx                     # Main controller, prompt engine & RAG injection
├── components/
│   ├── ChatArea.tsx                 # Seamless chat stream & starter chips
│   ├── ChatInput.tsx                # Auto-growing input, slash popover & dictation
│   ├── ChatMessage.tsx              # Markdown, code syntax highlighter & copy tools
│   ├── CodeBlock.tsx                # JS runner sandbox & HTML live preview
│   ├── DirectoryModal.tsx           # Skills, Connectors, Plugins & Memory Hub
│   ├── DiskExplorerModal.tsx        # Safe local disk browsing & 1-click attach
│   ├── ModelSelector.tsx            # Borderless local + cloud model selector
│   ├── MusicPlayerWidget.tsx        # Ambient soundscapes & Lofi background player
│   ├── ProjectDetailView.tsx        # Claude-style Project dashboard & context meter
│   ├── ProjectModal.tsx             # Agent hyperparameters, presets & knowledge RAG
│   └── Sidebar.tsx                  # Pinned chats, projects gallery & customize menu
├── lib/
│   ├── agentEngine.ts               # Background autonomous cron agent execution
│   ├── directoryData.ts             # Default connectors, plugins & memory catalog
│   ├── ollama.ts                    # Streaming fetch, metrics calculator & client API
│   ├── rag.ts                       # In-memory BM25 chunking & 16K context guard
│   ├── storage.ts                   # Hybrid LocalStorage + SQLite persistence layer
│   └── types.ts                     # TypeScript data interfaces
└── public/
    └── icon.svg                     # Custom application logo
```

---

## 🤝 Contributing

Contributions, feature ideas, and pull requests are warmly welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
