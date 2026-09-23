# Fitur — Castalia

Katalog lengkap semua fitur yang **beneran ada dan jalan** di codebase ini saat ini. Berbeda dari `DOCUMENTATION.md` (yang section fitur-nya sudah basi — masih nyebut Google News RSS yang sudah diganti, dan belum nyebut Graphify/message-queue/agent-undo/dll) dan `README.md` (referensi teknis: stack, API, security). Dokumen ini jawabannya untuk "app ini bisa ngapain aja".

Setiap klaim di sini diverifikasi langsung dari kode, bukan dari nama fitur/komentar yang mungkin menyesatkan.

---

## Chat inti

- **Streaming chat** ke model Ollama lokal, atau cloud (Anthropic, Gemini, OpenAI, Groq, DeepSeek, OpenRouter) lewat proxy `/api/cloud/chat` yang otomatis redact secret sebelum keluar mesin.
- **Message queue** — ketik dan kirim follow-up selagi jawaban sebelumnya masih streaming. Satu slot, teks doang (nggak bisa attachment), otomatis terkirim begitu stream kelar.
- **Regenerate, edit pesan, percakapan bercabang (branch/fork)**.
- **Multimodal**: gambar (vision model), dokumen, source code — lewat file picker, paste clipboard, atau drag-drop.
- **Reasoning/thinking block** — otomatis deteksi tag `<think>...</think>` dari model yang support (DeepSeek-R1, Claude, Qwen, dll), ditampilin di accordion collapsible.

## Tool-calling (kemampuan agentic)

Model bisa manggil tool lewat directive `[TOOL_CALL:nama:{json}]` di teks outputnya sendiri (bukan native function-calling Ollama — pilihan sengaja biar konsisten di semua model/provider). **Perlu toggle "Disk Tools" nyala** di kolom chat biar tool ini masuk ke system prompt sama sekali — kalau mati, model nggak tau tool-tool ini eksis.

**Tool read-only** (jalan otomatis, nggak perlu approval):
- `list_directory`, `read_file`, `search_files` — baca filesystem lokal (sandboxed, nggak bisa keluar base directory).
- `graphify_explain` / `graphify_query` / `graphify_path` — nanya struktur kode **project ini sendiri** (bukan project lain) lewat CLI eksternal `graphify` (`pip install graphifyy`). `explain` buat satu simbol (fungsi/class), `query` buat pertanyaan bebas, `path` buat cari jalur koneksi antar dua simbol. Graph di-build sekali per server lifecycle (~7 detik), di-cache setelahnya.

**Tool mutating** (butuh approval manual dulu, token diverifikasi server-side, bukan cuma popup UI):
- `write_file`, `delete_file`.
- **Revert** — write/delete yang udah di-approve bisa di-undo satu klik dari riwayat approval. Nolak otomatis kalau file udah berubah lagi sejak aksi asli (nggak mau nimpa perubahan yang lebih baru secara diam-diam).

## Autonomous agents

- Tab terpisah di sidebar. Bikin agent dengan instruksi custom, jadwal **harian** (jam tertentu), **interval** (15 menit s/d 24 jam), atau **manual** ("Run Now").
- **Penting**: scheduler-nya jalan client-side (timer di browser tab), **bukan** cron server beneran — kalau tab ketutup pas jadwal harusnya jalan, dia cuma catch-up sekali begitu tab dibuka lagi, bukan jalan tepat waktu di background. UI-nya udah eksplisit bilang ini.
- Agent bisa manggil web search dan tool yang sama kayak chat manual, approval-gated sama seperti manual.

## RAG / pencarian di knowledge base project

- **Stage-2 Cross-Encoder Re-Ranking (Local LLM & In-Memory Cross-Scorer)**: Arsitektur two-stage retrieval mutakhir (SOTA). Tahap 1 melakukan coarse filtering cepat (BM25 + Dense Semantic via RRF) untuk menyaring kandidat awal, lalu Tahap 2 mengevaluasi relasi mendalam query-passage menggunakan cross-attention: single-batch prompt JSON via Ollama model lokal (`temperature: 0.0`) atau instant deterministic in-memory cross-scorer (< 0.1ms; phrase proximity, query term coverage, AST definition affinity). Dilengkapi score blending dinamis ($\alpha \cdot S_{\text{rerank}} + (1-\alpha) \cdot S_{\text{stage1}}$) serta pemangkasan threshold relevansi minimum (`minScore`) agar passage tidak relevan (false positive) langsung dibuang.
- **One-Click URL & Documentation Ingestion**: Ingest dokumentasi web atau artikel teknis langsung ke konteks chat dan knowledge base project via slash command `/url <url> [pertanyaan]` atau tombol "Import Web Documentation" di modal Project Knowledge. Dilengkapi proteksi SSRF berbasis DNS lookup (`assertPublicUrl`), fallback scraper Jina Reader untuk SPA/JavaScript, ekstraksi judul semantik, dan konversi otomatis menjadi file `.md` project.
- **Adjacent Chunk Stitching (Boundary Optimization)**: Menggabungkan beberapa chunk berurutan dari file yang sama (misal Part 1 dan Part 2) menjadi satu blok teks utuh dengan deduplikasi overlap perbatasan. Mencegah fungsi/syntax terpotong di tengah jalan dan menghemat token dari duplikasi header dokumen.
- **Hypothetical Document Embeddings (HyDE)**: Opsi generate jawaban sintesis teknis singkat via model lokal untuk di-embed ke ruang vektor, menjembatani jarak semantik antara pertanyaan pendek pengguna dengan deklarasi kode/dokumentasi.
- **Code-Graph Augmented Retrieval & AST Symbol Extraction**: Ekstraksi simbol kode otomatis (`function`, `class`, `interface`, `type`, `struct`) untuk TypeScript, JavaScript, Python, Go, dan Rust tanpa dependency binary berat. Membangun in-memory symbol graph antar-chunk dan cross-file; memberikan boost skor BM25 authoritative untuk chunk yang mendefinisikan simbol yang ditanyakan, serta mengekspansi konteks otomatis untuk menyertakan definisi simbol yang dirujuk jika token budget masih tersisa.
- **Hybrid Reciprocal Rank Fusion (RRF)**: Menggabungkan BM25 keyword ranking (selalu jalan, zero cost GPU) dengan dense semantic ranking (cosine similarity embedding Ollama) menggunakan formula RRF ($1 / (k + \text{rank})$), mencegah distorsi skor BM25 ekstrem/keyword-stuffing.
- **Pre-indexed chunk store (memory-cached by content-hash)**: Chunking dokumen di-cache per file (`getCachedFileChunks`) dan hanya dihitung ulang jika isi file atau parameter chunk berubah, memangkas overhead CPU saat chat dan saat membuka Project modal.
- Per-project configurable: chunk size, overlap, top-K, bobot blend BM25/semantic.
- Cache embedding by content-hash — cuma chunk yang berubah yang di-embed ulang, bukan seluruh project tiap turn.
- Query di-expand pakai 1-2 turn user sebelumnya, biar pertanyaan follow-up ("gimana cara pakainya?") tetap dapet konteks yang relevan.
- Diversity cap per-file di hasil ranking, biar satu file panjang nggak monopoli semua slot.

## Ambient file-watcher

Project bisa nunjuk ke folder asli di disk (bukan cuma upload manual) — perubahan file ke-sync otomatis lewat `fs.watch` (async, debounced), dicap 500 file/scan dan 2MB/file. Resume otomatis abis server restart.

## Connectors — bridge kustom

Nggak ada integrasi bawaan (Slack/Discord/GitHub/Blender template udah dihapus, diganti sistem generik). Dua jenis bridge yang bisa kamu bikin sendiri di Directory > Connectors:
- **Webhook** — POST JSON ke URL publik manapun (cocok buat Slack/Discord incoming webhook).
- **Local App** — bridge loopback-only ke aplikasi yang jalan di mesin kamu sendiri.

Dipanggil dari chat dengan `/bridge <bridge-id> <pesan>`.

## Local App Bridge framework

Pola generik (`lib/localAppBridge.ts`) buat nyambungin ke aplikasi desktop lokal lewat HTTP loopback — awalnya diekstrak dari integrasi Blender MCP, sekarang bisa dipakai buat aplikasi lain yang punya HTTP API lokal.

## Memory extraction otomatis

Kalau di-enable (`Settings > Memory > Generate from chats`), sistem otomatis ekstrak fakta durable dari tiap turn chat (bukan sensitif/kredensial — ada filter regex buat API key, token, kartu, dll yang selalu dibuang duluan sebelum disimpan, terlepas dari setting). Jalan lewat model Ollama lokal yang sama, nggak pernah lewat cloud.

## Codespace — sandbox eksekusi kode

Jalanin Python, Node, PowerShell, atau bash langsung dari browser (`/api/codespace/run`) — proses child async, env di-strip dari secret sebelum diteruskan, temp file dibersihin otomatis abis selesai (sukses maupun gagal).

## Journal

Sistem catatan pribadi terpisah dari chat — kategori (harian, tugas, ide), checklist item, status/prioritas, tag, dan bisa kirim isi entry ke chat buat didiskusiin sama AI.

## Knowledge Graph (visualisasi) — beda dari Graphify

**Catatan penting biar nggak ketuker:** ini bukan yang sama dengan tool `graphify_*` di atas. Ini visualisasi force-directed graph di dalam app, nunjukin hubungan antar **Project, File, Journal entry, dan Tag** kamu sendiri (data internal app) — bukan analisis struktur kode. Klik node buat navigasi langsung ke project/journal terkait.

## Skills & Plugins directory

Katalog skill (16) dan plugin (12) yang bisa di-toggle per-conversation, masing-masing nge-inject instruksi khusus ke system prompt (contoh: skill dokumen, skill coding). Nggak ada lagi fake download-count di situ — udah dihapus karena angkanya fabricated.

## Voice mode

Speech-to-text browser native (`webkitSpeechRecognition` — **bukan offline**, tetap manggil server Google di belakang layar) + text-to-speech dua pilihan: Natural Neural (prioritasin suara Microsoft/Google Online Natural) atau Browser Offline Default (`SpeechSynthesis` OS/browser lokal). OpenAI TTS udah dihapus (dari awal nggak pernah jalan — kena CORS block, OpenAI sengaja nggak izinin call langsung dari browser).

## Web search

Dual-engine (Bing + DuckDuckGo scraping paralel, bukan API resmi), hasil digabung+dedupe biar satu engine block/berubah markup nggak bikin hasil kosong total. Ada resolusi follow-up multi-turn ("yang kedua", "itu tadi") dan trust-boost buat domain teknis.

## Hardware-pressure hint

Banner dismissible (nggak pernah auto-switch) yang nyaranin model lebih ringan/cloud kalau VRAM kepake berat atau baterai rendah. VRAM dari `/api/ps` Ollama (retrospective, bukan prediktif), baterai dari `navigator.getBattery` (Chrome/Edge/Android doang, Firefox/Safari nggak pernah implement).

## Keamanan (ringkas — detail di README)

Bearer token + cross-site request rejection, SSRF guard per-use-case (public URL vs loopback-only vs Ollama host), filesystem path sandboxing, approval-token gate buat operasi tulis/hapus. Detail lengkap di `README.md#security-model`.

## Sinkronisasi & persistence

Satu flat store (`lib/serverDb.ts`, SQLite kalau ada native binding, fallback JSON kalau nggak) buat conversation/project/agent/connector/settings, di-broadcast ke tab lain yang lagi kebuka lewat Server-Sent Events (`/api/db/stream`) — bukan polling.

## Tema

8 tema warna (Midnight, OLED, Light, Cyberpunk, Forest, Sunset, Nord, System Auto).

---

*Dokumen ini per commit `349b699`. Kalau ada fitur baru ditambah, update di sini juga — jangan biarin basi kayak section fitur di `DOCUMENTATION.md`.*
