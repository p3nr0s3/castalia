// lib/tools.ts
//
// Definisi 4 disk tools yang didukung oleh app/api/tools/execute/route.ts.
// File ini adalah satu-satunya sumber kebenaran untuk nama tool & skema argumen,
// dipakai baik untuk native tool-calling payload maupun untuk membangun
// directive fallback (ReAct) buat model yang tidak dukung native tools.

export type ToolName = "list_directory" | "read_file" | "write_file" | "search_files" | "delete_file";

/** Tool read-only dieksekusi otomatis; tool yang mengubah state (write/delete) wajib approval manual untuk agent. */
export const READ_ONLY_TOOLS: ToolName[] = ["list_directory", "read_file", "search_files"];
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
      "List isi sebuah folder di dalam project (nama file/folder, ukuran, tanggal modifikasi). Path kosong berarti root project.",
    parameters: {
      path: { type: "string", description: "Path relatif dari root project, contoh 'lib' atau 'app/api'.", required: false },
      recursive: { type: "boolean", description: "Jika true, masuk ke subfolder juga (maks kedalaman 3).", required: false },
      maxItems: { type: "number", description: "Batas jumlah item yang dikembalikan (maks 200).", required: false },
    },
  },
  {
    name: "read_file",
    description: "Baca isi teks sebuah file di dalam project.",
    parameters: {
      path: { type: "string", description: "Path relatif file yang mau dibaca, contoh 'package.json'.", required: true },
      maxBytes: { type: "number", description: "Batas ukuran baca dalam byte (default 2MB).", required: false },
    },
  },
  {
    name: "write_file",
    description: "Buat file baru atau timpa isi file yang sudah ada di dalam project. Folder induk dibuat otomatis jika belum ada.",
    parameters: {
      path: { type: "string", description: "Path relatif file tujuan.", required: true },
      content: { type: "string", description: "Isi teks lengkap yang akan ditulis ke file.", required: true },
    },
  },
  {
    name: "search_files",
    description: "Cari file berdasarkan nama atau isi teks di dalam sebuah folder project (rekursif, maks kedalaman 5).",
    parameters: {
      query: { type: "string", description: "Kata kunci pencarian.", required: true },
      path: { type: "string", description: "Folder awal pencarian (default root project).", required: false },
      maxResults: { type: "number", description: "Batas jumlah hasil (maks 100).", required: false },
    },
  },
  {
    name: "delete_file",
    description: "Hapus sebuah file. Aksi ini permanen dan untuk agent selalu butuh persetujuan manual sebelum dieksekusi.",
    parameters: {
      path: { type: "string", description: "Path file yang akan dihapus.", required: true },
    },
  },
];

/** Payload gaya OpenAI/Ollama `tools: [...]` untuk model yang dukung native function calling. */
export function buildNativeToolsPayload() {
  return TOOL_DEFINITIONS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([key, p]) => [key, { type: p.type, description: p.description }])
        ),
        required: Object.entries(t.parameters)
          .filter(([, p]) => p.required)
          .map(([key]) => key),
      },
    },
  }));
}

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

  return `Kamu punya akses ke Disk Tools berikut untuk membaca/menulis file di dalam project user:
${toolList}

Untuk memanggil tool, tulis PERSIS satu baris dengan format ini dan JANGAN tulis apa pun setelahnya:
[TOOL_CALL:nama_tool:{"arg1":"value1"}]

Contoh: [TOOL_CALL:read_file:{"path":"package.json"}]

Hasil eksekusi akan diberikan kembali ke kamu di giliran berikutnya. Jangan mengarang hasil tool sendiri.
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
