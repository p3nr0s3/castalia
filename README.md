# Ollama Chat Web 🦙

<p align="center">
  <img src="https://ollama.com/public/ollama.png" width="80" height="80" alt="Ollama" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14.2.35-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?style=flat-square&logo=tailwind-css" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Ollama-Local_LLMs-teal?style=flat-square&logo=ollama" alt="Ollama" />
  <img src="https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/Tests-198%20Passed-brightgreen?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

Ollama Chat Web is **a self-hosted, local-first AI workspace** — built to run Ollama models on your own machine, with optional cloud provider fallback, and every filesystem/execution/network-reaching feature wrapped in an explicit security boundary rather than left to trust.

No accounts, no telemetry, no cloud dependency required. Your chats, journal entries, agent configs, and project files live in a database on your own disk.

For architecture diagrams and a full feature walkthrough, see [`DOCUMENTATION.md`](./DOCUMENTATION.md). This README covers what it is, how to run it, and what's inside.

---

## Key Features ⭐

- 🔒 **100% Local-First**: No cloud dependency required. Chats, journal entries, agent configs, and project knowledge files are stored on your own machine via SQLite (WAL mode) with an automatic JSON fallback if the native binary isn't available.

- ⚡ **Zero-VRAM Hybrid RAG**: BM25 keyword ranking runs in-memory at effectively zero cost; an optional semantic pass blends in Ollama embedding cosine similarity when you want it. Chunk size, overlap, top-K, and the blend weight are all configurable per project, not hardcoded.

- 🔌 **User-Defined Custom Bridges**: No bundled, pre-built integrations to trust or audit — connect to anything yourself as a **Webhook** (any public endpoint: Slack, Discord, a custom API) or a **Local App bridge** (loopback-only HTTP to something running on your own machine). Trigger any bridge from chat with `/bridge <id> <message>`.

- 🛡️ **Security as a First-Class Concern**: DNS-resolved SSRF guards (immune to DNS rebinding) with three distinct policies for public webhooks, loopback-only bridges, and LAN Ollama instances. A real approval-token gate — with freshness expiry, anti-replay, and tool/path matching verified server-side — stands between an AI tool call and any file write or delete, not just a UI confirm dialog.

- 💻 **In-Browser Codespace**: A real sandboxed code execution environment — Monaco editor, terminal emulator, and a spawned child process (Python/Node/PowerShell/bash) for actually running what you write.

- 📓 **Notion-Style Workspace Journal**: A flexible document canvas with cover banners, emoji icons, status/priority properties, checklists, and three view modes (page, list, kanban board) — plus an AI copilot for drafting, extracting to-dos, and formatting.

- ⏰ **Autonomous Background Agents**: Cron/interval-scheduled agents that can read, search, and propose file changes — with every mutating action queued behind human review and a diff preview before it touches disk.

- 👁️ **Ambient File-Watcher**: Point a project's knowledge base at a real folder on disk instead of manually uploading files. Changes sync automatically via `fs.watch`, debounced, capped, and scoped to plain-text/code — no re-upload needed every time a file changes.

- 🎨 **13 Built-in Themes**: Claude Amber, OLED Black, Midnight, Dracula, Cyberpunk, and more, plus a custom palette editor and adjustable font sizing.

Want the full picture, including sequence diagrams for the agent/approval flow and the prompt engine? Check [`DOCUMENTATION.md`](./DOCUMENTATION.md).

---

## How to Install 🚀

### Requirements

- **Node.js** 18+ (tested on 20 and 22)
- **[Ollama](https://ollama.com/)** installed and running locally

### Quick Start

```bash
git clone https://github.com/p3nr0s3/ollama-chat-web.git
cd ollama-chat-web
npm install
cp .env.example .env.local
```

Pull at least one chat model (and optionally an embedding model for hybrid RAG):

```bash
ollama serve
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text   # optional — enables hybrid semantic RAG
```

Then start the dev server:

```bash
npm run dev
```

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)**.

### Exposing Beyond Localhost

By default the app binds to `127.0.0.1` only. If you want it reachable on your LAN or through a tunnel:

```bash
npm run dev:lan     # binds to 0.0.0.0 instead of 127.0.0.1
npm run tunnel       # exposes the app publicly via localtunnel
```

**Set `APP_ACCESS_TOKEN` and `NEXT_PUBLIC_APP_ACCESS_TOKEN` in `.env.local` before doing either of these** — several routes can read/write your filesystem or spawn processes, and without a token they're gated only by a CSRF check, not authentication. `scripts/warnOpenAccess.mjs` will remind you if you forget.

```ini
# Generate with: openssl rand -hex 32
APP_ACCESS_TOKEN=
NEXT_PUBLIC_APP_ACCESS_TOKEN=
```

### Production Build

```bash
npm run build
npm start            # localhost only
npm run start:lan    # 0.0.0.0
```

---

## Configuration

Cloud provider API keys are optional and can be set two ways: typed into **Settings > Cloud AI Providers** in the UI (stored in browser localStorage), or set server-side in `.env.local` (which always takes precedence when present):

```ini
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=
```

See `.env.example` for the full list, including `OLLAMA_HOST` and the optional `ALLOW_EXTERNAL_ORIGIN` CORS setting.

---

## Security Model 🛡️

This is a single-user tool with no account system, so the threat model is different from a multi-tenant app — but it's not ignored. A quick summary (full detail in [`DOCUMENTATION.md`](./DOCUMENTATION.md)):

- **Two-layer API gate** (`middleware.ts`): a bearer token, plus a `Sec-Fetch-Site`/`Origin` check that blocks cross-site requests unconditionally on the routes that matter most (`/api/codespace/run`, `/api/tools/execute*`, `/api/fs`) — even if no token is configured.
- **DNS-resolved SSRF guards** (`lib/ssrfGuard.ts`): three policies (public-only, loopback-only, LAN-permitted) depending on what a URL is for, resistant to DNS rebinding.
- **Filesystem sandboxing** (`lib/pathSandbox.ts`): every disk-touching route resolves paths against a fixed base directory and rejects traversal attempts.
- **Approval-token gate**: `write_file`/`delete_file` require a server-verified token — fresh, unconsumed, and matched to the exact tool and path requested — before executing, whether the call came from manual chat or an autonomous agent.

If you find a real security issue, please don't open a public issue — reach out privately first.

---

## Testing 🧪

```bash
npm test              # vitest run — 20 files, 198 tests
npx tsc --noEmit       # typecheck
npm run build          # production build check
```

Coverage includes the SSRF guards, the approval-token gate, the custom-bridge connector route, hybrid RAG ranking, the ambient file-watcher's sync logic, path sandbox traversal protection, and document/diff/cache utilities.

---

## Project Structure

```
ollama-chat-web/
├── app/
│   ├── api/              # Route handlers — chat proxy, connectors, fs, tools, search, watcher
│   └── page.tsx           # Main controller: chat state, streaming, tool loop
├── components/            # Chat, Codespace, Journal, Settings, Directory UI
├── lib/
│   ├── agentEngine.ts      # Autonomous agent tool-calling loop
│   ├── fileWatcher.ts       # Ambient project-folder sync
│   ├── localAppBridge.ts     # Generic loopback bridge framework
│   ├── pathSandbox.ts         # Filesystem path containment
│   ├── rag.ts                  # BM25 + hybrid semantic retrieval
│   ├── serverDb.ts               # SQLite (WAL) with JSON fallback
│   └── ssrfGuard.ts                # DNS-resolved SSRF policies
├── middleware.ts            # Bearer token + CSRF gate
└── tests/                     # Vitest suites, one file per module/route
```

---

## What's Next? 🌟

Not a fixed roadmap, but active areas: hardware-aware local↔cloud model auto-fallback, a generalized undo mechanism for agent-made file changes, and offline local speech-to-text for voice mode (currently uses the browser's built-in `webkitSpeechRecognition`, which requires network access).

---

## License 📜

MIT — see [`LICENSE`](./LICENSE).

---

<p align="center">
  Created by <a href="https://github.com/p3nr0s3">Rei</a> — self-hosted AI, on your own terms. 🚀
</p>
