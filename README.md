# Lyra

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14.2.35-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Ollama](https://img.shields.io/badge/Ollama-Native%20API-white?logo=ollama)](https://ollama.com/)
[![Tests](https://img.shields.io/badge/Tests-77%20Suites%20%7C%20749%20Passed-brightgreen)](https://vitest.dev/)

A minimalist, local-first AI workspace built on Next.js 14, for chatting with locally-hosted Ollama models (or an OpenAI/Anthropic/Gemini-compatible cloud API) with retrieval-augmented context from your own project files.

Single-user by design: there is no login system, and the only access control is a shared bearer token (see [Security](#security)). It's built for one person running it on their own machine, not for a team.

[Quick Start](#quick-start) • [What's inside](#whats-inside) • [Security](#security) • [Testing](#testing) • [Full feature catalog](FEATURES.md)

</div>

---

## What's inside

This is a short orientation, not a feature list — see **[FEATURES.md](FEATURES.md)** for the complete, code-verified catalog of everything below (and things not mentioned here, like the journal, connectors, and skills directory).

- **Chat** with local Ollama models or a connected cloud provider, with streaming, branching, multimodal input, and a `<think>` block renderer for reasoning models.
- **Two-stage RAG** over project files: BM25 + dense-vector retrieval fused with RRF, an optional reranking pass, adjacent-chunk stitching, and an ambient filesystem watcher that keeps the index in sync with files on disk.
- **Agentic tool calls** (`list_directory`, `read_file`, `write_file`, `delete_file`, and a few others) gated behind an explicit toggle; file-mutating calls require a server-verified, single-use approval before they run, and can be reverted.
- **Artifacts and Knowledge Studio** for dynamic generation of code snippets, diagrams, markdown previews, and full project workspaces.
- **A response cache** (exact-hash and, optionally, semantic-similarity) that skips regeneration for repeat prompts, persisted server-side so it survives a reload.
- **Inference-side tuning**: context-window bucketing to avoid over-allocating KV cache, per-task sampling profiles, and KV prefix pinning for static system prompts.
- **System-1 Decision Engine (optional Laya integration)**: Fast non-autoregressive encoder pass (~30ms on CPU) for intent routing, deep reasoning recommendation, and tool safety scoring, with transparent fallback to local heuristics.
- **A post-generation grounding check** that flags claims/citations not backed by the retrieved context.
- **Chat history search** (`Ctrl/Cmd+K`): full-text search across every message, opening the chat at the matching message.
- **Server-side snapshots** of your data (daily, rotated, restorable with an automatic undo point), **usage & cost** tracking from your own chat history, and an installable **PWA**.
- **Scheduled agents that run from the server**, so they fire with the browser closed, with optional webhook notifications.
- **A retrieval-quality harness** (`npm run eval:rag`) to measure RAG changes instead of guessing.

None of this has been benchmarked against other tools — the claims above describe what the code does, not how well it performs relative to alternatives.

---

## System Architecture

```
                  ┌────────────────────────────────────────┐
                  │       Next.js 14 Web Frontend          │
                  │       (Chat, Projects, UI)             │
                  └───────────────────┬────────────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
        ┌──────────────────────┐              ┌──────────────────────┐
        │   Two-Stage RAG      │              │   Inference Engine   │
        │ - BM25 Keyword Index │              │ - Dynamic Bucketing  │
        │ - Vector Embeddings  │              │ - Adaptive Sampling  │
        │ - In-Memory Reranker │              │ - Laya System-1 Pass │
        │ - Grounding Verifier │              │ - Prefix Pinning     │
        └──────────┬───────────┘              │ - Embedding Unloader │
                   │                          └──────────┬───────────┘
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   Local Ollama Instance   │
                        │ (llama3.1, nomic-embed)   │
                        └─────────────┬─────────────┘
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
              ┌─────────────────────┐   ┌─────────────────────┐
              │  Sandbox Execution  │   │  Local Persistence  │
              │ - Pyodide (WASM)    │   │ - SQLite Database   │
              │ - Child Process API │   │ - JSON Fallback     │
              │ - Reversible Tools  │   │ - Response Cache    │
              └─────────────────────┘   └─────────────────────┘
```

---

## Quick Start

### 1. Prerequisites
- **Node.js** 20.19+ (22 LTS recommended — the SQLite backend needs Node 22, and running TypeScript in the Codespace runner needs 22.6+; on Node 20 the app works but stores data in `data/db.json`)
- **[Ollama](https://ollama.com/)** running locally:
  ```bash
  ollama serve
  ollama pull llama3.1:8b        # a chat model
  ollama pull nomic-embed-text   # optional: enables semantic (not just keyword) retrieval
  ```

#### Hardware Guidelines
- **CPU & RAM**: 4 CPU cores minimum, 16 GB system RAM recommended.
- **GPU (for Ollama)**: NVIDIA (CUDA), Apple Silicon (Metal), or AMD (ROCm) with 6 GB–12 GB VRAM for 7B/8B parameter models. CPU inference works as a fallback but generation speed will be constrained by system memory bandwidth.

### 2. Setup & Run
```bash
git clone https://github.com/p3nr0s3/lyra.git
cd lyra

npm install

# Optional — see .env.example for what this protects and why it matters
# the moment you expose this app beyond localhost.
cp .env.example .env.local

# Standard (Lyra only):
npm run dev

# All-in-One (Lyra + Laya System-1 Decision Engine in 1 step):
# Works cross-platform across Windows, Linux, and macOS:
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000) (or [http://127.0.0.1:3000](http://127.0.0.1:3000)).

Notes:

- `npm run dev` / `npm start` bind to `127.0.0.1` only. To reach the app from a phone or another PC on your network use `npm run dev:lan` / `npm run start:lan` **and set `APP_ACCESS_TOKEN`** (see [Security](#security)). Other hostnames you serve it under (e.g. a reverse proxy) must be listed in `ALLOWED_HOSTS`.
- The repo ships an `.npmrc` with `ignore-scripts=true`. This is deliberate: it lets the prebuilt `better-sqlite3` binary work instead of npm trying (and on machines without a C++ toolchain, silently failing) to compile it.
- The UI loads its web fonts from Google Fonts and the in-browser Python runner (Pyodide) is downloaded from the jsDelivr CDN on first use. Everything else runs locally; the first-run Pyodide download is the only part of code execution that needs the internet.
- `LYRA_DATA_DIR` moves the private `data/` folder (database, caches, snapshots, tokens). `npm test` always uses a throwaway folder instead, so running the tests never touches your real data.
- Optional environment variables: `LYRA_AUTO_BACKUP=0` (no daily snapshots), `LYRA_SERVER_SCHEDULER=0` (agents run only in the browser), `LYRA_INTERNAL_URL` (how the server reaches itself, default `http://127.0.0.1:$PORT`).
- `npm run eval:rag` prints the RAG retrieval report; `npm run typecheck` runs `tsc --noEmit`; `npm run verify` runs typecheck, tests and a production build (what CI runs).
- `dev:lan` / `start:lan` refuse to start without `APP_ACCESS_TOKEN` (override: `ALLOW_OPEN_LAN=1`). See [SECURITY.md](SECURITY.md) for the threat model.

---

## Security

- **Request gate** (`middleware.ts`, `lib/requestGuard.ts`) — three independent layers:
  1. a **`Host` allow-list** (localhost, IP literals, LAN/`.local` names, Pinggy tunnel domains, plus `ALLOWED_HOSTS`) that stops DNS-rebinding attacks from other websites;
  2. a **same-origin requirement** for every state-changing call and for the file/DB/code-execution routes, so a page open in another tab (or another local dev server on a different port) cannot drive this app;
  3. the optional **bearer token** `APP_ACCESS_TOKEN` (constant-time compared, Edge-runtime safe). The token is also exposed to the browser as `NEXT_PUBLIC_APP_ACCESS_TOKEN` because there is no server-side session — treat it as a lock on the door, not a secret.

  Layers 1–2 are always on; layer 3 is off until you set a token. **Set it before using `*:lan` scripts or `npm run tunnel`** (the tunnel refuses to start without it).
- **SSRF protection** (`lib/ssrfGuard.ts`, `lib/ipPolicy.ts`, `lib/safeFetch.ts`): for webhooks, URL ingestion, web scraping and search-result reading, `safeFetch` resolves the hostname once, checks every address against an allow-list of globally-routable IPs (so CGNAT, multicast, `::`, NAT64/6to4 and the like are blocked too), **pins the connection to the validated address** (closing DNS-rebinding) and re-validates **every redirect hop**. The Ollama and Laya proxies relay only their upstream's own API paths (`lib/proxyPaths.ts`); custom cloud endpoints may be local/LAN but never link-local/metadata addresses.
- **File access** (`lib/pathSandbox.ts`): the file explorer, agent tools and folder watcher are confined to your home directory (symlinks are resolved, so a link pointing out of it doesn't escape). Manual-chat disk tools can reach the whole disk by design (an OS-directory denylist still applies). **Everywhere**, credential stores (`~/.ssh`, `~/.aws`, browser profiles, keychains, private key files) and this app's own `.env*` files and `data/` directory are off limits — read-only tools run without an approval prompt, so a prompt-injected document must not be able to read them.
- **Approval gate** (`lib/toolApproval.ts`): `write_file` / `delete_file` need a server-side approval record that is approved, for exactly that tool **and exactly those arguments (path and content)**, at most 5 minutes old, and is consumed once (also under concurrent requests; stale syncs cannot resurrect a used approval). Every write can be reverted with one click if the file is unchanged since. This is a confirmation-and-replay-protection gate, **not** an authentication boundary — keeping other callers out is the request gate's job.
- **Secret redaction** (`lib/redaction.ts`): before anything is sent to a cloud provider it masks PEM private keys, AWS/GitHub/Slack/Google/Stripe keys, the key formats of the supported providers (Anthropic, OpenAI, Groq, OpenRouter, DeepSeek-style `sk-…`, Hugging Face), JWTs, bearer tokens, quoted `password:`/`api_key=` assignments, `.env`-style secret lines and private-range IPs. It is pattern-based, so treat it as a safety net, not a guarantee.

This is meant to protect a single user's machine from accidents, from other websites, and from prompt-injected content — not to be a hardened multi-user boundary. If you need real user accounts, audit logs, or isolation between users, this isn't that.

---

## Testing

```bash
npm test              # Vitest — 77 suites, 749 tests as of this writing
npm run typecheck     # tsc --noEmit
npm run build          # production build
npm run analyze        # production build with a bundle-size breakdown (opens .next/analyze/*.html)
```

Test counts drift as the codebase changes — the badge above and the count here reflect the last time this file was updated, not a live number.

---

## Project Structure

```
lyra/
├── app/                     # Next.js App Router — pages, API routes
├── components/              # UI components (chat, sidebar, modals, projects)
├── lib/
│   ├── ollama.ts            # Ollama client, context-window bucketing, num_keep pinning
│   ├── rag.ts               # Hybrid retrieval, reranking, BM25, chunk stitching
│   ├── adaptiveSampling.ts  # Per-task sampling-hyperparameter profiles
│   ├── groundingVerifier.ts # Post-generation citation/claim check
│   ├── embeddings.ts        # Embedding generation, model unloading after retrieval
│   ├── fileWatcher.ts       # Ambient folder-watcher for project sync
│   ├── responseCache.ts     # Exact-hash and semantic response caching (client side)
│   ├── serverDb.ts          # SQLite-or-JSON persistence, incl. the cache's server side
│   ├── voiceEngine.ts       # Speech synthesis / recognition wiring
│   ├── ssrfGuard.ts         # SSRF defense
│   └── pathSandbox.ts       # Filesystem sandboxing
├── tests/                   # Vitest suites
└── FEATURES.md              # Full feature catalog, verified against the code
```

---

## License

Distributed under the [MIT License](LICENSE).
