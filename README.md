# Castalia

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14.2.35-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Ollama](https://img.shields.io/badge/Ollama-Native%20API-white?logo=ollama)](https://ollama.com/)
[![Tests](https://img.shields.io/badge/Tests-44%20Suites%20%7C%20404%20Passed-brightgreen)](https://vitest.dev/)
[![Security](https://img.shields.io/badge/Security-SSRF%20Guarded%20%2B%20Sandboxed-success)](#security)

**A local-first AI workspace built on Next.js 14.**  
Engineered for zero-waste local LLM inference, hybrid two-stage RAG, sandboxed tool execution, in-browser Codespace IDE, and persistent prompt caching.

[Quick Start](#quick-start) • [Key Highlights](#key-highlights) • [Architecture](#architecture) • [Security](#security) • [Testing](#testing) • [Features Catalog](FEATURES.md)

</div>

---

## Key Highlights

- **Two-Stage RAG & Ambient Knowledge**:
  - *Stage 1 (Coarse Search)*: BM25 lexical keyword matching + Dense Semantic vector search blended via **Reciprocal Rank Fusion (RRF)**.
  - *Stage 2 (Reranker)*: In-memory lexical cross-scorer (keyword coverage, n-gram proximity, AST symbol affinity; no GPU cost). When semantic RAG is enabled, it can also score candidates with a local LLM batch JSON proxy (`temperature: 0.0`).
  - *Ambient Folder Watcher*: Real-time background filesystem monitoring synchronizes local directory changes directly into the retrieval engine without manual re-indexing.
  - *Web Documentation Ingestion*: Scrapes and extracts full web articles, tutorials, and API documentation for immediate AI context.
  - *Context Optimization*: U-shaped *Lost-in-the-Middle* perimeter reordering, adjacent chunk stitching, and **HyDE** (Hypothetical Document Embeddings) expansion.
- **Fullscreen Codespace IDE**:
  - Full-screen local web IDE powered by **Pyodide WebAssembly (Python 3.12)** and **Node.js** backend runners.
  - VS Code-style layout: File explorer on the left, code editor on top, and a **resizable horizontal bottom terminal** with execution telemetry, copy output, and clear logs.
  - Staff AI Copilot with 1-click code review, bug fix, optimization, unit test generation, and live HTML/CSS preview sandbox.
- **Voice & Speech Synthesis Studio**:
  - Ultra-fluent natural neural voice engine (Microsoft Natural, Google Neural, and local browser synthesis) with zero robotic cadence.
  - 3 Conversational Tone Modes: *Casual & Natural* (akrab/santai), *Concise* (to the point), and *Formal*.
  - Fine-grained controls for pitch, speech rate, and auto-silence speech detection sensitivity.
- **Zero VRAM Waste & Hardware Inference Optimization**:
  - **Dynamic Context Window Bucketing**: Power-of-2 context tiers (`2048`, `4096`, `8192`, `16384`...) prevent massive upfront KV-cache memory reservations in llama.cpp, cutting VRAM overhead by 50–75% for routine conversations.
  - **VRAM Isolation & Evacuation**: Automatically evacuates background embedding models (`keep_alive: 0`) immediately post-retrieval so the primary chat model operates with 100% available GPU headroom.
  - Automated **KV Cache Prefix Pinning** (`options.num_keep`) keeps static system prompts warm in GPU memory.
  - **Task-Adaptive Sampling**: Dynamically switches hyperparameter profiles (temperature, top-p, min-p, repeat penalty) for coding precision (`temp: 0.2`) vs creative generation (`temp: 0.85`).
- **Post-Generation Grounding & Anti-Hallucination**:
  - Real-time **Citation & Hallucination Verifier**: Verifies referenced files and claims against retrieved knowledge chunks with bilingual stopword filtering, generating interactive **[ShieldCheck]** confidence badges.
  - **Document Compaction & Directive Injection**: Strips license boilerplate and enforces strict negative constraints (*do not speculate outside provided texts*).
  - **High-Density Rolling Micro-Summaries**: Semantic bullet-point compaction ensures initial user objectives and technical decisions are never lost across extended dialogues.
- **Dual-Tier Response Caching**:
  - Exact FNV-1a hash matching (always on) and semantic vector similarity ($\ge 0.96$, requires an embedding model such as `nomic-embed-text`). Cache hits skip generation entirely (0 GPU tokens).
  - Persisted via SQLite (`response_cache` table) with an automatic JSON-file fallback.
- **Modern Clean Workspace & Controls**:
  - Fluid full-width Projects Gallery & Project Detail View that adapts to viewport expansions.
  - Clean `<select>` dropdown controls for theme palettes, typography fonts, thinking modes, context capacities, and model keep-alive presets.
  - Auto-hiding responsive sidebar with a collapsible drag slider.
  - Dynamic code-splitting (`next/dynamic`) for instant cold-start and reduced initial bundle footprint.
- **Sandboxed Agentic Tools & Safety**:
  - Server-verified **single-use approval records** (5-minute expiry, tool and argument matching, replay protection) with one-click revert for mutating disk actions (`write_file`, `delete_file`).
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
git clone https://github.com/p3nr0s3/castalia.git
cd castalia

# Install dependencies
npm install

# (Optional) Setup environment
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or [http://127.0.0.1:3000](http://127.0.0.1:3000)) in your browser.

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
    │  - Semantic Vector   │          │  - Ambient Watcher   │
    │  - SQLite / JSON     │          │  - Cross-Encoder     │
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
- **Approval Records**: Server-side single-use approvals bound to tool name and arguments, with expiry and one-click reversibility.
- **Secret Redaction** (`lib/redaction.ts`): Strips sensitive API keys and secrets before payloads leave to cloud providers.

---

## Testing

Comprehensive test suite with 100% pass rate:

```bash
# Run Vitest test suite (44 suites, 404 tests)
npm test

# Run TypeScript type safety check
npx tsc --noEmit

# Run production build
npm run build
```

---

## Project Structure

```
castalia/
├── app/                 # Next.js App Router (pages, API routes, layout, codespace)
├── components/          # Modular UI components (Chat, Sidebar, Modals, Codespace, Projects)
├── lib/
│   ├── ollama.ts        # Ollama client, dynamic context bucketing, num_keep pinning
│   ├── rag.ts           # Hybrid retrieval, Cross-Encoder re-ranker, BM25, Lost-in-Middle, compaction
│   ├── adaptiveSampling.ts # Task-adaptive hyperparameter profile engine (Coding/RAG/Creative)
│   ├── groundingVerifier.ts # Post-generation citation and hallucination verifier
│   ├── embeddings.ts    # Embeddings generator and VRAM model isolation unloader
│   ├── fileWatcher.ts   # Ambient Folder Watcher daemon for real-time background sync
│   ├── responseCache.ts # Exact FNV-1a & semantic vector response caching
│   ├── voiceEngine.ts   # Natural speech synthesis & conversational tone engine
│   ├── ssrfGuard.ts     # DNS-rebinding-safe SSRF defense matrix
│   └── pathSandbox.ts   # Sandboxed directory containment
├── tests/               # 44 Vitest unit & integration test suites (404 passed)
└── FEATURES.md          # Exhaustive feature catalog
```

---

## License

Distributed under the [MIT License](LICENSE).
