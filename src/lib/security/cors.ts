const DEFAULT_ORIGINS = [
  "http://localhost:8082",
  "http://127.0.0.1:8082",
];

export function allowedOrigins(extra: string | undefined = process.env.APP_ORIGINS): Set<string> {
  const fromEnv = (extra ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...fromEnv]);
}

/** Returns the request origin when it is on the allowlist. Never reflects an arbitrary Origin. */
export function allowedOrigin(request: Request, extra?: string): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return allowedOrigins(extra).has(origin) ? origin : null;
}

export function corsHeaderRecord(request: Request, extra?: string): Record<string, string> {
  const origin = allowedOrigin(request, extra);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cms-session-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}
