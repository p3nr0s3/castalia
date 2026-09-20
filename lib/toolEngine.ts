// lib/toolEngine.ts
//
// Client tipis untuk memanggil app/api/tools/execute/route.ts.
// PENTING: bentuk field sukses berbeda per tool (route.ts tidak punya bungkus generik
// "data"/"result"), jadi normalisasi dilakukan di sini supaya pemanggil (toolEngine loop
// di page.tsx) cukup pakai satu bentuk ToolCallResult yang konsisten.

import { ToolName } from "./tools";
import { apiFetch } from "./apiClient";

const TOOL_EXECUTION_API = "/api/tools/execute";

export interface ToolCallResult {
  success: true;
  toolName: ToolName;
  /** Data mentah dari route (items/content/bytesWritten/matches, tergantung tool). */
  raw: any;
  /** Ringkasan singkat untuk ditampilkan di kartu UI / disuapkan balik ke model. */
  summary: string;
}

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

function summarize(toolName: ToolName, raw: any): string {
  switch (toolName) {
    case "list_directory":
      return `${raw.totalItems} item ditemukan di ${raw.path}`;
    case "read_file":
      return `Berhasil membaca ${raw.size} bytes dari ${raw.path}${raw.isTruncated ? " (terpotong)" : ""}`;
    case "write_file":
      return raw.message || `File ditulis: ${raw.path}`;
    case "delete_file":
      return raw.message || `File dihapus: ${raw.path}`;
    case "search_files":
      return `${raw.totalMatches} hasil untuk "${raw.query}" di ${raw.searchedPath}`;
    case "graphify_explain":
    case "graphify_query":
    case "graphify_path":
      return "Code graph query selesai.";
    default:
      return "Tool berhasil dijalankan.";
  }
}

/**
 * Eksekusi satu tool call lewat backend. Melempar ToolExecutionError kalau
 * request gagal (network) atau backend membalas success:false.
 */
export async function executeToolCall(
  toolName: ToolName,
  args: Record<string, any>,
  signal?: AbortSignal,
  approvalToken?: string
): Promise<ToolCallResult> {
  let response: Response;
  try {
    response = await apiFetch(TOOL_EXECUTION_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: toolName, args, approvalToken }),
      signal,
    });
  } catch (networkErr: any) {
    throw new ToolExecutionError(`Gagal menghubungi tool execution API: ${networkErr.message || networkErr}`);
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new ToolExecutionError(`Respons tidak valid dari server (status ${response.status}).`);
  }

  if (!response.ok || !json.success) {
    throw new ToolExecutionError(json.error || `Tool '${toolName}' gagal dijalankan (status ${response.status}).`);
  }

  return {
    success: true,
    toolName,
    raw: json,
    summary: summarize(toolName, json),
  };
}

// ============================================================================
// REVERT — undo an already-executed write_file/delete_file approval
// ============================================================================

const TOOL_REVERT_API = "/api/tools/revert";

/**
 * Calls /api/tools/revert for a resolved approval (works for both
 * source: "chat" and source: "agent" records — the server resolves the
 * path under whichever sandboxing rule that source originally ran under).
 * Throws ToolExecutionError with the server's explanation on refusal
 * (e.g. the file changed again since, so an automatic revert was refused
 * rather than risking a silent overwrite of that newer change).
 */
export async function revertApproval(approvalId: string, signal?: AbortSignal): Promise<{ message: string }> {
  let response: Response;
  try {
    response = await apiFetch(TOOL_REVERT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId }),
      signal,
    });
  } catch (networkErr: any) {
    throw new ToolExecutionError(`Gagal menghubungi revert API: ${networkErr.message || networkErr}`);
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new ToolExecutionError(`Respons tidak valid dari server (status ${response.status}).`);
  }

  if (!response.ok || !json.success) {
    throw new ToolExecutionError(json.error || `Revert gagal (status ${response.status}).`);
  }

  return { message: json.message || "Berhasil di-revert." };
}

/** Format error untuk disuapkan balik ke model sebagai hasil tool, atau ditampilkan di UI. */
// ============================================================================
// AGENT VARIANT — disk-wide (home dir), approval-gated for write_file/delete_file
// ============================================================================

const AGENT_TOOL_EXECUTION_API = "/api/tools/execute-agent";

/**
 * Eksekusi tool untuk agent otonom. Untuk read_file/list_directory/search_files
 * jalan langsung. Untuk write_file/delete_file, approvalToken WAJIB diisi
 * dengan id dari PendingApproval yang statusnya sudah "approved" — dipanggil
 * hanya dari lib/agentEngine.ts setelah user meng-approve, tidak pernah
 * langsung dari loop directive-parsing.
 */
export async function executeAgentToolCall(
  toolName: ToolName,
  args: Record<string, any>,
  approvalToken?: string,
  signal?: AbortSignal
): Promise<ToolCallResult> {
  let response: Response;
  try {
    response = await apiFetch(AGENT_TOOL_EXECUTION_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: toolName, args, approvalToken }),
      signal,
    });
  } catch (networkErr: any) {
    throw new ToolExecutionError(`Gagal menghubungi tool execution API (agent): ${networkErr.message || networkErr}`);
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new ToolExecutionError(`Respons tidak valid dari server (status ${response.status}).`);
  }

  if (!response.ok || !json.success) {
    throw new ToolExecutionError(json.error || `Tool '${toolName}' gagal dijalankan (status ${response.status}).`);
  }

  return {
    success: true,
    toolName,
    raw: json,
    summary: summarize(toolName, json),
  };
}
