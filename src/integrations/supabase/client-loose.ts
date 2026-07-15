// Loose-typed re-export of the Supabase client.
// The generated `Database` type has no tables/functions yet, which makes
// `supabase.from(...)` / `.rpc(...)` narrow to `never`. Until migrations are
// run and types.ts is regenerated, we widen the client here so app code
// compiles. TypeScript resolves `@/integrations/supabase/client` to this file
// via tsconfig `paths`; Vite still resolves it to the real `client.ts` at
// runtime through its `@` -> `src` alias.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "./client";

export const supabase = typedSupabase as unknown as SupabaseClient<any, "public", any>;
