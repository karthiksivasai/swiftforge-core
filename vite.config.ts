// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { stripTsdSourcePlugin } from "./vite-plugins/strip-tsd-source";

export default defineConfig({
  plugins: [...stripTsdSourcePlugin()],
  // Avoid stale optimized-deps chunks after `.vite` cache clears (Chrome HTTP cache
  // survives "Clear site data" and keeps requesting old `?v=` hashes).
  vite: {
    server: {
      port: 8082,
      strictPort: true,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
