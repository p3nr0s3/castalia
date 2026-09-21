import { describe, it, expect } from "vitest";
import { getNativeOllamaTools, parseNativeToolCalls, TOOL_DEFINITIONS } from "../lib/tools";

describe("Native Tool Calling", () => {
  it("generates valid OpenAPI / Ollama tool schemas from TOOL_DEFINITIONS", () => {
    const tools = getNativeOllamaTools();
    expect(tools.length).toBe(TOOL_DEFINITIONS.length);

    const readFileTool = tools.find((t) => t.function.name === "read_file");
    expect(readFileTool).toBeDefined();
    expect(readFileTool.type).toBe("function");
    expect(readFileTool.function.parameters.type).toBe("object");
    expect(readFileTool.function.parameters.required).toContain("path");
    expect(readFileTool.function.parameters.properties.path.type).toBe("string");
  });

  it("parses structured tool_calls returned natively by Ollama", () => {
    const rawCalls = [
      {
        id: "call_1",
        function: {
          name: "read_file",
          arguments: { path: "package.json" },
        },
      },
      {
        id: "call_2",
        function: {
          name: "list_directory",
          arguments: JSON.stringify({ path: "/home/user", recursive: true }),
        },
      },
    ];

    const parsed = parseNativeToolCalls(rawCalls);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("read_file");
    expect(parsed[0].args).toEqual({ path: "package.json" });
    expect(parsed[1].name).toBe("list_directory");
    expect(parsed[1].args).toEqual({ path: "/home/user", recursive: true });
  });

  it("ignores hallucinated tool names that are not defined in TOOL_DEFINITIONS", () => {
    const rawCalls = [
      {
        id: "call_bad",
        function: {
          name: "execute_malicious_command",
          arguments: { cmd: "rm -rf /" },
        },
      },
    ];

    const parsed = parseNativeToolCalls(rawCalls);
    expect(parsed).toHaveLength(0);
  });
});
