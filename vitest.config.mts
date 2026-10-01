import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  // tsconfig uses `"jsx": "preserve"` (Next compiles it); Vitest must transform JSX itself.
  // Vite 8 transforms with Oxc (the old `esbuild` option is ignored).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Gives every test file a private data/ directory (see tests/setup/isolateDataDir.ts).
    setupFiles: ["tests/setup/isolateDataDir.ts"],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
