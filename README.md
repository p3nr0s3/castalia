# Castalia

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14.2.35-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Ollama](https://img.shields.io/badge/Ollama-Native%20API-white?logo=ollama)](https://ollama.com/)
[![Tests](https://img.shields.io/badge/Tests-41%20Suites%20%7C%20371%20Passed-brightgreen)](https://vitest.dev/)
[![Security](https://img.shields.io/badge/Security-SSRF%20Guarded%20%2B%20Sandboxed-success)](#security)

**A minimalist, high-performance, local-first AI workspace built on Next.js 14.**  
Engineered for zero-waste local LLM inference, state-of-the-art Two-Stage RAG, sandboxed tool execution, and prompt caching.

[Quick Start](#quick-start) • [Key Highlights](#key-highlights) • [Architecture](#architecture) • [Security](#security) • [Testing](#testing) • [Features Catalog](FEATURES.md)

</div>

---

## Key Highlights

- **SOTA Two-Stage RAG**:
  - *Stage 1 (Coarse Search)*: BM25 lexical keyword matching + Dense Semantic vector search blended via **Reciprocal Rank Fusion (RRF)**.
  - *Stage 2 (Cross-Encoder)*: Deep query-passage re-ranking via local LLM batch JSON prompt (`temperature: 0.0`) or instant (< 0.1ms) in-memory AST symbol & phrase proximity cross-scoring.
  - *Context Optimization*: U-shaped *Lost-in-the-Middle* perimeter reordering, adjacent chunk stitching, and **HyDE** semantic expansion.
- **Zero VRAM Waste & Instant Turns**:
  - Automated **KV Cache Prefix Pinning** (`options.num_keep`) keeps static system prompts warm in GPU memory.
  - Automatic **Context Window Resolution** eliminates Ollama's default 2048-token truncation, safely scaling up to 131K tokens.
- **Dual-Tier Response Caching**:
  - Sub-millisecond exact FNV-1a hash matching and semantic vector similarity ($\ge 0.96$) to answer repeat queries with **0ms latency and 0 GPU tokens**.
- **Sandboxed Agentic Tools & Safety**:
  - Cryptographically signed **one-click reversible approval tokens** for mutating disk actions (`write_file`, `delete_file`).
  - DNS-rebinding-safe SSRF guard matrix (`lib/ssrfGuard.ts`) and filesystem path sandboxing.
- **Fluid 60fps Streaming**:
  - Micro-batched token render throttler with a real-time non-blocking `<think>` reasoning parser.

---

## Quick Start

### 1. Prerequisites
- **Node.js** 18+ or 20+
- **[Ollama](https://ollama.com/)** running locally:
  ```bash
  ollama serve
  ollama pull llama3.1:8b        # Primary chat model
  ollama pull nomic-embed-text   # Optional: For hybrid semantic embeddings
  ```

### 2. Setup & Run
```bash
# Clone the repository
git clone https://github.com/p3nr0s3/ollama-chat-web.git
cd ollama-chat-web

# Install dependencies
npm install

# (Optional) Setup environment
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Architecture

```
                    ┌────────────────────────┐
                    │    Next.js Frontend    │
                    │ (60fps Throttled / UI) │
                    └───────────┬────────────┘
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
    ┌──────────────────────┐          ┌──────────────────────┐
    │  Dual-Tier Cache     │          │  Two-Stage RAG       │
    │  - FNV-1a Hash       │          │  - BM25 + Embeddings │
    │  - Semantic Vector   │          │  - Cross-Encoder     │
    └──────────┬───────────┘          └──────────┬───────────┘
               │                                 │
               └────────────────┬────────────────┘
                                │
                                ▼
               ┌─────────────────────────────────┐
               │    VRAM Queue & Ollama Daemon   │
               │  - KV Prefix Pinning (num_keep) │
               │  - Safe Context Res (num_ctx)   │
               └────────────────┬────────────────┘
                                │
                                ▼
               ┌─────────────────────────────────┐
               │    Sandboxed Execution Tools    │
               │  - SSRF Guard / Path Sandbox    │
               │  - Approval & One-Click Revert  │
               └─────────────────────────────────┘
```

---

## Security

Castalia enforces strict defense-in-depth security:
- **SSRF Defense Matrix** (`lib/ssrfGuard.ts`): Resolves DNS records before network dispatch to block loopback, internal subnets, and DNS-rebinding attacks.
- **Filesystem Path Sandbox** (`lib/pathSandbox.ts`): Confines disk operations within designated roots, rejecting traversal (`../`).
- **Approval Tokens**: Server-verified single-use nonces for mutating disk operations with one-click reversibility.
- **Secret Redaction** (`lib/redaction.ts`): Strips sensitive API keys and secrets before payloads leave to cloud providers.

---

## Testing

Comprehensive test suite with 100% pass rate:

```bash
# Run Vitest test suite (41 suites, 371 tests)
npm test

# Run TypeScript type safety check
npx tsc --noEmit

# Run production build
npm run build
```

---

## Project Structure

```
ollama-chat-web/
├── app/                 # Next.js App Router (pages, API routes, layout)
├── components/          # Modular UI components (Chat, Sidebar, Modals, Codespace, Journal)
├── lib/
│   ├── ollama.ts        # Ollama client, context resolution, num_keep pinning
│   ├── rag.ts           # Hybrid retrieval, Cross-Encoder re-ranker, BM25, Lost-in-Middle
│   ├── responseCache.ts # Exact FNV-1a & semantic vector response caching
│   ├── ssrfGuard.ts     # DNS-rebinding-safe SSRF defense matrix
│   └── pathSandbox.ts   # Sandboxed directory containment
├── tests/               # 41 Vitest unit & integration test suites
└── FEATURES.md          # Exhaustive feature catalog
```

---

## License

Distributed under the [MIT License](LICENSE).
