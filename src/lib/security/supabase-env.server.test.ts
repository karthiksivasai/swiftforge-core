import { afterEach, describe, expect, it } from "vitest";

import { supabaseProjectUrl, supabasePublishableKey } from "./supabase-env.server";

const KEYS = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("supabase server env", () => {
  it("uses the Vite project URL when an older SUPABASE_URL is also set", () => {
    process.env.VITE_SUPABASE_URL = "https://current.supabase.co";
    process.env.SUPABASE_URL = "https://old.supabase.co";
    expect(supabaseProjectUrl()).toBe("https://current.supabase.co");
  });

  it("uses the Vite publishable key before SUPABASE_PUBLISHABLE_KEY", () => {
    process.env.VITE_SUPABASE_ANON_KEY = "vite-anon";
    process.env.SUPABASE_PUBLISHABLE_KEY = "old-publishable";
    expect(supabasePublishableKey()).toBe("vite-anon");
  });
});