import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone Vitest config — intentionally does NOT reuse the app's
// `@lovable.dev/vite-tanstack-config` (that chain bundles SSR/nitro plugins we
// don't want under the test runner). The master unit tests target pure logic
// (csv/schemas/query-keys/helpers/import), so a plain node environment plus the
// `@` path alias is all that's needed.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
