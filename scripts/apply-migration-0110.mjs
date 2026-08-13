import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(".env", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/);
  if (match) {
    env[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
}

const supabaseUrl = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

console.log("Parsed Env Keys:", Object.keys(env));
console.log("Supabase URL:", supabaseUrl);
console.log("Anon Key length:", env.VITE_SUPABASE_ANON_KEY?.length);
console.log("Service Key length:", env.SUPABASE_SERVICE_ROLE_KEY?.length);

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// Test basic query
const { data, error } = await supabase.from("tenants").select("id, name").limit(1);
if (error) {
  console.error("Connection error:", error);
} else {
  console.log("Connected successfully! Tenant:", data);
}
