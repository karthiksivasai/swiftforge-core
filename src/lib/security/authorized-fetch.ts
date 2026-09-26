import { supabase } from "@/integrations/supabase/client";
import { CMS_SESSION_HEADER, CMS_SESSION_STORAGE_KEY } from "@/lib/security/session";

/** Browser fetch that attaches the Supabase access token and the app session id. */
export async function authorizedFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof window !== "undefined") {
    const sessionId = window.localStorage.getItem(CMS_SESSION_STORAGE_KEY);
    if (sessionId) headers.set(CMS_SESSION_HEADER, sessionId);
  }
  return fetch(input, { ...init, headers });
}

/** Attach auth headers in the browser without breaking tests that stub `fetch` in Node. */
export async function browserAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const headers: Record<string, string> = {};
  try {
    const sessionId = window.localStorage.getItem(CMS_SESSION_STORAGE_KEY);
    if (sessionId) headers[CMS_SESSION_HEADER] = sessionId;
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  } catch {
    return headers;
  }
  return headers;
}
