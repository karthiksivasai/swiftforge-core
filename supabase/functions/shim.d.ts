/**
 * Local types for Cursor/VS Code when the Deno extension is not attached.
 * Deno itself ignores this file (see deno.json exclude).
 */

declare namespace Deno {
  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
  const env: {
    get(key: string): string | undefined;
  };
}

declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: {
      global?: { headers?: Record<string, string> };
    },
  ): {
    auth: {
      getUser(): Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
    };
    from: (table: string) => unknown;
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}
