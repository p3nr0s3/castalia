// lib/tools.ts
//
// Definisi 4 disk tools yang didukung oleh app/api/tools/execute/route.ts.
// File ini adalah satu-satunya sumber kebenaran untuk nama tool & skema argumen,
// dipakai baik untuk native tool-calling payload maupun untuk membangun
// directive fallback (ReAct) buat model yang tidak dukung native tools.

export type ToolName =
  | "list_directory"
  | "read_file"
  | "write_file"
  | "search_files"
  | "delete_file"
  | "graphify_explain"
  | "graphify_query"
  | "graphify_path";

/** Tool read-only dieksekusi otomatis; tool yang mengubah state (write/delete) wajib approval manual untuk agent. */
export const READ_ONLY_TOOLS: ToolName[] = [
  "list_directory",
  "read_file",
  "search_files",
  "graphify_explain",
  "graphify_query",
  "graphify_path",
];
export const MUTATING_TOOLS: ToolName[] = ["write_file", "delete_file"];

export interface ToolParamSchema {
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: Record<string, ToolParamSchema>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_directory",
    description:
      "List isi sebuah folder di disk lokal user (nama file/folder, ukuran, tanggal modifikasi). Path kosong berarti home directory user.",
    parameters: {
      path: { type: "string", description: "Path absolut (mis. 'D:\\Projects\\foo' atau '/home/user/foo'), atau relatif ke home directory.", required: false },
      recursive: { type: "boolean", description: "Jika true, masuk ke subfolder juga (maks kedalaman 3).", required: false },
      maxItems: { type: "number", description: "Batas jumlah item yang dikembalikan (maks 200).", required: false },
    },
  },
  {
    name: "read_file",
    description: "Baca isi teks sebuah file di disk lokal user (drive/folder mana pun, bukan cuma folder project).",
    parameters: {
      path: { type: "string", description: "Path absolut atau relatif ke home directory dari file yang mau dibaca.", required: true },
      maxBytes: { type: "number", description: "Batas ukuran baca dalam byte (default 2MB).", required: false },
    },
  },
  {
    name: "write_file",
    description: "Buat file baru atau timpa isi file yang sudah ada di disk lokal user. Folder induk dibuat otomatis jika belum ada. Selalu menunggu persetujuan manual user sebelum benar-benar dieksekusi.",
    parameters: {
      path: { type: "string", description: "Path absolut atau relatif ke home directory dari file tujuan.", required: true },
      content: { type: "string", description: "Isi teks lengkap yang akan ditulis ke file.", required: true },
    },
  },
  {
    name: "search_files",
    description: "Cari file berdasarkan nama atau isi teks di dalam sebuah folder di disk lokal user (rekursif, maks kedalaman 5).",
    parameters: {
      query: { type: "string", description: "Kata kunci pencarian.", required: true },
      path: { type: "string", description: "Folder awal pencarian (default home directory).", required: false },
      maxResults: { type: "number", description: "Batas jumlah hasil (maks 100).", required: false },
    },
  },
  {
    name: "delete_file",
    description: "Hapus sebuah file. Aksi ini permanen dan selalu menunggu persetujuan manual user sebelum benar-benar dieksekusi.",
    parameters: {
      path: { type: "string", description: "Path file yang akan dihapus.", required: true },
    },
  },
  {
    name: "graphify_explain",
    description:
      "Jelaskan satu simbol (fungsi/kelas/file) di codebase project INI sendiri lewat code graph lokal — siapa memanggilnya, apa yang dipanggilnya. Bukan untuk folder/proyek lain.",
    parameters: {
      symbol: { type: "string", description: "Nama simbol yang mau dijelaskan, mis. 'rankChunksHybrid' atau 'lib/serverDb.ts'.", required: true },
    },
  },
  {
    name: "graphify_query",
    description: "Ajukan pertanyaan arsitektur bebas soal codebase project INI; menelusuri code graph lokal (BFS) untuk jawaban yang relevan, bukan tebakan dari training data.",
    parameters: {
      question: { type: "string", description: "Pertanyaan arsitektur, mis. 'apa yang memanggil executeToolCall?'", required: true },
    },
  },
  {
    name: "graphify_path",
    description: "Cari jalur terpendek di code graph antara dua simbol di codebase project INI (bagaimana A terhubung ke B).",
    parameters: {
      from: { type: "string", description: "Simbol/node awal.", required: true },
      to: { type: "string", description: "Simbol/node tujuan.", required: true },
    },
  },
];

/** Payload gaya OpenAI/Ollama `tools: [...]` untuk model yang dukung native function calling. */
/**
 * Directive fallback untuk model tanpa native tool calling.
 * Model diinstruksikan menulis baris persis: [TOOL_CALL:nama_tool:{"arg":"value"}]
 * dan berhenti generate setelah itu supaya hasil eksekusi bisa disuapkan balik.
 */
export function buildToolDirectivePrompt(): string {
  const toolList = TOOL_DEFINITIONS.map((t) => {
    const argsDesc = Object.entries(t.parameters)
      .map(([key, p]) => `${key}${p.required ? "" : "?"}: ${p.description}`)
      .join(", ");
    return `- ${t.name}(${argsDesc})\n  ${t.description}`;
  }).join("\n");

  return `Kamu punya akses ke Disk Tools berikut untuk membaca/menulis file di SELURUH disk lokal user (bukan cuma folder project ini — path absolut ke drive/folder mana pun juga bisa):
${toolList}

Untuk memanggil tool, tulis PERSIS satu baris dengan format ini dan JANGAN tulis apa pun setelahnya:
[TOOL_CALL:nama_tool:{"arg1":"value1"}]

Contoh: [TOOL_CALL:read_file:{"path":"package.json"}]
Contoh path absolut: [TOOL_CALL:list_directory:{"path":"D:\\\\Projects"}]

PENTING: ${MUTATING_TOOLS.join(" dan ")} tidak langsung dieksekusi — permintaan itu akan tampil sebagai kartu
persetujuan di chat dan kamu PAUSE sampai user approve atau reject secara manual. Kalau ditolak, kamu akan
diberi tahu dan harus melanjutkan tanpa hasil itu. Jangan mengarang hasil tool sendiri.
Kalau tidak perlu memanggil tool, jawab seperti biasa tanpa format di atas.`;
}

/** Cari dan parse directive [TOOL_CALL:name:{json}] dari teks output model. */
export function parseToolDirective(text: string): { toolName: ToolName; args: Record<string, any> } | null {
  const match = text.match(/\[TOOL_CALL:([a-z_]+):({[\s\S]*?})\]/);
  if (!match) return null;

  const [, rawName, rawArgs] = match;
  const validNames = TOOL_DEFINITIONS.map((t) => t.name);
  if (!validNames.includes(rawName as ToolName)) return null;

  try {
    const args = JSON.parse(rawArgs);
    return { toolName: rawName as ToolName, args };
  } catch {
    return null;
  }
}

/**
 * Directive prompt khusus untuk agent otonom: tool beroperasi di seluruh
 * home directory (bukan hanya project ini), dan write_file/delete_file
 * selalu menunggu persetujuan manual sebelum benar-benar dieksekusi.
 */
export function buildAgentToolDirectivePrompt(): string {
  const toolList = TOOL_DEFINITIONS.map((t) => {
    const argsDesc = Object.entries(t.parameters)
      .map(([key, p]) => `${key}${p.required ? "" : "?"}: ${p.description}`)
      .join(", ");
    return `- ${t.name}(${argsDesc})\n  ${t.description}`;
  }).join("\n");

  return `Kamu adalah agent otonom dengan akses Disk Tools ke SELURUH direktori home user (bukan hanya folder project ini):
${toolList}

Untuk memanggil tool, tulis PERSIS satu baris dengan format ini dan JANGAN tulis apa pun setelahnya:
[TOOL_CALL:nama_tool:{"arg1":"value1"}]

Contoh: [TOOL_CALL:read_file:{"path":"Documents/notes.txt"}]

PENTING: ${MUTATING_TOOLS.join(" dan ")} tidak langsung dieksekusi — permintaan itu akan masuk antrian
persetujuan manual milik user dan generatemu akan PAUSE sampai user approve atau reject. Kalau ditolak,
kamu akan diberi tahu dan harus melanjutkan tanpa hasil itu. Jangan mengarang hasil tool sendiri.
Kalau tidak perlu memanggil tool, jawab seperti biasa tanpa format di atas.`;
}
