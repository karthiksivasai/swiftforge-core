import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/0128_utility_setup_module.sql"),
  "utf8",
);

function slice(start: string, end: string): string {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return sql.slice(from, to);
}

describe("setup email database contract", () => {
  const trigger = slice("function app.validate_setup_email_row()", "drop trigger if exists trg_validate_setup_email");
  const save = slice("function public.save_setup_email_module(", "function public.get_setup_email_footer()");
  const read = slice("function public.get_setup_email_module(", "function public.save_setup_email_module(");

  it("rejects each of the nine common fields when empty", () => {
    const required = [
      "SMTP Server",
      "SMTP Port",
      "From Email",
      "Mail User ID is required",
      "Mail Password is required",
      "Message Dear is required",
      "Message Subject is required",
      "Message Body is required",
      "SSL is required",
    ];
    for (const message of required) {
      expect(trigger.includes(message) || save.includes(message), message).toBe(true);
    }
    expect(save).not.toContain("SSL requires SMTP port 465");
    expect(trigger).not.toContain("SSL requires SMTP port 465");
    expect(save).toContain("v_port is null");
    expect(trigger).toContain("new.smtp_port > 65535");
  });

  it("stores the password encrypted and never returns it", () => {
    expect(save).toContain("app.encrypt_smtp_password(v_pass)");
    expect(read).toContain("'has_password', v_row.password_enc is not null");
    expect(read).not.toContain("decrypt_smtp_password");
    expect(read).toContain("print_flags - 'password' - 'mailPassword' - 'password_enc'");
    expect(read).not.toMatch(/'password'\s*:/);
    expect(read).not.toMatch(/'mailPassword'\s*:/);
    expect(save).toContain("public.get_setup_email_module(v_code)");
    expect(save).toContain("v_flags - 'password' - 'mailPassword' - 'password_enc'");
  });

  it("writes the composed body into the outgoing email", () => {
    const send = slice("function public.send_email(p_fields jsonb)", "Credit-limit alert");
    expect(send).toContain("app.render_setup_event_email(");
    expect(send).toContain("v_text := v_rendered");
    expect(sql).toContain("function app.render_setup_event_email(");
    expect(sql).toContain('"label":"Shipper"');
    expect(sql).toContain('"label":"Sender"');
    expect(sql).toContain('"label":"Vendor Name"');
    expect(sql).toContain("weightHeading");
  });
});
