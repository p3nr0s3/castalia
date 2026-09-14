# Security & Feature Review: ollama-chat-web

Dokumen audit dan tinjauan teknis komprehensif terhadap fitur, arsitektur, dan postur keamanan (*security posture*) aplikasi **ollama-chat-web** pada commit [`4cd1c29`](https://github.com/p3nr0s3/ollama-chat-web/commit/4cd1c29).

---

## 📌 Metadata Audit

- **Proyek**: `ollama-chat-web`
- **Tanggal Audit**: 14 September 2026
- **Basis Kode**: Next.js 14.2 (App Router), TypeScript, Tailwind CSS, Node.js v24
- **Target Tinjauan**: Seluruh rute API (`/api/*`), Middleware, Web Search Engine, Codespace Runner, Disk Tools, Connectors, dan Manajemen Penyimpanan.

---

## 🧭 Ringkasan Eksekutif

Aplikasi `ollama-chat-web` dirancang sebagai *local-first AI workspace* yang kaya fitur. Sebagian besar komponen telah mengadopsi prinsip *Defense in Depth* yang sangat baik, seperti *Path Sandboxing* terpusat, mekanisme *Human-in-the-Loop Approval* untuk aksi destruktif berkas, penyensoran data sensitif (*PII/Secret Redaction*), serta mode pencarian web yang ketat (*Strict Mode*).

Namun, tinjauan ini mengidentifikasi **3 temuan keamanan pada lapisan API** yang memerlukan perhatian dan perbaikan, terutama saat aplikasi dijalankan dalam mode pengembangan tanpa konfigurasi token akses (`APP_ACCESS_TOKEN`), atau saat diakses melalui *reverse proxy/tunnel*.

---

## 📊 Matriks Temuan Keamanan

| ID | Tingkat Keparahan | Komponen Terdampak | Jenis Kerentanan | Rekomendasi Tindakan | Perlu Fix? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | 🔴 **CRITICAL** | `app/api/codespace/run` & `middleware.ts` | Cross-Site Request Forgery (CSRF) & Cross-Origin RCE | Validasi ketat `Origin` & `Sec-Fetch-Site` | **YA (Sangat Perlu)** |
| **SEC-02** | 🟠 **HIGH** | `app/api/search` & `lib/webSearchEngine.ts` | Server-Side Request Forgery (SSRF) pada Direct Scraper | Terapkan `assertPublicUrl` sebelum fetch | **YA (Perlu)** |
| **SEC-03** | 🟡 **MEDIUM** | `app/api/ollama/[...path]` | Unvalidated Host Parameter (Internal Network Probing) | Sanitasi & batasi IP loopback/link-local | **YA (Disarankan)** |

---

## 🔍 Detail Temuan Keamanan & Rekomendasi Remediasi

### 1. [SEC-01] Cross-Site Request Forgery (CSRF) & Cross-Origin RCE pada Codespace Runner

> [!CAUTION]
> **Tingkat Keparahan: CRITICAL**
>
> **Lokasi File**:
> - [`app/api/codespace/run/route.ts:L121-L193`](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/app/api/codespace/run/route.ts#L121-L193)
> - [`middleware.ts:L39-L45`](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/middleware.ts#L39-L45)

#### Deskripsi & Mekanisme Celah
1. Endpoint `/api/codespace/run` menerima kode skrip (`python`, `javascript`, `typescript`, `shell/powershell`) dan menjalankannya langsung di mesin host menggunakan `child_process.spawn`.
2. Pada `middleware.ts`, jika variabel lingkungan `APP_ACCESS_TOKEN` tidak disetel (kondisi *default* saat pengguna menjalankan `npm run dev`), seluruh request diizinkan lewat tanpa autentikasi:
   ```typescript
   if (!requiredToken) {
     return NextResponse.next();
   }
   ```
3. Di browser, penyerang pada situs web pihak ketiga yang dibuka oleh pengguna dapat mengirimkan request `POST` lintas-situs (*cross-site*) ke `http://127.0.0.1:3000/api/codespace/run`.
4. Jika request dikirim dengan metode atau format yang memintas preflight CORS sederhana (misal melalui *form submission* atau script injection), skrip sistem asli (PowerShell/Shell) dapat tereksekusi di laptop host pengguna tanpa konfirmasi.

#### Dampak Risiko
Eksekusi perintah arbitrer (*Remote Code Execution*) pada sistem operasi host oleh situs web eksternal yang dikunjungi pengguna saat server web lokal sedang aktif.

#### Rekomendasi Remediasi
Terapkan pertahanan *Fetch Metadata Request Headers* (`Sec-Fetch-Site`) dan verifikasi kecocokan `Origin` / `Host` pada rute berbahaya:
```typescript
const secFetchSite = req.headers.get("sec-fetch-site");
const origin = req.headers.get("origin");
const host = req.headers.get("host");

// Tolak request cross-site jika token akses tidak disediakan
if (secFetchSite === "cross-site" && !providedToken) {
  return NextResponse.json(
    { error: "Forbidden: cross-site requests are rejected." },
    { status: 403 }
  );
}
```

---

### 2. [SEC-02] Server-Side Request Forgery (SSRF) pada Direct Web Scraper

> [!WARNING]
> **Tingkat Keparahan: HIGH**
>
> **Lokasi File**:
> - [`app/api/search/route.ts:L54-L71`](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/app/api/search/route.ts#L54-L71)
> - [`lib/webSearchEngine.ts:L181-L195`](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/lib/webSearchEngine.ts#L181-L195)

#### Deskripsi & Mekanisme Celah
1. Endpoint `/api/search` memiliki fitur *Direct URL Reader Mode*: jika input kueri memuat URL, server akan langsung melakukan *scrape* konten menggunakan fungsi `scrapePageContent(targetUrl)`.
2. Berbeda dengan `/api/scan` dan `/api/connectors` yang telah dilengkapi proteksi [`assertPublicUrl`](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/lib/ssrfGuard.ts#L99), `scrapePageContent` langsung memanggil `fetch(url)` tanpa memvalidasi apakah IP tujuan adalah alamat privat/lokal.
3. Jika pengguna memasukkan atau agen AI terkelabui oleh *prompt injection* untuk membaca URL seperti:
   - `http://127.0.0.1:11434/api/tags` (Port internal Ollama)
   - `http://192.168.1.1/` (Panel router internal)
   - `http://169.254.169.254/latest/meta-data/` (Metadata cloud instance AWS/GCP)
   server akan mengambil data jaringan privat tersebut dan menampilkannya sebagai ringkasan teks pencarian.

#### Dampak Risiko
Kebocoran informasi jaringan privat (*Internal Network Reconnaissance*), pembacaan layanan lokal tanpa autentikasi, atau eksfiltrasi data instans *cloud*.

#### Rekomendasi Remediasi
Integrasikan `assertPublicUrl` ke dalam alur *direct scraping*:
```typescript
if (isUrl && targetUrl) {
  try {
    await assertPublicUrl(targetUrl);
  } catch (err: any) {
    if (err instanceof SsrfBlockedError) {
      return NextResponse.json(
        { error: `Scraping blocked: ${err.message}` },
        { status: 403, headers: CORS_HEADERS }
      );
    }
  }
  const scrapedText = await scrapePageContent(targetUrl, 4000);
  ...
}
```

---

### 3. [SEC-03] Unvalidated `host` Parameter SSRF pada Ollama Proxy

> [!NOTE]
> **Tingkat Keparahan: MEDIUM**
>
> **Lokasi File**:
> - [`app/api/ollama/[...path]/route.ts:L18-L33`](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/app/api/ollama/%5B...path%5D/route.ts#L18-L33)

#### Deskripsi & Mekanisme Celah
1. Rute proksi Ollama membaca parameter query `host`:
   ```typescript
   function getOllamaHost(req: NextRequest): string {
     const url = new URL(req.url);
     const hostParam = url.searchParams.get("host");
     let host = hostParam || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
   ```
2. Nilai `hostParam` ini diteruskan langsung ke pemanggilan `fetch(`${host}/${path}`)`.
3. Parameter ini dapat disalahgunakan untuk mengarahkan request server Next.js ke alamat IP dan port sembarang di jaringan lokal untuk melakukan pemindaian port (*port scanning*).

#### Rekomendasi Remediasi
Batasi format `hostParam` agar hanya mengizinkan loopback terdaftar (`127.0.0.1`, `localhost`) atau validasi bahwa host yang dimasukkan bukan alamat link-local/cloud metadata (`169.254.x.x`).

---

## 🌟 Tinjauan Fitur & Arsitektur Pertahanan yang Sudah Solid

Berikut adalah fitur-fitur yang telah diimplementasikan dengan standar keamanan dan arsitektur yang sangat kokoh:

1. **Path Sandboxing Terpusat ([lib/pathSandbox.ts](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/lib/pathSandbox.ts))**:
   - Fungsi `resolveWithinBase` memvalidasi batasan path secara absolut dan membandingkannya dengan pemisah direktori OS (`normalizedBase + path.sep`).
   - Mencegah serangan *directory traversal* (`../../`) dan *sibling-prefix bypass*.

2. **Human-in-the-Loop Mutating Disk Tools ([app/api/tools/execute/route.ts](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/app/api/tools/execute/route.ts))**:
   - Operasi destruktif seperti `write_file` dan `delete_file` wajib memiliki `approvalToken` yang diverifikasi ke basis data server (`serverDb`).
   - Token approval dibatasi masa kedaluwarsanya (< 5 menit), diverifikasi kesesuaian argumen path-nya, dan langsung dicatat sebagai `consumedAt` agar tidak dapat dipakai ulang (*replay attack*).
   - Memiliki daftar hitam direktori inti OS (`DENYLISTED_ROOTS`: `C:\Windows`, `C:\Program Files`, dll) untuk mencegah kerusakan OS.

3. **Penyensoran Kunci Sensitif Otomatis ([lib/redaction.ts](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/lib/redaction.ts))**:
   - Sebelum pesan pengguna atau konteks percakapan dikirim ke penyedia LLM Cloud (Gemini, OpenAI, Anthropic, DeepSeek), teks dipindai untuk mendeteksi kunci API, token OAuth, dan password, kemudian otomatis disamarkan (*redacted*).

4. **Strict Mode & Multi-Turn Web Search Engine ([app/page.tsx](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/app/page.tsx) & [lib/webSearchEngine.ts](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/lib/webSearchEngine.ts))**:
   - Mematuhi kontrol pengguna: internet hanya dihubungi jika tombol Web Search menyala.
   - Menggunakan dynamic calendar year locking (`2026`), eliminasi spam definisi kata (KBBI), dan resolusi anaphora multi-turn yang akurat.

5. **Sandbox Eksekusi Subproses Codespace ([app/api/codespace/run/route.ts](file:///C:/Users/Rei/.gemini/antigravity/scratch/ollama-chat-web/app/api/codespace/run/route.ts))**:
   - Menggunakan `buildChildEnv()` yang secara eksplisit membatasi variabel lingkungan. Variabel sensitif proses induk (seperti kunci API atau `APP_ACCESS_TOKEN`) tidak dibocorkan ke skrip yang dijalankan.
   - Menerapkan batasan waktu eksekusi (*timeout*) ketat dan pemotongan ukuran buffer output (maksimal 500 KB) untuk mencegah *Denial of Service* (DoS).

---

## 🎯 Rencana Tindakan Perbaikan (Action Plan)

Jika disetujui, langkah perbaikan dapat diterapkan dalam 3 tahap:
1. **Patch SEC-01**: Tambahkan verifikasi `Sec-Fetch-Site` & `Origin` di `middleware.ts` dan periksa header pada endpoint `/api/codespace/run`.
2. **Patch SEC-02**: Impor `assertPublicUrl` ke `/api/search/route.ts` dan jalankan sebelum `scrapePageContent`.
3. **Patch SEC-03**: Validasi `hostParam` di `/api/ollama/[...path]/route.ts` agar tidak dapat mengeksploitasi IP metadata/privat sembarang.
