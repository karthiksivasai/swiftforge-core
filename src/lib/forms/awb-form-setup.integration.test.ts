import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

function readEnv(): Record<string, string> {
  try {
    const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const env: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const match = line.match(/^\s*([\w_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/);
      if (match) env[match[1]] = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = readEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const live = Boolean(url && serviceKey && anonKey);

describe("AWB form setup API", () => {
  let admin: SupabaseClient;
  let client: SupabaseClient;
  let ready = false;
  let blocked = "";

  beforeAll(async () => {
    if (!live) {
      blocked = "Supabase env is not available";
      return;
    }
    const { createClient } = await import("@supabase/supabase-js");
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    client = createClient(url, anonKey, { auth: { persistSession: false } });
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { error } = await client.auth.signInWithPassword({
      email: "kkarthik3162@gmail.com",
      password,
    });
    if (error) {
      blocked = error.message;
      return;
    }
    const probe = await client.rpc("get_awb_form_setup");
    if (probe.error) {
      blocked = probe.error.message;
      return;
    }
    ready = true;
  });

  it("saves and reloads the caller's setup, and records the change", async () => {
    if (!ready) {
      expect.fail(blocked || "Form setup API was not ready");
    }
    const before = await client.rpc("get_awb_form_setup");
    expect(before.error).toBeNull();
    const previous = (before.data as { settings: Record<string, boolean> }).settings;
    const next = { ...previous, contentRepeat: !previous.contentRepeat };
    const saved = await client.rpc("save_awb_form_setup", {
      p_settings: next,
      p_branch_id: null,
    });
    expect(saved.error).toBeNull();
    expect((saved.data as { settings: { contentRepeat: boolean } }).settings.contentRepeat).toBe(
      next.contentRepeat,
    );
    const again = await client.rpc("get_awb_form_setup");
    expect((again.data as { stored: boolean; settings: { contentRepeat: boolean } }).stored).toBe(
      true,
    );
    expect((again.data as { settings: { contentRepeat: boolean } }).settings.contentRepeat).toBe(
      next.contentRepeat,
    );

    const { data: user } = await client.rpc("me");
    const me = Array.isArray(user) ? user[0] : user;
    const { data: audits } = await admin
      .from("audit_logs")
      .select("action, old_values, new_values, module_slug")
      .eq("entity_type", "awb_form_setup")
      .eq("module_slug", "txn.awb-form-setup")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audits?.[0]?.module_slug).toBe("txn.awb-form-setup");
    expect(audits?.[0]?.new_values).toMatchObject({ contentRepeat: next.contentRepeat });

    await client.rpc("save_awb_form_setup", { p_settings: previous, p_branch_id: null });
    expect(me).toBeTruthy();
  });

  it("rejects a write for someone else's user id, and an admin can still read that row", async () => {
    if (!ready) {
      expect.fail(blocked || "Form setup API was not ready");
    }
    const { data: mine } = await client.rpc("me");
    const me = (Array.isArray(mine) ? mine[0] : mine) as { id: string; tenant_id: string };
    const { data: others } = await admin
      .from("users")
      .select("id")
      .eq("tenant_id", me.tenant_id)
      .neq("id", me.id)
      .limit(1);
    const otherId = others?.[0]?.id as string | undefined;
    expect(otherId, "a second tenant user is required for the RLS check").toBeTruthy();

    const { error: writeError } = await client.from("awb_form_setup").insert({
      tenant_id: me.tenant_id,
      user_id: otherId,
      customer_repeat: true,
    });
    expect(writeError).not.toBeNull();

    const { error: seedError } = await admin.from("awb_form_setup").upsert(
      {
        tenant_id: me.tenant_id,
        user_id: otherId,
        customer_repeat: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );
    expect(seedError).toBeNull();
    const { data: visible } = await client
      .from("awb_form_setup")
      .select("user_id")
      .eq("user_id", otherId);
    expect((visible ?? []).some((row) => row.user_id === otherId)).toBe(true);
    await admin.from("awb_form_setup").delete().eq("user_id", otherId);
  });

  it("applies consignee, airline, and payment rules from the saved row", async () => {
    if (!ready) {
      expect.fail(blocked || "Form setup API was not ready");
    }
    const before = await client.rpc("get_awb_form_setup");
    const previous = (before.data as { settings: Record<string, boolean> }).settings;
    const book = (fields: Record<string, unknown>) =>
      client.rpc("book_awb_shipment", {
        p_id: null,
        p_row_version: null,
        p_fields: fields,
        p_pieces: [],
        p_charges: [],
        p_comments: [],
        p_attachments: [],
      });

    await client.rpc("save_awb_form_setup", {
      p_settings: { ...previous, consigneeNotRequired: false, airlineNotRequired: true },
      p_branch_id: null,
    });
    const required = await book({ consignee: {}, airline: "" });
    expect(required.error?.message).toContain("Consignee company name is required");
    expect(required.error?.message).not.toContain("Airline is required");

    await client.rpc("save_awb_form_setup", {
      p_settings: {
        ...previous,
        consigneeNotRequired: true,
        allowConsigneeNameBlank: false,
        airlineNotRequired: false,
      },
      p_branch_id: null,
    });
    const optional = await book({ consignee: {}, airline: "" });
    expect(optional.error?.message ?? "").not.toContain("Consignee company name is required");
    expect(optional.error?.message ?? "").not.toContain("Destination is required");
    expect(optional.error?.message).toContain("Airline is required");

    const { data: mine } = await client.rpc("me");
    const me = (Array.isArray(mine) ? mine[0] : mine) as { tenant_id: string };
    const { data: customers } = await admin
      .from("customers")
      .select("id, payment_type")
      .eq("tenant_id", me.tenant_id)
      .not("payment_type", "is", null)
      .limit(1);
    const customer = customers?.[0] as { id: string; payment_type: string } | undefined;
    if (customer?.payment_type) {
      const otherType = customer.payment_type.toLowerCase() === "cash" ? "Credit" : "Cash";
      await client.rpc("save_awb_form_setup", {
        p_settings: { ...previous, allowPaymentTypeOverride: false },
        p_branch_id: null,
      });
      const locked = await book({
        customer_id: customer.id,
        payment_type: otherType,
        consignee: { company_name: "X", address1: "A", city: "C", pincode: "1", country: "IN", mobile: "9" },
      });
      expect(locked.error?.message).toContain("Payment type must match the customer master");
    }

    await client.rpc("save_awb_form_setup", { p_settings: previous, p_branch_id: null });
  });
});
