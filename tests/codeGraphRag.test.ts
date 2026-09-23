import { describe, it, expect } from "vitest";
import {
  extractDefinedSymbols,
  buildProjectSymbolGraph,
  rankChunksBM25,
  buildOptimizedKnowledgeContext,
  DocumentChunk,
} from "../lib/rag";
import type { ProjectFile } from "../lib/types";

function makeChunk(
  id: string,
  fileName: string,
  text: string,
  symbolsDefined?: string[],
  symbolsReferenced?: string[]
): DocumentChunk {
  return {
    id,
    fileName,
    fileId: fileName.replace(/\./g, "_"),
    chunkIndex: 0,
    totalChunks: 1,
    text,
    charCount: text.length,
    estimatedTokens: Math.ceil(text.length / 3.8),
    preview: text.slice(0, 30),
    symbolsDefined,
    symbolsReferenced,
  };
}

describe("extractDefinedSymbols (Multi-Language AST Symbol Extraction)", () => {
  it("extracts TypeScript / JavaScript functions, classes, interfaces, and types", () => {
    const code = `
      export function parseQuery(raw: string): QueryObj {
        return {};
      }
      export const formatOutput = async (data: any) => {
        return String(data);
      };
      export class QueryEngine {
        run() {}
      }
      export interface UserProfile {
        id: string;
      }
      export type ThemeMode = "light" | "dark";
      export enum Status { Active, Inactive }
    `;

    const symbols = extractDefinedSymbols(code);
    expect(symbols).toContain("parseQuery");
    expect(symbols).toContain("formatOutput");
    expect(symbols).toContain("QueryEngine");
    expect(symbols).toContain("UserProfile");
    expect(symbols).toContain("ThemeMode");
    expect(symbols).toContain("Status");
  });

  it("extracts Python def and class definitions", () => {
    const pyCode = `
      class DataPipeline:
          def __init__(self):
              pass

          async def fetch_records(self, limit=100):
              return []

      def clean_record(raw):
          return raw.strip()
    `;

    const symbols = extractDefinedSymbols(pyCode);
    expect(symbols).toContain("DataPipeline");
    expect(symbols).toContain("fetch_records");
    expect(symbols).toContain("clean_record");
  });

  it("extracts Go functions and receivers", () => {
    const goCode = `
      func HandleRequest(w http.ResponseWriter, r *http.Request) {
      }

      func (s *Server) Start(port int) error {
          return nil
      }
    `;

    const symbols = extractDefinedSymbols(goCode);
    expect(symbols).toContain("HandleRequest");
    expect(symbols).toContain("Start");
  });

  it("extracts Rust functions and structs", () => {
    const rustCode = `
      pub struct ConnectionPool {
          size: usize,
      }

      pub async fn establish_connection() -> Result<(), Error> {
          Ok(())
      }
    `;

    const symbols = extractDefinedSymbols(rustCode);
    expect(symbols).toContain("ConnectionPool");
    expect(symbols).toContain("establish_connection");
  });

  it("ignores symbols inside comments", () => {
    const commentedCode = `
      // function fakeFunction() {}
      # def fake_python():
      /* export class FakeClass {} */
      export function realFunction() {}
    `;

    const symbols = extractDefinedSymbols(commentedCode);
    expect(symbols).toContain("realFunction");
    expect(symbols).not.toContain("fakeFunction");
    expect(symbols).not.toContain("fake_python");
    expect(symbols).not.toContain("FakeClass");
  });
});

describe("buildProjectSymbolGraph (In-Memory Code Graph)", () => {
  it("builds symbol definition map and cross-chunk references", () => {
    const chunks: DocumentChunk[] = [
      makeChunk(
        "types_chk",
        "types.ts",
        "export interface UserRecord {\n  id: string;\n  name: string;\n}",
        ["UserRecord"]
      ),
      makeChunk(
        "service_chk",
        "service.ts",
        "import { UserRecord } from './types';\nexport function fetchUser(): UserRecord {\n  return { id: '1', name: 'Alice' };\n}",
        ["fetchUser"]
      ),
    ];

    const graph = buildProjectSymbolGraph(chunks);

    expect(graph.symbolToChunkIds.get("userrecord")).toEqual(["types_chk"]);
    expect(graph.symbolToChunkIds.get("fetchuser")).toEqual(["service_chk"]);
    expect(graph.chunkDefinedSymbols.get("types_chk")).toEqual(["UserRecord"]);
    expect(graph.chunkDefinedSymbols.get("service_chk")).toEqual(["fetchUser"]);

    // service.ts references UserRecord defined in types.ts
    expect(chunks[1].symbolsReferenced).toContain("UserRecord");
  });
});

describe("Symbol-Aware Retrieval & Graph Expansion", () => {
  it("boosts chunks that explicitly DEFINE a symbol over chunks that merely call or mention it", () => {
    const chunks: DocumentChunk[] = [
      makeChunk(
        "caller_chk",
        "app.ts",
        "// We invoke calculateTax here for billing\nconst tax = calculateTax(100, 0.1);\nconsole.log(tax);",
        undefined,
        ["calculateTax"]
      ),
      makeChunk(
        "def_chk",
        "taxCalculator.ts",
        "export function calculateTax(income: number, rate: number): number {\n  return income * rate;\n}",
        ["calculateTax"]
      ),
    ];

    const ranked = rankChunksBM25(chunks, "calculateTax function", 2);

    expect(ranked.length).toBe(2);
    // def_chk must win rank 1 because of the authoritative symbol definition bonus
    expect(ranked[0].id).toBe("def_chk");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("expands retrieved context with linked symbol definitions when budget allows", () => {
    const pad = "// extra context line to ensure file exceeds inline budget\n".repeat(30);
    const files: ProjectFile[] = [
      {
        id: "types_file",
        name: "models.ts",
        textContent: `${pad}\nexport interface AuthToken {\n  jwt: string;\n  expiresAt: number;\n}`,
        size: 800,
        type: "document",
        uploadedAt: Date.now(),
      },
      {
        id: "auth_file",
        name: "authService.ts",
        textContent: `${pad}\nexport function verifySession(): AuthToken {\n  return { jwt: 'xyz', expiresAt: 12345 };\n}`,
        size: 900,
        type: "document",
        uploadedAt: Date.now(),
      },
    ];

    // Budget of 600 tokens forces chunking & retrieval while leaving enough space for graph expansion
    const result = buildOptimizedKnowledgeContext(files, "verifySession implementation", 600);

    expect(result.isChunked).toBe(true);
    expect(result.contextText).toContain("authService.ts");
    // Verify that models.ts was pulled in via graph expansion because AuthToken was referenced by verifySession
    expect(result.contextText).toContain("models.ts");
    expect(result.contextText).toContain("Defines: verifySession");
  });
});
