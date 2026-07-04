import type { Plugin, ResolvedConfig } from "vite";

const JSX_ATTR = /\s+data-tsd-source="[^"]*"/g;
const COMPILED_PROP = /,?\s*["']data-tsd-source["']\s*:\s*["'][^"']*["']/g;

function stripTsdSource(code: string) {
  return code.replace(JSX_ATTR, "").replace(COMPILED_PROP, "");
}

function disableTanStackSourceInjection(config: ResolvedConfig) {
  for (const plugin of config.plugins) {
    if (plugin.name !== "@tanstack/devtools:inject-source") continue;
    plugin.transform = {
      filter: { id: /.*/ },
      handler() {
        return null;
      },
    };
  }
}

/**
 * TanStack devtools inject `data-tsd-source` with file line numbers that can
 * differ between SSR and client transforms after HMR, causing hydration warnings.
 * Disable injection and strip any remaining attributes in dev.
 */
export function stripTsdSourcePlugin(): Plugin[] {
  const shouldStrip = (id: string, ext: RegExp) =>
    !id.includes("node_modules") && ext.test(id);

  return [
    {
      name: "strip-tsd-source:disable-inject",
      apply: "serve",
      configResolved(config) {
        disableTanStackSourceInjection(config);
      },
    },
    {
      name: "strip-tsd-source:pre",
      enforce: "pre",
      apply: "serve",
      transform(code, id) {
        if (!shouldStrip(id, /\.(?:tsx|jsx)(?:\?|$)/) || !code.includes("data-tsd-source")) {
          return null;
        }
        const next = stripTsdSource(code);
        return next === code ? null : { code: next, map: null };
      },
    },
    {
      name: "strip-tsd-source:post",
      enforce: "post",
      apply: "serve",
      transform(code, id) {
        if (!shouldStrip(id, /\.(?:tsx|jsx|js)(?:\?|$)/) || !code.includes("data-tsd-source")) {
          return null;
        }
        const next = stripTsdSource(code);
        return next === code ? null : { code: next, map: null };
      },
    },
  ];
}
