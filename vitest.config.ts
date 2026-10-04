import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } }, // a few tests render a component to static markup
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
    // the heavy property tests (thousands of generated ladders) need more than 5 s when the machine is busy
    testTimeout: 30_000,
  },
});
