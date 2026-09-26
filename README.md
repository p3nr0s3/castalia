# Castalia

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14.2.35-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Ollama](https://img.shields.io/badge/Ollama-Native%20API-white?logo=ollama)](https://ollama.com/)
[![Tests](https://img.shields.io/badge/Tests-44%20Suites%20%7C%20408%20Passed-brightgreen)](https://vitest.dev/)

A local-first AI workspace built on Next.js 14, for chatting with locally-hosted Ollama models (or an OpenAI/Anthropic/Gemini-compatible cloud API) with retrieval-augmented context from your own project files.

Single-user by design: there is no login system, and the only access control is a shared bearer token (see [Security](#security)). It's built for one person running it on their own machine, not for a team.

[Quick Start](#quick-start) • [What's inside](#whats-inside) • [Security](#security) • [Testing](#testing) • [Full feature catalog](FEATURES.md)

</div>

---

## What's inside

This is a short orientation, not a feature list — see **[FEATURES.md](FEATURES.md)** for the complete, code-verified catalog of everything below (and things not mentioned here, like the journal, connectors, and skills directory).

- **Chat** with local Ollama models or a connected cloud provider, with streaming, branching, multimodal input, and a `<think>` block renderer for reasoning models.
- **Two-stage RAG** over project files: BM25 + dense-vector retrieval fused with RRF, an optional reranking pass, adjacent-chunk stitching, and an ambient filesystem watcher that keeps the index in sync with files on disk.
- **Agentic tool calls** (`list_directory`, `read_file`, `write_file`, `delete_file`, and a few others) gated behind an explicit toggle; file-mutating calls require a server-verified, single-use approval before they run, and can be reverted.
- **A sandboxed Codespace** for running Python (via Pyodide/WASM), Node, PowerShell, or bash from the browser.
- **A response cache** (exact-hash and, optionally, semantic-similarity) that skips regeneration for repeat prompts, persisted server-side so it survives a reload.
- **Inference-side tuning**: context-window bucketing to avoid over-allocating KV cache, per-task sampling profiles, and KV prefix pinning for static system prompts.
- **A post-generation grounding check** that flags claims/citations not backed by the retrieved context.

None of this has been benchmarked against other tools — the claims above describe what the code does, not how well it performs relative to alternatives.

---

## Quick Start

### 1. Prerequisites
- **Node.js** 18+ or 20+
- **[Ollama](https://ollama.com/)** running locally:
  ```bash
  ollama serve
  ollama pull llama3.1:8b        # a chat model
  ollama pull nomic-embed-text   # optional: enables semantic (not just keyword) retrieval
  ```

### 2. Setup & Run
```bash
git clone https://github.com/p3nr0s3/castalia.git
cd castalia

npm install

# Optional — see .env.example for what this protects and why it matters
# the moment you expose this app beyond localhost.
cp .env.example .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or [http://127.0.0.1:3000](http://127.0.0.1:3000)).

---

## Security

- **SSRF guard** (`lib/ssrfGuard.ts`): resolves DNS before dispatching outbound requests, to block loopback/internal-subnet targets and DNS-rebinding.
- **Filesystem path sandbox** (`lib/pathSandbox.ts`): confines file operations to a designated root, rejects `../` traversal.
- **Approval records**: server-side, single-use, bound to the specific tool call and its arguments, with a 5-minute expiry and one-click revert.
- **Secret redaction** (`lib/redaction.ts`): strips API keys/tokens from payloads before they're sent to a cloud provider.
- **Auth**: a single shared bearer token (`APP_ACCESS_TOKEN`), checked in `middleware.ts`. This token is also exposed client-side (`NEXT_PUBLIC_APP_ACCESS_TOKEN`) because there's no server-side session — treat it as a lock on the door, not a secret, and don't rely on it alone if you expose this app beyond your own machine. See `.env.example` for details.

This is defense against accidents and casual misuse (an errant `../` path, a stray request to a metadata endpoint), not a hardened multi-tenant security boundary. If you need real user accounts, audit logs, or isolation between users, this isn't that.

---

## Testing

```bash
npm test              # Vitest — 44 suites, 408 tests as of this writing
npx tsc --noEmit       # type check
npm run build          # production build
npm run analyze        # production build with a bundle-size breakdown (opens .next/analyze/*.html)
```

Test counts drift as the codebase changes — the badge above and the count here reflect the last time this file was updated, not a live number.

---

## Project Structure

```
castalia/
├── app/                     # Next.js App Router — pages, API routes, /codespace
├── components/              # UI components (chat, sidebar, modals, codespace, projects)
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
