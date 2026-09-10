# 🦙 Ollama Studio: Autonomous AI Workspace & Agent Hub

<p align="center">
  <img src="public/icon.svg" width="80" height="80" alt="Ollama Studio Logo" />
</p>

<p align="center">
  <strong>A modern, local-first, privacy-focused AI Workspace and Agent Hub built for Ollama & Cloud LLMs.</strong>
  <br />
  <em>Claude-style Projects, hybrid BM25 + semantic RAG, MCP Connectors (Blender 3D, GitHub, Slack, Discord), autonomous scheduled agents with an approval queue, and a live in-browser Codespace.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2.35-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?style=flat-square&logo=tailwind-css" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Ollama-Local_LLMs-teal?style=flat-square&logo=ollama" alt="Ollama" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## 🌟 Key Highlights

- 🔒 **100% Private & Local-First**: Run entirely on your machine. Chats, documents, agent configurations, and project knowledge stay on your local disk (SQLite when available, JSON file as an automatic fallback — see [Storage](#-storage) below).
- ⚡ **Hybrid Retrieval & 16K Context Guard**: In-memory BM25 keyword ranking by default; optionally blended with cosine similarity over local Ollama embeddings (e.g. `nomic-embed-text`) for semantic matches BM25 alone would miss. Upload thick multi-page documents without VRAM crashes or model-swapping latency.
- 📁 **Claude-Style Projects**: Isolated project workspaces, persistent knowledge files, granular hyperparameter tuning, and custom system prompts per project.
- 🧩 **MCP & Ecosystem Connectors**:
  - **Blender 3D (MCP)**: 1-click Python daemon bridge script with `/blender` procedural 3D generation.
  - **GitHub**: Fetch live issues and repository metrics with `/github`.
  - **Slack & Discord**: Real-time webhook dispatching via `/slack` and `/discord`.
  - **16 connector definitions total**, including NocoDB, PostgreSQL, Notion, Supabase, and more.
- 🛠️ **8 Agentic Skills & 12 Suite Plugins**: Specialized system-prompt personas (Staff Software Architect, Data Analyst, Security Auditor, Technical Writer, and more). Skills that need file access (code, data, security, docs) automatically enable disk tools for that conversation instead of only changing tone.
- ⏰ **Autonomous Background Agents**: Cron and interval scheduler for periodic research, monitoring, and briefing tasks, with execution logs and an **approval queue** — any agent action that writes or deletes a file waits for your explicit sign-off before it runs.
- ⚔️ **Model Arena**: Real-time side-by-side battle mode comparing your local Ollama models with cloud models (Gemini, Claude, GPT, DeepSeek, Groq, OpenRouter).
- 💻 **Live Sandbox & Codespace**: In-browser JavaScript execution console and a sandboxed HTML/SVG live-preview iframe.
- 🎨 **13 Themes & 6 Fonts**: Claude Amber, Catppuccin Mocha, Tokyo Night, Dracula, Rosé Pine, and more.
- 🎧 **Ambient Focus Music Player**: Built-in Lofi, Rain, Coffee Shop, and Forest soundscapes.

---

## 🏗️ Architecture & 16K Context Guard

Local 9B-class models typically run with an 8K–16K context window (`num_ctx: 16384`). Dumping large documents directly into the prompt exhausts VRAM and triggers token truncation.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        16K CONTEXT WINDOW BUDGET                       │
├─────────────┬───────────────────┬──────────────────────┬───────────────┤
│ System Core │  Retrieved RAG    │ Rolling Chat History │ Output Space  │
│  (~800 tok) │ Chunks (~3.5K tok)│     (~6.0K tok)      │  (~4.0K tok)  │
└─────────────┴───────────────────┴──────────────────────┴───────────────┘
```

- **Zero GPU VRAM Retrieval**: The in-memory **BM25 / TF-IDF ranker** runs in Node.js in a few milliseconds — no embedding model required.
- **Optional Semantic Layer**: Turn on **Settings → Semantic RAG** to blend in cosine similarity over a local Ollama embedding model (default `nomic-embed-text`, `ollama pull nomic-embed-text` first). Off by default; if the embedding call fails or times out for any reason, retrieval silently falls back to pure BM25 — it can only add matches, never remove or block them.
- **Dynamic Context Budgeting**: Only the top-K relevant document fragments are injected, reserving the rest of the context window for chat history and output.

---

## 🔐 Security & Access Control

This is a single-user local tool, but several routes are powerful enough to matter if this machine is ever reachable by anyone else (shared Wi-Fi, a coworking space, or `npm run tunnel`):

| Route | What it can do |
| :--- | :--- |
| `/api/fs`, `/api/tools/execute*` | Read/write/delete files. Manual-chat tools are sandboxed to your home directory; autonomous agents use the same sandbox but require an approval token for any write or delete. |
| `/api/cloud/chat` | Forwards your cloud provider API key (from `.env.local` or Settings) to Anthropic/OpenAI/Gemini/etc. |
| `/api/connectors` | Can dispatch to Slack/Discord webhooks and execute Python in a connected Blender bridge. |
| `/api/ollama/[...path]` | Proxies prompts to your local Ollama server. |

**Access token.** `middleware.ts` gates every `/api/*` route behind a shared bearer token. With nothing configured, these routes are open — fine for `npm run dev` on `127.0.0.1` only (the default), **not fine** if you switch to `npm run dev:lan` / `npm run start:lan` (binds `0.0.0.0`) or run `npm run tunnel`. Set a token before doing either:

```bash
# .env.local
APP_ACCESS_TOKEN=<openssl rand -hex 32>
NEXT_PUBLIC_APP_ACCESS_TOKEN=<same value>
```

`npm run tunnel` refuses to start at all without this set. See `.env.example` for the full list of variables, including optional server-side cloud provider keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`) so keys don't have to live in browser Settings/localStorage.

**Other built-in protections:**
- `lib/redaction.ts` masks high-confidence secrets (private keys, AWS/GitHub/Slack/Stripe tokens, bearer headers, private IPs) out of anything sent to a *cloud* provider — local Ollama requests are untouched.
- `lib/ollamaRateLimit.ts` caps concurrent/burst requests to your local Ollama server so a runaway agent loop can't hammer it.
- CORS on API routes is closed by default (`lib/corsHeaders.ts`); set `ALLOW_EXTERNAL_ORIGIN` only if you deliberately want another origin (e.g. a companion app) to call these routes cross-origin.

---

## 💾 Storage

Conversations, projects, agents, and settings are persisted server-side in **SQLite** (`better-sqlite3`, WAL mode) at `data/db.sqlite3`. If the native module can't be installed on your machine (no prebuilt binary for your Node version, no Python/C++ build tools — this can happen on very new Node releases), the app automatically falls back to a flat `data/db.json` file with identical behavior; you'll see one console warning explaining how to enable SQLite later if you want it. A pre-existing `data/db.json` is migrated into SQLite automatically the first time it's available, and the original file is kept as `data/db.json.migrated.bak`.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (a Node LTS release is more likely to have a prebuilt SQLite binary available; see [Storage](#-storage))
- [Ollama](https://ollama.com/) installed and running locally

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/p3nr0s3/ollama-chat-web.git
   cd ollama-chat-web
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   At minimum, set `APP_ACCESS_TOKEN` / `NEXT_PUBLIC_APP_ACCESS_TOKEN` if this machine is ever reachable by anyone else (see [Security & Access Control](#-security--access-control)).

4. **Start Ollama** (in a separate terminal):
   ```bash
   ollama serve
   ollama pull gemma2:9b        # or your preferred model
   ollama pull nomic-embed-text # optional, only if you'll enable Semantic RAG
   ```

5. **Launch the development server**:
   ```bash
   npm run dev
   ```
   Binds to `127.0.0.1` by default. Use `npm run dev:lan` to bind `0.0.0.0` for access from other devices on your network — set `APP_ACCESS_TOKEN` first.

6. **Open in browser**: [http://localhost:3000](http://localhost:3000)

### Running tests

```bash
npm run test
```

Vitest suite covering the disk-tool path sandbox (including a regression test for a path-traversal bug that was found and fixed) and the hybrid RAG ranker.

### Exposing this publicly

```bash
npm run tunnel
```

Opens a public HTTPS tunnel (via Pinggy). Refuses to start unless `APP_ACCESS_TOKEN` is set.

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
│   │   ├── audio/route.ts               # Voice/dictation audio handling
│   │   ├── cloud/chat/route.ts          # Streaming proxy to Anthropic/OpenAI/Gemini/Groq/DeepSeek/OpenRouter
│   │   ├── connectors/route.ts          # GitHub, Slack, Discord, Blender MCP dispatch
│   │   ├── db/route.ts                  # Read/write the persistent database (SQLite or JSON, see lib/serverDb.ts)
│   │   ├── fs/route.ts                  # Local disk explorer, sandboxed to $HOME
│   │   ├── ollama/[...path]/            # Streaming proxy to Ollama (/api/chat, /api/tags, ...)
│   │   ├── search/route.ts              # SearXNG web search
│   │   └── tools/
│   │       ├── execute/route.ts         # Disk tools for manual chat, sandboxed to $HOME
│   │       └── execute-agent/route.ts   # Disk tools for autonomous agents; write/delete require an approval token
│   ├── globals.css                      # Tailwind styles, KaTeX fonts & themes
│   ├── layout.tsx                       # Root HTML & theme container
│   └── page.tsx                         # Main controller, prompt engine & RAG injection
├── components/                          # ~24 components: chat UI, modals for skills/agents/settings/approvals, codespace, etc.
├── lib/
│   ├── agentEngine.ts                   # Autonomous agent scheduling & tool-loop execution
│   ├── corsHeaders.ts                   # Closed-by-default CORS for API routes
│   ├── diskToolOps.ts                   # Shared list/read/write/search/delete file implementation
│   ├── embeddings.ts                    # Local Ollama embeddings client for semantic RAG
│   ├── ollamaRateLimit.ts               # Concurrency/burst guard for the Ollama proxy
│   ├── pathSandbox.ts                   # Shared path-containment check used by fs/tools routes
│   ├── rag.ts                           # BM25 chunking/ranking + hybrid semantic retrieval
│   ├── redaction.ts                     # Secret-masking before any cloud provider call
│   ├── serverDb.ts                      # SQLite storage with automatic JSON-file fallback
│   ├── skills.ts                        # Agentic skill definitions (some auto-enable disk tools)
│   ├── storage.ts                       # Client-side localStorage cache + server sync
│   └── types.ts                         # TypeScript data interfaces
├── tests/                               # Vitest: path sandbox, disk tools, hybrid RAG
├── scripts/
│   ├── tunnel.mjs                       # Public tunnel, refuses to run without APP_ACCESS_TOKEN
│   └── warnOpenAccess.mjs               # Warns on `npm run dev`/`start` if no access token is set
└── middleware.ts                        # Bearer-token gate for every /api/* route
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
