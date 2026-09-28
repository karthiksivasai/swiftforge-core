export function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed || undefined;
}

/** Prefer the VITE_ project the browser bundle already uses. A stale SUPABASE_URL must not override it. */
export function supabaseProjectUrl(): string | undefined {
  return cleanEnv(process.env.VITE_SUPABASE_URL) || cleanEnv(process.env.SUPABASE_URL);
}

export function supabasePublishableKey(): string | undefined {
  return (
    cleanEnv(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_ANON_KEY) ||
    cleanEnv(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnv(process.env.SUPABASE_ANON_KEY)
  );
}

export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
