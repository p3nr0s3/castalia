# Katalog Fitur & Spesifikasi Teknis — Lyra

Dokumen ini merupakan referensi teknis mengenai seluruh fitur dan subsistem yang aktif di Lyra. Setiap deskripsi disusun dari implementasi kode, dan referensi file-nya diperiksa otomatis oleh `tests/docsReferences.test.ts`. Angka performa adalah estimasi kecuali disebut terukur. Dokumen ini mencakup arsitektur modul, algoritma yang digunakan, serta batasan (*trade-offs*) teknis yang berlaku.

---

## Daftar Isi
1. [Arsitektur Chat & Multi-Model](#1-arsitektur-chat--multi-model)
2. [Efisiensi Inferensi & Optimasi VRAM Hardware](#2-efisiensi-inferensi--optimasi-vram-hardware)
3. [Retrieval-Augmented Generation (RAG) 2-Tahap](#3-retrieval-augmented-generation-rag-2-tahap)
4. [Codespace IDE & Sandbox Eksekusi Kode](#4-codespace-ide--sandbox-eksekusi-kode)
5. [Tool-Calling & Sistem Keamanan Agentic](#5-tool-calling--sistem-keamanan-agentic)
6. [Autonomous Scheduled Agents](#6-autonomous-scheduled-agents)
7. [Memori Jangka Panjang & Ekstraksi Fakta](#7-memori-jangka-panjang--ekstraksi-fakta)
8. [Pencarian Web Terpadu (Dual-Engine Scraper)](#8-pencarian-web-terpadu-dual-engine-scraper)
9. [Voice Studio & Speech Synthesis](#9-voice-studio--speech-synthesis)
10. [Caching Respon & Persistensi Data](#10-caching-respon--persistensi-data)
11. [Manajemen Ruang Kerja & Personalisasi UI](#11-manajemen-ruang-kerja--personalisasi-ui)
12. [Keamanan Permintaan & Jaringan](#12-keamanan-permintaan--jaringan)

---

## 1. Arsitektur Chat & Multi-Model

### 1.1 Streaming & Protokol Komunikasi
* **Implementasi**: `app/page.tsx`, `lib/ollama.ts`.
* **Mekanisme**: Komunikasi ke Ollama lokal memanfaatkan protokol native streaming NDJSON via HTTP `POST /api/generate` dan `/api/chat`. Respon di-*throttle* menggunakan micro-batcher berbasis `requestAnimationFrame` untuk mempertahankan rendering UI pada 60fps tanpa membebani thread utama React.
* **Dukungan Cloud Provider**: Selain Ollama lokal, sistem mendukung provider cloud (OpenAI, Anthropic Claude, Google Gemini, Groq, DeepSeek, OpenRouter) melalui proxy server internal `/api/cloud/chat`. Secret dan API key dalam teks percakapan dimasker (`lib/redaction.ts`) sebelum dikirim ke endpoint cloud; endpoint kustom (`custom`) boleh lokal/LAN tetapi tidak boleh menunjuk ke alamat link-local/metadata dan tidak mengikuti redirect. Permintaan upstream dibatalkan saat klien memutus koneksi.

### 1.2 Message Queue (FIFO Tunggal)
* **Implementasi**: `components/ChatInput.tsx`, `app/page.tsx`.
* **Mekanisme**: Memungkinkan pengguna mengetik dan mengirim pesan lanjutan saat model sedang men-generate respons sebelumnya. Antrean berkapasitas 1 slot teks; begitu respons aktif selesai di-stream, pesan dalam antrean otomatis dieksekusi secara berurutan.
* **Batasan**: Antrean saat ini hanya mendukung pesan teks biasa (tidak mendukung penambahan lampiran file saat stream berlangsung).

### 1.3 Manajemen Percakapan Multi-Turn & Branching
* **Implementasi**: `app/page.tsx`, `components/ChatMessage.tsx`.
* **Mekanisme**:
  * **Edit Pesan**: Pengguna dapat mengedit pesan user sebelumnya; riwayat percakapan setelah titik edit akan dipotong dan di-generate ulang.
  * **Branch / Fork Conversation**: Pengguna dapat mencabangkan percakapan dari pesan asisten mana pun menjadi sesi percakapan independen baru tanpa mengubah sesi asal.
  * **Regenerate**: Permintaan pembuatan ulang respons dengan opsi penyesuaian parameter.

### 1.4 Reasoning Parser (`<think>`)
* **Implementasi**: `lib/reasoningParser.ts`, `components/ChatMessage.tsx`.
* **Mekanisme**: Pengurai berbasis stream yang mendeteksi tag `<think>...</think>` secara real-time pada model penalaran yang menulis penalarannya sebagai teks (mis. DeepSeek-R1 atau Qwen via Ollama), serta field `reasoning`/`reasoning_content` yang di-stream provider kompatibel OpenAI seperti DeepSeek. Blok penalaran dipisahkan dari jawaban final dan ditampilkan dalam accordion interaktif yang dapat dilipat/dibuka.
* **Mode Think (semua model, termasuk cloud)**: mode `think` menyuntikkan direktif prompt agar model membungkus penalarannya dalam `<think>…</think>`, yang lalu diurai parser yang sama. Ini berbasis prompt, bukan fitur *extended thinking* native: proxy cloud belum meminta *extended thinking* dari Anthropic atau *thought summaries* dari Gemini, jadi tanpa mode Think model Claude/Gemini tidak menampilkan blok penalaran.
* **Error di tengah stream**: bila Ollama melaporkan kegagalan setelah HTTP 200 (`{"error": "..."}` — mis. runner crash atau kehabisan memori), error itu dilempar ke UI; sebelumnya baris tersebut dibuang sehingga jawaban terpotong tanpa pesan.

### 1.5 Input Multimodal
* **Implementasi**: `components/ChatInput.tsx`, `lib/ollama.ts`.
* **Mekanisme**: Mendukung input gambar untuk model visual (LLaVA, MiniCPM) serta file dokumen (PDF, Markdown, Source Code, TXT) melalui file picker, clipboard paste (`Ctrl+V`), dan drag-and-drop. Dokumen teks diekstraksi ke buffer memori sebelum diteruskan ke konteks model.
* **Provider cloud**: gambar diteruskan dalam format masing-masing provider (`lib/cloudVision.ts`: `image_url` untuk OpenAI-kompatibel, blok `image` base64 untuk Anthropic, `inlineData` untuk Gemini). Batas: PNG/JPEG/WebP/GIF, maks. 4 gambar per pesan, ≈5 MB per gambar; tipe lain (mis. SVG), data non-base64, atau ukuran berlebih dibuang. Pesan tanpa gambar tetap dikirim sebagai string biasa agar backend teks-saja tidak menolaknya. Model yang tidak mendukung visi akan mengembalikan galat dari provider.

---

## 2. Efisiensi Inferensi & Optimasi VRAM Hardware

### 2.1 Dynamic Context Window Bucketing
* **Implementasi**: `lib/ollama.ts` (`calculateContextBucket`, `CONTEXT_WINDOW_BUCKETS`).
* **Mekanisme**: Ollama / llama.cpp mengalokasikan memori VRAM untuk KV cache di awal berdasarkan nilai `num_ctx`. Jika nilai dipatok statis di 32K atau 64K, VRAM GPU akan terkunci secara berlebihan meskipun chat hanya berisi 300 token. Fitur ini secara dinamis mengelompokkan panjang konteks ke dalam tier pangkat dua (*power-of-two*): `2048`, `4096`, `8192`, `16384`, `32768`, `65536`, `131072`.
* **Dampak**: Mengurangi alokasi KV cache pada obrolan pendek dibanding `num_ctx` statis besar, sekaligus mempertahankan prefix cache (`num_keep`) pada turn dalam tier yang sama. Besar penghematan bergantung pada model dan panjang percakapan dan belum diukur di repositori ini.

### 2.2 Task-Adaptive Sampling Engine
* **Implementasi**: `lib/adaptiveSampling.ts` (`detectSamplingProfile`, `resolveAdaptiveSamplingParams`).
* **Mekanisme**: Menganalisis intent prompt pengguna dan secara otomatis menyesuaikan hyperparameter inferensi:
  * **Coding**: `temperature: 0.2`, `top_p: 0.85`, `min_p: 0.05`, `repeat_penalty: 1.15` (presisi deterministik, mencegah impor fiktif).
  * **RAG / Dokumen**: `temperature: 0.3`, `top_p: 0.9`, `min_p: 0.05`, `repeat_penalty: 1.15` (fokus faktual pada konteks).
  * **Creative**: `temperature: 0.85`, `top_p: 0.95`, `min_p: 0.02`, `repeat_penalty: 1.05` (ekspresi beragam).
  * **General**: memakai nilai dasar dari pengaturan pengguna (bawaan: `temperature: 0.7`, `top_p: 0.9`, `min_p: 0.05`, `repeat_penalty: 1.1`).
* **Preseden Override**: Pengaturan manual pengguna di panel Settings selalu memiliki prioritas tertinggi di atas deteksi otomatis.

### 2.3 Laya System-1 Decision Engine (Non-Autoregressive Routing)
* **Implementasi**: `lib/layaClient.ts`, `app/page.tsx`, `components/SettingsModal.tsx`, `components/ApprovalQueueModal.tsx`.
* **Arsitektur**: Mengintegrasikan engine keputusan non-autoregresif berbasis encoder ModernBERT / mmBERT (`NandhaKishorM/laya`) yang berjalan di CPU RAM (~30–50ms latency) sebagai sistem "System 1" sebelum model chat autoregresif utama (System 2) dipanggil.
* **Fungsi Utama**:
  * **Intent & Sampling Profiling**: Mengklasifikasikan prompt pengguna ke profil `coding`, `rag`, `creative`, atau `general` memakai model encoder alih-alih aturan kata kunci (belum dibandingkan secara terukur terhadap heuristik bawaan), serta mendukung kueri multibahasa (Bahasa Indonesia & Inggris).
  * **Dynamic Deep Reasoning Trigger**: Mendeteksi pertanyaan analitis kompleks (seperti pembuktian matematis, arsitektur sistem, atau algoritma) dan menyarankan aktivasi mode `<think>` secara otomatis saat percakapan berada pada mode `default`.
  * **Safety Guardrail**: Mengevaluasi risiko keamanan operasi disk bermutasi (`write_file`, `delete_file`) dan memunculkan indikator peringatan risiko pada antrean persetujuan (*Approval Queue*).
* **Indikator Status**: `Settings > Chat > Laya` menampilkan badge online/offline beserta latensi. Ping otomatis dijalankan sekali saat toggle Laya dinyalakan, dan bisa diulang manual lewat tombol *Test Ping*.
* **Graceful Silent Fallback**: Jika server Laya tidak aktif atau kueri mengalami batas waktu (timeout 1200–1500ms), Lyra secara transparan jatuh kembali (*fall back*) ke heuristik bawaan tanpa jeda atau error pada antarmuka pengguna.

### 2.4 Isolasi VRAM & Evakuasi Model Embedding
* **Implementasi**: `lib/embeddings.ts` (`unloadEmbeddingModel`), `lib/rag.ts`.
* **Mekanisme**: Pada GPU kelas konsumen (6–8 GB VRAM), membiarkan model embedding (seperti `nomic-embed-text`) tetap berada di VRAM bersamaan dengan model chat 7B/8B dapat memicu perpindahan layer ke RAM sistem (*CPU layer spilling*). Permintaan embedding memakai `keep_alive: "5s"`, dan sistem mengirim `keep_alive: 0` (`unloadEmbeddingModel`) segera setelah tahap retrieval selesai, membebaskan VRAM kembali ke model chat utama.

### 2.5 Prefix Caching (`num_keep`)
* **Implementasi**: `lib/ollama.ts`.
* **Mekanisme**: Menghitung estimasi token untuk system prompt statis dan menyematkannya via parameter `options.num_keep`. Ini mencegah komputasi ulang KV cache pada system prompt di setiap giliran pesan.

### 2.6 Deteksi Tekanan Perangkat Keras
* **Implementasi**: `lib/hardwareSignals.ts`.
* **Mekanisme**: Membaca penggunaan VRAM dari endpoint `/api/ps` milik Ollama dan status baterai melalui `navigator.getBattery` (jika didukung browser). Memberikan indikator peringatan non-intrusif jika memori GPU berada di ambang batas.

### 2.7 Unified Cross-Platform Launcher (All-in-One Runner)
* **Implementasi**: `scripts/launch.mjs`, `package.json` (`npm run dev:all`, `npm run start:all`).
* **Mekanisme**: Orkestrator proses berbasis Node.js murni yang secara otomatis mendeteksi lingkungan Python (virtualenv `.venv`/`venv`/`env` atau sistem), memvalidasi paket Laya, menyalakan server HTTP Laya di latar belakang (`http://127.0.0.1:8000`), menyuntikkan flag `NEXT_PUBLIC_AUTO_LAYA=true`, lalu menyalakan server Lyra Next.js dalam 1 langkah.
* **Manajemen Siklus Hidup**: Menangani penutupan terpadu (*graceful termination*) lintas sistem operasi (Windows, Linux, macOS). Saat pengguna menekan `Ctrl+C`, launcher mematikan *process tree* Next.js dan Python secara bersamaan tanpa meninggalkan proses zombie pada port 8000.

---

## 3. Retrieval-Augmented Generation (RAG) 2-Tahap

### 3.1 Stage-1: Hybrid Retrieval & Reciprocal Rank Fusion (RRF)
* **Implementasi**: `lib/rag.ts` (`rankChunksHybrid`).
* **Mekanisme**: Memadukan pencarian leksikal BM25 (pencocokan kata kunci) dengan pencarian vektor semantik (cosine similarity embedding Ollama) menggunakan formula Reciprocal Rank Fusion:
  $$\text{RRF}(d) = \sum \frac{1}{k + \text{rank}(d)}$$
  dengan konstanta $k = 60$. Pendekatan ini menyeimbangkan presisi kata kunci teknis (nama fungsi/variabel) dengan pemahaman semantik pertanyaan.

### 3.2 Stage-2: Cross-Encoder Re-Ranking
* **Implementasi**: `lib/rag.ts` (`rankChunksCrossScorer`, `buildOptimizedKnowledgeContextAsync`).
* **Mekanisme**: Calon chunk hasil Stage-1 dievaluasi ulang menggunakan cross-scorer deterministik dalam memori (tanpa panggilan model) berdasarkan kedekatan frasa (*phrase proximity*), cakupan istilah kueri (*query term coverage*), dan afinitas AST simbol. Jika diaktifkan, sistem juga dapat menjalankan re-ranking via LLM lokal dengan prompt JSON terstruktur (`temperature: 0.0`).

### 3.3 Ekstraksi Simbol AST & Code-Graph Augmented Retrieval
* **Implementasi**: `lib/rag.ts` (`extractSymbolsFromCodeChunk`, `buildProjectSymbolGraph`).
* **Mekanisme**: Pengenal simbol berbasis regex (bukan parser AST sungguhan) untuk TypeScript, JavaScript, Python, Go, dan Rust tanpa dependensi biner pihak ketiga. Membangun graf keterhubungan simbol dalam memori. Memberikan boost ranking pada chunk yang mendefinisikan simbol yang ditanyakan pengguna, serta mengekspansi konteks dengan definisi simbol terkait jika sisa token budget mencukupi.

### 3.4 Boundary-Aware Adjacent Chunk Stitching
* **Implementasi**: `lib/rag.ts` (`stitchAdjacentChunks`).
* **Mekanisme**: Jika beberapa chunk berurutan dari file yang sama terpilih dalam hasil retrieval, sistem secara cerdas menggabungkannya kembali menjadi satu bagian utuh dengan menduplikasi overlap perbatasan. Mencegah fungsi atau blok kode terpotong di tengah jalan dan menghemat token dari duplikasi header.

### 3.5 Pemadatan Dokumen & Arahan Anti-Halusinasi
* **Implementasi**: `lib/rag.ts` (`compactDocumentChunk`, `assembleContextFromRanked`).
* **Mekanisme**:
  * **Compaction**: Memangkas header lisensi boilerplate (MIT, Apache, BSD, GPL) dan merampingkan spasi berlebih untuk menghemat ruang token.
  * **Negative Constraint Prompting**: Menginjeksikan direktif grounding yang tegas pada header konteks, menginstruksikan model untuk secara eksplisit menolak berspekulasi jika informasi tidak ditemukan dalam teks sumber.

### 3.6 Post-Generation Citation & Hallucination Verifier
* **Implementasi**: `lib/groundingVerifier.ts`, `components/ChatMessage.tsx`.
* **Mekanisme**: Berjalan secara lokal pasca-generasi pada turn RAG.
  * Mengekstrak referensi file dan memvalidasinya terhadap file riil yang di-retrieve.
  * Memverifikasi klaim kalimat terhadap teks konteks dengan filter stopword dwibahasa (Indonesia & Inggris).
  * Menghasilkan skor 0–100% dan status (`verified`, `partial`, `unverified`) yang ditampilkan pada badge UI **[ShieldCheck]** beserta kartu inspeksi detail.

### 3.7 Ambient Folder Watcher
* **Implementasi**: `lib/fileWatcher.ts`.
* **Mekanisme**: Memantau direktori lokal di disk secara real-time via `fs.watch` (debounced). Perubahan berkas otomatis disinkronkan ke dalam indeks proyek tanpa perlu upload ulang manual.
* **Batasan**: Dibatasi maksimal 500 file per pemindaian dan 2 MB per file untuk mencegah pemborosan memori I/O.

### 3.8 Ingesti Dokumentasi Web (`/url`)
* **Implementasi**: `lib/webSearchEngine.ts` (`scrapePageContent`), `app/api/projects/ingest-url/route.ts`.
* **Mekanisme**: Mengekstrak artikel atau dokumentasi teknis via slash command `/url <link>` atau tombol import. Dilengkapi validasi SSRF (`assertPublicUrl` untuk pesan galat awal, lalu `safeFetch` yang mem-pin IP dan memvalidasi setiap redirect), batas ukuran body, fallback Jina Reader (`r.jina.ai`) untuk situs berbasis SPA/JavaScript, dan konversi otomatis ke format Markdown.
* **Catatan privasi**: fallback Jina mengirim URL halaman ke layanan pihak ketiga tersebut; URL yang ditolak guard SSRF tidak pernah diteruskan ke sana.

---

## 4. Codespace IDE & Sandbox Eksekusi Kode

### 4.1 Tata Letak Workspace Tiga Panel
* **Implementasi**: `app/codespace/page.tsx`, `components/CodespaceView.tsx`.
* **Mekanisme**: Antarmuka layar penuh (*fullscreen*) dengan susunan:
  1. Panel kiri: Penjelajah file virtual (*file tree explorer*) dengan operasi buat, ubah nama, dan hapus berkas.
  2. Panel kanan atas: Editor kode berbasis web dengan syntax highlighting dan line numbering.
  3. Panel kanan bawah: Terminal eksekusi horizontal yang dapat diatur ukurannya (*resizable split pane*).

### 4.2 Runtime Eksekusi Ganda
* **Pyodide (Python 3.12 WebAssembly)**: Berjalan di browser dalam iframe `sandbox="allow-scripts"`, tanpa memerlukan Python di mesin host. Runtime (Pyodide v0.26.2) **diunduh dari CDN jsDelivr saat pertama dipakai**, jadi butuh koneksi internet dan tidak memakai SRI.
* **Subproses server lokal (`/api/codespace/run`)**: Mengeksekusi Python (native), JavaScript, TypeScript (Node 22.6+ dengan `--experimental-strip-types`), dan shell (bash/PowerShell) sebagai proses anak dengan:
  * variabel lingkungan yang dipersempit (*environment scrubbing*, tanpa `APP_ACCESS_TOKEN` atau API key),
  * timeout 1–30 detik (nilai non-numerik jatuh ke 15 detik) dan pemutusan **seluruh process tree** saat timeout atau output melebihi 500 KB,
  * maksimal 4 eksekusi bersamaan (sisanya HTTP 429),
  * pembersihan file sementara otomatis.
* **Peringatan**: rute ini menjalankan kode sembarang dengan hak akses pengguna (bukan sandbox OS). Perlindungannya adalah gerbang permintaan di bagian 12.

### 4.3 Telemetri & Tindakan Cepat AI Copilot
* **Telemetri**: Menampilkan status exit code, durasi eksekusi (ms), stream stdout, dan stderr.
* **AI Copilot Quick-Actions**: Tombol integrasi satu klik untuk *Review Code*, *Fix Bugs*, *Optimize*, *Generate Tests*, serta pratinjau langsung untuk file HTML/CSS.

---

## 5. Tool-Calling & Sistem Keamanan Agentic

### 5.1 Protokol Inline Tool Calling
* **Implementasi**: `lib/tools.ts`.
* **Mekanisme**: Menggunakan protokol directive eksplisit `[TOOL_CALL:tool_name:{"arg":"val"}]` pada output teks model. Pilihan arsitektur ini memastikan kompatibilitas yang seragam di seluruh model lokal dan open-weights tanpa bergantung pada schema function-calling proprietary.

### 5.2 Pembagian Kategori & Gerbang Persetujuan (Approval Gate)
* **Read-Only Tools (Otomatis, tanpa persetujuan)**:
  * `list_directory`, `read_file`, `search_files`: Membaca struktur dan isi direktori. Cakupan: chat manual = seluruh disk kecuali denylist direktori OS; agen = direktori home. Di semua mode, penyimpanan kredensial (`~/.ssh`, `~/.aws`, profil browser, keychain, file kunci privat) serta file `.env*` dan folder `data/` milik aplikasi ditolak.
  * `graphify_explain`, `graphify_query`, `graphify_path`: Analisis struktur dependensi kode via CLI `graphify`.
* **Mutating Tools (Approval-Gated)**:
  * `write_file`, `delete_file`: Menulis atau menghapus file di disk.
  * **Verifikasi Server-Side** (`lib/toolApproval.ts`): eksekusi hanya berjalan jika record approval di database server berstatus `approved`, untuk tool yang sama dan **argumen yang identik (path dan content)**, berusia maksimal 5 menit, dan belum terpakai. Approval dikonsumsi sekali (aman terhadap permintaan paralel), dan penggabungan sinkronisasi bersifat monoton sehingga salinan basi dari tab lain tidak bisa menghidupkan kembali approval yang sudah terpakai.
  * **Batas jaminan**: record approval berada di database yang sama yang bisa ditulis pemanggil same-origin lewat `/api/db`. Gerbang ini adalah konfirmasi + perlindungan replay, **bukan** batas autentikasi; yang menjaga pemanggil luar adalah gerbang permintaan (bagian 12).

### 5.3 One-Click Revert & Rollback
* **Implementasi**: `app/api/tools/revert/route.ts` (snapshot `previousContent` disimpan pada record approval, lihat `lib/types.ts`).
* **Mekanisme**: Saat operasi `write_file` disetujui, sistem menyimpan snapshot konten berkas sebelumnya. Pengguna dapat membatalkan perubahan (*rollback*) kapan saja dengan satu klik. Sistem otomatis menolak rollback jika berkas telah dimodifikasi oleh proses lain di luar aplikasi untuk mencegah konflik data.

### 5.4 Matriks Pertahanan SSRF & Path Sandboxing
* **Kebijakan IP (`lib/ipPolicy.ts`)**: daftar *allow* alamat unicast global. Semua blok khusus (loopback, RFC1918, CGNAT `100.64/10`, link-local, multicast, `::`, NAT64, 6to4, Teredo, rentang dokumentasi) diblokir, termasuk IPv4 yang tertanam di IPv6.
* **SSRF Defense (`lib/ssrfGuard.ts`, `lib/safeFetch.ts`)**: `safeFetch` me-resolve DNS sekali per hop, memeriksa semua alamat, **mem-pin koneksi TCP ke alamat yang sudah divalidasi** (menutup DNS-rebinding), mengikuti redirect secara manual dengan validasi ulang tiap hop (maks. 5), dan membatasi ukuran body. Dipakai oleh webhook connectors, ingesti URL, scraper pencarian, dan pemindai OWASP.
* **Proxy (`lib/proxyPaths.ts`)**: proxy Ollama dan Laya hanya me-relay path API upstream masing-masing. Host `?host=` sengaja fleksibel (LAN atau cloud) dan hanya memblokir link-local/metadata; tanpa daftar path, proxy ini bisa dipakai memanggil rute aplikasi sendiri (*confused deputy*).
* **Path Sandbox (`lib/pathSandbox.ts`)**: `resolveWithinBase` menolak `../` dan juga *symlink* yang keluar dari root (dibandingkan lewat `realpath`). `resolveWithinHomeSafe` (file explorer, agen, watcher) menambah denylist kredensial. `resolveOnLocalDisk` (chat manual) membuka seluruh disk dengan denylist direktori OS + denylist kredensial.

---

## 6. Autonomous Scheduled Agents

### 6.1 Manajemen & Eksekusi Agent
* **Implementasi**: `components/AgentModal.tsx`, `components/AgentLogsModal.tsx`, `lib/agentEngine.ts`.
* **Mekanisme**: Pengguna dapat mendefinisikan agen otonom dengan system prompt khusus, setelan model, dan akses ke tool. Agen dapat dijalankan secara langsung (*Run Now*) atau dijadwalkan secara periodik.

### 6.2 Pola Penjadwalan (Scheduling)
* **Jadwal Harian**: Menjalankan tugas pada jam dan menit spesifik setiap hari.
* **Interval**: Menjalankan tugas berulang setiap $N$ menit/jam (15 menit hingga 24 jam).
* **Batasan Arsitektur**: Penjadwal berjalan pada thread tab browser (*client-side timer*), bukan sebagai daemon cron level OS. Jika tab browser tertutup pada jadwal eksekusi, agen akan mengeksekusi tugas tersebut satu kali (*catch-up*) saat tab browser dibuka kembali.

---

## 7. Memori Jangka Panjang & Ekstraksi Fakta

### 7.1 Ekstraksi Fakta Otomatis
* **Implementasi**: `lib/memoryExtractor.ts`.
* **Mekanisme**: Saat opsi diaktifkan, sistem menganalisis dialog percakapan di latar belakang menggunakan model lokal untuk mengekstraksi fakta penting dan preferensi pengguna yang bersifat tahan lama (*durable facts*).

### 7.2 Pembersihan Kredensial Sensitif
* **Mekanisme**: Seluruh teks yang diproses oleh modul memori disaring terlebih dahulu melalui ekspresi reguler pencegah kebocoran rahasia. Kunci API, token JWT, password, dan nomor kartu otomatis dibuang sebelum fakta disimpan ke database lokal.

---

## 8. Pencarian Web Terpadu (Dual-Engine Scraper)

### 8.1 Scraping Paralel Tanpa API Key Eksternal
* **Implementasi**: `lib/webSearchEngine.ts`, `app/api/search/route.ts`.
* **Mekanisme**: Menggabungkan hasil pencarian secara paralel dari mesin pencari publik (Bing & DuckDuckGo HTML scraping), ditambah Google News RSS untuk kueri berita dan Wikipedia untuk kueri konsep, tanpa mewajibkan langganan API berbayar. Hasil dari kedua sumber digabungkan, disaring dari duplikasi (*deduplicated*), dan diurutkan kembali.

### 8.2 Resolusi Kueri Multi-Turn & Bobot Domain Teknis
* **Mekanisme**: Memperluas kueri pengguna dengan konteks turn sebelumnya untuk menangani pertanyaan rujukan (misal: "bagaimana cara instalasinya?"). Memberikan bobot relevansi lebih tinggi (*trust boost*) pada dokumentasi teknis terverifikasi (MDN, GitHub, StackOverflow, dokumentasi resmi).

---

## 9. Voice Studio & Speech Synthesis

### 9.1 Speech-to-Text (STT)
* **Implementasi**: `components/VoiceModeModal.tsx`.
* **Mekanisme**: Memanfaatkan antarmuka Web Speech API bawaan browser (`webkitSpeechRecognition`) untuk transkripsi audio pengguna secara real-time ke dalam prompt chat.
* **Catatan Privasi**: Pengenalan suara Web Speech API bergantung pada layanan pemrosesan suara native dari vendor browser.

### 9.2 Text-to-Speech (TTS) & Preset Intonasi
* **Implementasi**: `lib/voiceEngine.ts`.
* **Mekanisme**: Mengintegrasikan browser `speechSynthesis` dengan prioritas suara neural alami (Microsoft Natural / Google Neural). Mendukung 3 mode intonasi percakapan:
  * **Casual & Natural**: Nada santai dan interaktif.
  * **Concise**: Respons padat langsung ke inti persoalan.
  * **Formal**: Tata bahasa baku dan formal.
  Dilengkapi kontrol audio untuk pitch, laju bicara (*rate*), dan penghentian otomatis saat pengguna menyela (*barge-in*).

---

## 10. Caching Respon & Persistensi Data

### 10.1 Dual-Tier Response Cache
* **Implementasi**: `lib/responseCache.ts`, `lib/serverDb.ts`, `app/api/cache/route.ts`.
* **Tier 1 (Exact Hash)**: Pencocokan kunci dari model + prompt + system prompt memakai hash FNV-1a **64-bit** (`fnv1a64Hex` di `lib/responseCache.ts`, diuji terhadap vektor uji FNV resmi) — selalu aktif. Kunci berbentuk `pc_` + 16 heksadesimal. Hash ini non-kriptografis; cukup untuk membedakan prompt milik satu pengguna, bukan untuk input adversarial.
* **Tier 2 (Semantic Vector)**: Menguji kedekatan kosinus vektor embedding ($\ge 0.96$). **Hanya aktif jika `Settings > Retrieval > Semantic RAG` dinyalakan** dan model embedding tersedia. Cache hit melewati proses generate sepenuhnya (tanpa token GPU), tapi lookup semantic tetap memakan waktu untuk membuat embedding kueri (timeout 1200 ms) — bukan "0 latensi". Cache dilewati saat ada konteks web search.
* **Penyimpanan**: Map in-memory (60 entri, cepat, sinkron) di depan penyimpanan server persisten (maks. 500 entri, TTL 2 jam) di tabel SQLite `response_cache` atau file `data/response-cache.json` — terpisah dari `db.json` agar tidak membengkakkan database utama. Entri di server dibaca hanya saat Map in-memory miss. Sinkronisasi memeriksa versi lewat `readServerDbVersion()` (satu baris pada SQLite) — bukan membaca seluruh database — baik di `/api/db/stream` (tiap 2 detik per tab) maupun `GET /api/db?v=`. Lookup semantic dikirim sebagai **POST** (`{"action":"semantic-lookup"}`) karena vektor 768-dim ≈ 17 KB melebihi batas header HTTP 16 KB bila ditaruh di query string (sebelumnya selalu HTTP 431).
* **Pengelolaan**: Tombol **Clear Response Cache** di `Settings > Data` menghapus cache in-memory sekaligus yang tersimpan di server.

### 10.2 Persistensi Server-Side & Sinkronisasi Antar-Tab
* **Implementasi**: `lib/serverDb.ts`, `app/api/db/stream/route.ts`.
* **Mekanisme**: Data percakapan, project, dan pengaturan disimpan pada database lokal (SQLite dengan binding native atau fallback file JSON `data/db.json`). Cache respon sengaja **tidak** ikut di sini — lihat 10.1. Perubahan data disiarkan (*broadcast*) ke tab browser lain secara real-time menggunakan Server-Sent Events (SSE), menghindari overhead polling berkala.

---

## 11. Manajemen Ruang Kerja & Personalisasi UI

### 11.1 Projects Gallery & Knowledge Base
* **Implementasi**: `components/ProjectsGallery.tsx`, `components/ProjectModal.tsx`.
* **Mekanisme**: Ruang kerja berbasis proyek dengan konfigurasi RAG per-proyek (ukuran chunk, overlap, top-K, perbandingan bobot leksikal vs semantik).

### 11.2 Catatan Pribadi (Journal)
* **Implementasi**: `components/JournalView.tsx`.
* **Mekanisme**: Modul pencatatan terstruktur yang terpisah dari sesi chat dengan kategori (`daily`, `task`, `idea`, `project`, `quick`), status (`draft`, `in_progress`, `done`, `archived`) dan prioritas, checklist interaktif, serta integrasi satu klik untuk mengirim catatan ke sesi chat sebagai bahan diskusi AI.

### 11.3 Visualisasi Knowledge Graph
* **Implementasi**: `components/KnowledgeGraphModal.tsx`.
* **Mekanisme**: Visualisasi graf interaktif berbasis canvas (*force-directed layout*) yang memetakan hubungan antar-entitas internal aplikasi: Proyek, Berkas Dokumen, Catatan Jurnal, dan Tag. Memungkinkan navigasi cepat ke entitas terkait saat sebuah node diklik.

### 11.4 Palet Tema & Tipografi
* **Implementasi**: `components/SettingsModal.tsx`, `app/globals.css`, `lib/types.ts` (`ThemeType`).
* **Mekanisme**: tema `light`, `dark`, `system`, `claude`, `oled`, `dracula`, `catppuccin`, `tokyo-night`, `rose-pine`, `cyberpunk`, `forest`, `sunset`, `nord`, ditambah palet kustom (`custom`). Didukung pemilih tipografi font dan kontrol lebar antarmuka (*fluid / centered*). Font web dimuat dari Google Fonts (lihat `app/layout.tsx`), sehingga tampilan font bergantung pada koneksi internet.

---

## 12. Keamanan Permintaan & Jaringan

### 12.1 Gerbang Permintaan (Tiga Lapis)
* **Implementasi**: `middleware.ts`, `lib/requestGuard.ts`, `tests/requestGuard.test.ts`.
* **Lapis 1 — Allowlist `Host`** (semua path): hanya `localhost`, literal IP, nama satu-label (LAN), `*.local`, `*.localhost`, domain tunnel Pinggy, dan isi `ALLOWED_HOSTS`. Mencegah *DNS-rebinding*: halaman di situs lain bisa membuat browser menganggap aplikasi ini *same-origin* dan membaca `NEXT_PUBLIC_APP_ACCESS_TOKEN` dari bundle JS, tetapi tidak bisa memalsukan header `Host`.
* **Lapis 2 — Wajib same-origin**: untuk semua method mutasi di `/api/*`, dan untuk semua method pada `/api/codespace`, `/api/tools`, `/api/fs`, `/api/db`, `/api/connectors`. Memakai `Sec-Fetch-Site` (hanya `same-origin`/`none` lolos; `same-site` ditolak karena server dev lain di port berbeda juga *same-site*), dengan cadangan pemeriksaan `Origin` vs `Host`. Origin eksternal hanya lolos jika sama persis dengan `ALLOW_EXTERNAL_ORIGIN`.
* **Lapis 3 — Bearer token** `APP_ACCESS_TOKEN` (opsional): dibandingkan dalam waktu konstan dengan kode murni JS. Middleware berjalan di Edge Runtime, sehingga tidak boleh mengimpor modul Node seperti `crypto`; test statis menjaga hal ini (sebelumnya token yang benar pun menghasilkan HTTP 500). Rute SSE `/api/db/stream` menerima `?token=` karena `EventSource` tidak bisa mengirim header.
* **Batasan**: lapis 3 nonaktif jika token tidak diset. Token juga terekspos ke browser (`NEXT_PUBLIC_*`), jadi ia pengunci pintu, bukan rahasia.

### 12.2 Mode LAN & Tunnel Publik
* **Implementasi**: `scripts/tunnel.mjs`, `scripts/loadEnv.mjs`, `scripts/warnOpenAccess.mjs`.
* **Mode LAN**: `npm run dev:lan`, `start:lan` (dan `dev:all:lan`, `prod:all:lan` lewat `scripts/launch.mjs`) **menolak berjalan tanpa `APP_ACCESS_TOKEN`** (override sadar: `ALLOW_OPEN_LAN=1`). Pemeriksaan dirantai langsung di script (`node scripts/warnOpenAccess.mjs --lan && next …`), bukan lewat hook `pre*`, karena `.npmrc` memakai `ignore-scripts=true` yang membuat npm melewati hook tersebut. Launcher juga tidak meneruskan API key/token ke proses Python Laya dan mendeteksi Python tanpa shell (aman untuk path berspasi).
* **Mekanisme tunnel**: `npm run tunnel` membuka tunnel SSH ke Pinggy dan menampilkan URL + QR. Menolak berjalan tanpa `APP_ACCESS_TOKEN` (dibaca dari lingkungan **dan** `.env.local`), memperingatkan bila `NEXT_PUBLIC_APP_ACCESS_TOKEN` tidak cocok, dan memakai `StrictHostKeyChecking=accept-new` (kunci host dipercaya saat pertama kali, ditolak bila berubah).

---

*Dokumen ini ditulis dari kode. Referensi file dan beberapa fakta yang pernah menyimpang (nilai sampling, daftar tema, jumlah suite) diperiksa oleh `tests/docsReferences.test.ts`; klaim performa lain adalah estimasi.*
