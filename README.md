# Ollama Chat Web

Self-hosted, local-first AI workspace built on Next.js 14 (App Router). Runs against local Ollama models with optional cloud provider fallback, and treats every filesystem/execution/network-reaching feature as something that needs an explicit security boundary rather than an afterthought.

For a broader feature walkthrough and architecture diagrams, see [`DOCUMENTATION.md`](./DOCUMENTATION.md). This README is the technical reference: stack, API surface, security model, and how to run/test/build the thing.

## Stack

| Layer | Choice | Version |
| :--- | :--- | :--- |
| Framework | Next.js, App Router only (no `/pages`) | `^14.2.35` |
| Language | TypeScript | `^5.6.3` |
| Styling | Tailwind CSS | `^3.4.15` |
| Local LLM runtime | Ollama (proxied, not embedded) | any recent |
| Persistence | `better-sqlite3` (WAL mode), optional | `^13.0.3` |
| Persistence fallback | Flat JSON (`data/db.json`) | — |
| Test runner | Vitest | `^1.6.1` |
| Icons | `@phosphor-icons/react` | `^2.1.10` |
| Markdown/math rendering | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex` | — |
| Syntax highlighting | `react-syntax-highlighter` (Prism) | `^16.1.1` |

`better-sqlite3` is an optional native dependency. If there's no prebuilt binary for your Node version and no C++ toolchain to compile it, `lib/serverDb.ts` falls back to `data/db.json` automatically at startup — same API surface either way, just without SQLite's crash-safety and indexing. On Linux this usually "just works" if `build-essential`/`python3` are present; on Windows it needs the "Desktop development with C++" workload in Visual Studio Installer, or a Node LTS version more likely to already have a prebuilt binary.

## Requirements

- Node.js 18+ (tested on 20 and 22)
- [Ollama](https://ollama.com/) running locally, with at least one chat model pulled
- Optionally `nomic-embed-text` (or another Ollama embedding model) pulled if you want hybrid semantic RAG instead of pure BM25

## Quick start

```bash
git clone https://github.com/p3nr0s3/ollama-chat-web.git
cd ollama-chat-web
npm install
cp .env.example .env.local

ollama serve
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text   # optional, for hybrid RAG

npm run dev
```

Open `http://127.0.0.1:3000`.

## npm scripts

| Script | What it does |
| :--- | :--- |
| `npm run dev` | Dev server bound to `127.0.0.1:3000` (localhost only) |
| `npm run dev:lan` | Dev server bound to `0.0.0.0:3000` — reachable from your LAN |
| `npm run build` | Production build (`next build`) |
| `npm start` | Serve the production build, localhost only |
| `npm run start:lan` | Serve the production build on `0.0.0.0` |
| `npm run tunnel` | Runs `scripts/tunnel.mjs` to expose the app publicly (localtunnel) |
| `npm test` | `vitest run` — the full test suite |
| `npm run lint` | `next lint` |

`predev`/`prestart` run `scripts/warnOpenAccess.mjs`, which prints a warning if you're about to bind to `0.0.0.0` or run the tunnel script without `APP_ACCESS_TOKEN` set.

## Configuration (`.env.local`)

Copy `.env.example` and fill in what you need — everything is optional except the access token if you plan to expose this beyond localhost.

```ini
# Gates every /api/* route. Generate with: openssl rand -hex 32
APP_ACCESS_TOKEN=
NEXT_PUBLIC_APP_ACCESS_TOKEN=

OLLAMA_HOST=http://127.0.0.1:11434

# Optional: server-side cloud provider keys. If set, these take precedence
# over whatever's typed into Settings > Cloud AI Providers (which stores
# keys in browser localStorage and sends them per-request instead).
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=

# Optional: only needed to allow a specific other origin to call this
# app's API cross-origin from browser JS. Leave unset to keep CORS closed.
ALLOW_EXTERNAL_ORIGIN=
```

## Security model

This is a single-user local tool with no account system, but several routes can read/write your filesystem, spawn processes, or forward your cloud API keys — so they're not left open by default reasoning alone. Defenses are layered in `middleware.ts` and applied per-route based on what that route can touch:

- **Request authentication** — routes are gated by a bearer token (`APP_ACCESS_TOKEN` / `NEXT_PUBLIC_APP_ACCESS_TOKEN`), plus independent cross-site request rejection so a malicious page open in another tab can't drive this app even if a token is misconfigured. Fine to leave unset for solo `localhost` use; set it before running `npm run tunnel` or `dev:lan`.
- **SSRF guards** (`lib/ssrfGuard.ts`) on every route that accepts a URL to fetch — custom bridge webhooks, deep-scrape targets, local app bridges, the Ollama proxy — each scoped to what that use case actually needs.
- **Filesystem sandboxing** (`lib/pathSandbox.ts`) on every disk-touching route, so a request can't escape its intended base directory.
- **Approval-token gate** on any file write/delete triggered from the chat tool loop or an autonomous agent — a UI confirm alone isn't enough; the server independently verifies the approval before acting.
- **Revert** — an already-approved write/delete can be undone from the approval history (one click, one-shot). Refuses automatically if the file has changed again since the original action, rather than risking a silent overwrite of that newer change.

The mechanisms above are implemented in the files named next to them — read those directly for exact behavior rather than relying on this summary staying in sync with the code.

## API surface

| Route | Purpose |
| :--- | :--- |
| `POST /api/cloud/chat` | Streaming proxy to Anthropic/Gemini/OpenAI/Groq/DeepSeek/OpenRouter, with automatic secret redaction (`lib/redaction.ts`) before anything leaves the machine |
| `* /api/ollama/[...path]` | Rate-limited proxy to a local (or LAN) Ollama instance |
| `POST /api/connectors` | Generic bridge dispatcher — `test`, `webhook_send`, `local_bridge_execute` for user-defined custom bridges (see below) |
| `GET/POST /api/db`, `GET /api/db/stream` | Database read/write and a Server-Sent Events stream for cross-tab live sync |
| `GET/POST /api/fs` | Sandboxed file explorer under a fixed base directory |
| `POST /api/tools/execute`, `POST /api/tools/execute-agent` | Disk tool execution for manual chat vs. autonomous agents, each with its own approval-source restriction |
| `POST /api/tools/revert` | Undoes an already-approved write_file/delete_file — refuses if the file has changed again since, so it can't silently clobber a newer edit |
| `POST /api/codespace/run` | Spawns a real child process (Python/Node/PowerShell/bash) to run in-browser Codespace code |
| `POST /api/scan` | Passive OWASP Top 10 checks against a target URL |
| `POST /api/search` | Built-in web search engine with deep-scrape fallback |
| `GET/POST /api/projects/watcher` | Starts/stops an ambient filesystem watcher for a project's knowledge folder |
| `GET /api/browser/status` | Reports whether the optional `bsk` (BrowserSkill) CLI bridge is available |

## Connectors: user-defined custom bridges

There are no pre-built integrations (no bundled Slack/Discord/GitHub/Blender templates) — every connector is added by hand under Directory > Connectors, as one of two types:

- **Webhook** — a plain `POST` with a JSON body to any public URL (`assertPublicUrl`-gated). This is the shape for Slack incoming webhooks, Discord webhooks, or any custom HTTP endpoint that accepts a JSON payload.
- **Local App** — a loopback-only HTTP bridge to something running on your own machine (`assertLoopbackOnlyUrl`-gated, via `lib/localAppBridge.ts`), for talking to a local desktop app over HTTP.

Trigger a configured bridge from chat with `/bridge <bridge-id> <message>`. See [`DOCUMENTATION.md`](./DOCUMENTATION.md#-local-app-bridge--framework-untuk-koneksi-ke-aplikasi-lokal) for the bridge framework's internals and a full example of wiring up a new one.

## RAG / retrieval

`lib/rag.ts` implements hybrid retrieval: BM25 keyword ranking always runs (zero GPU/VRAM cost, in-memory); an optional semantic pass blends in cosine similarity over Ollama embeddings when enabled. Per-project settings (chunk size, chunk overlap, top-K, and the BM25/semantic blend weight) are configurable in each project's Knowledge tab rather than hardcoded — defaults match the original hardcoded values, so existing projects behave identically until you change something.

`lib/embeddings.ts` caches embeddings by content hash + model, so re-embedding only happens for chunks that actually changed between chat turns, not the whole project on every message.

## Ambient file-watcher

A project's Knowledge tab can point at a real folder on the server's machine (`lib/fileWatcher.ts`) instead of (or alongside) manually uploaded files. Changes are picked up via `fs.watch`, debounced, and re-synced automatically — capped at 500 files per scan and 2MB per file, plain-text/code extensions only (binary formats like PDF still require manual upload, since their parsers run client-side via the browser's File API with no server-side equivalent). Watchers resume automatically after a server restart via `instrumentation.ts`.

## Hardware-pressure hint

After a local Ollama response finishes, a dismissible banner can appear suggesting a lighter or cloud model — never an automatic switch, this app is approval-gated by design. Two signals feed it, both intentionally scoped to what's actually measurable rather than guessed:

- **VRAM**: `lib/ollama.ts`'s `checkVramPressure` compares `size` against `size_vram` from Ollama's own `/api/ps` — i.e. how much of the model that just ran actually stayed resident in VRAM vs. spilled to system RAM. This is retrospective, not predictive: Ollama has no endpoint reporting total/free VRAM, and querying that portably across NVIDIA/AMD/Intel/Apple Silicon isn't realistic without shelling out to vendor-specific tools that may not be installed. It reports on a model that already ran, not whether one you haven't loaded yet will fit.
- **Battery**: `lib/hardwareSignals.ts`'s `getBatterySignal` feature-detects `navigator.getBattery` — Chrome/Edge/Android Chrome only; Firefox removed it and Safari never implemented it, both over fingerprinting concerns (not Baseline per MDN). Every other browser gets `null` here and the hint falls back to the VRAM signal alone.

## Testing

```bash
npm test              # vitest run — full suite
npx tsc --noEmit       # typecheck only
npm run build          # production build check
```

28 test files, 285 tests, covering (non-exhaustively):

- SSRF guard policies, including DNS-rebinding and IPv4-mapped-IPv6 edge cases
- The approval-token gate for both tool-execution routes (freshness, anti-replay, tool/path matching, source restriction)
- The generic custom-bridge connector route (webhook + local-http paths)
- Hybrid RAG ranking (BM25, semantic blending, custom chunk/topK config)
- The ambient file-watcher's sync logic (new/changed/deleted files, size limits, scan caps)
- Path sandbox traversal protection
- Document parsers, text diffing, response caching, context budget trimming

## Project layout

```
ollama-chat-web/
├── app/
│   ├── api/                    # Route handlers — see API surface table above
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 # Main controller: chat state, streaming, tool loop
├── components/                  # UI components (chat, codespace, journal, settings, directory)
├── lib/
│   ├── agentEngine.ts            # Autonomous agent tool-calling loop
│   ├── diskToolOps.ts             # Sandboxed disk tool implementations
│   ├── embeddings.ts               # Ollama embedding client + content-hash cache
│   ├── fileWatcher.ts               # Ambient project-folder sync
│   ├── localAppBridge.ts             # Generic loopback bridge framework
│   ├── pathSandbox.ts                 # Filesystem path containment
│   ├── rag.ts                          # BM25 + hybrid semantic retrieval
│   ├── responseCache.ts                 # LRU exact-match response cache
│   ├── serverDb.ts                       # SQLite (WAL) with JSON fallback
│   ├── ssrfGuard.ts                       # DNS-resolved SSRF policies
│   └── types.ts                            # Shared TypeScript types
├── middleware.ts                 # Bearer token + CSRF gate for /api/*
├── instrumentation.ts             # Resumes file-watchers on server start
├── next.config.mjs
└── tests/                          # Vitest suites, one file per module/route
```

## License

MIT — see `LICENSE`.
