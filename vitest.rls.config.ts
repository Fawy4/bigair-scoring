import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// Row Level Security tests run against the hosted development project (never `npm test`).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/rls/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
