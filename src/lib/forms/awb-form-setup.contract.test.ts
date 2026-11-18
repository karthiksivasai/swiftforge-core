import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const setup = readFileSync(join(root, "supabase/migrations/0176_awb_form_setup.sql"), "utf8");
const booking = readFileSync(
  join(root, "supabase/migrations/0177_awb_form_setup_booking_rules.sql"),
  "utf8",
);

describe("AWB form setup SQL contract", () => {
  it("stores one row per user and lets an admin read every row", () => {
    expect(setup).toContain("constraint awb_form_setup_user_uq unique (tenant_id, user_id)");
    expect(setup).toContain("user_id = app.current_app_user_id(tenant_id)");
    expect(setup).toContain("or app.is_tenant_admin(tenant_id)");
    expect(setup).toContain("app.user_has_permission(tenant_id, 'txn.awb-form-setup', 'modify')");
    expect(setup).toContain("app.write_audit_log(");
    expect(setup).toContain("'airlineNotRequired', true");
    expect(setup).toContain("'allowPaymentTypeOverride', true");
  });

  it("denies a save without the edit permission", () => {
    expect(setup).toContain(
      "raise exception 'txn.awb-form-setup modify permission is required' using errcode = '42501'",
    );
  });

  it("reads the saved setup inside booking instead of browser flags", () => {
    expect(booking).toContain("from public.awb_form_setup s");
    expect(booking).toContain("app.awb_setup_field_errors(v_tenant, p_fields, v_dest is null)");
    expect(booking).toContain("'Consignee company name is required'");
    expect(booking).toContain("'Airline is required'");
    expect(booking).toContain("'Payment type must match the customer master'");
    expect(booking).toContain("'txn.awb-payment-override'");
    expect(booking).toContain("'change', 'payment_type_override'");
    expect(booking).not.toContain("parseInt");
  });
});
