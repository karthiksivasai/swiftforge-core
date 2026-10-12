import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  composeEstatementOutput,
  defaultEstatementColumns,
  ESTATEMENT_COLUMNS,
  estatementRecipientAddresses,
  estatementSendIsDue,
} from "@/lib/utility-setup/estatement";

describe("estatement schedule and columns", () => {
  it("sends once the office date and time have arrived, and not again for that schedule", () => {
    const before = new Date("2026-10-12T04:14:00.000Z");
    const due = new Date("2026-10-12T04:15:00.000Z");
    const later = new Date("2026-10-12T04:20:00.000Z");
    expect(
      estatementSendIsDue({
        statementDate: "2026-10-12",
        sendingTime: "09:45",
        now: before,
      }),
    ).toBe(false);
    expect(
      estatementSendIsDue({
        statementDate: "2026-10-12",
        sendingTime: "09:45",
        now: due,
      }),
    ).toBe(true);
    expect(
      estatementSendIsDue({
        statementDate: "2026-10-12",
        sendingTime: "09:45",
        now: later,
        sentKey: "2026-10-12 09:45",
      }),
    ).toBe(false);
    expect(
      estatementSendIsDue({
        statementDate: "2026-10-13",
        sendingTime: "09:45",
        now: later,
      }),
    ).toBe(false);
  });

  it("uses Code as the statement label and Order No as the column sequence", () => {
    expect(ESTATEMENT_COLUMNS).toHaveLength(47);
    expect(defaultEstatementColumns()[0]).toEqual({
      column: "Actl_Weight",
      code: "Actl_Weight",
      orderNo: "1",
    });
    const body = composeEstatementOutput({
      dear: "Dear Customer,",
      body: "Your statement.",
      columns: [
        { column: "AWBNo", code: "AWB", orderNo: "2" },
        { column: "Actl_Weight", code: "Weight", orderNo: "1" },
        { column: "Pcs", code: "", orderNo: "0" },
        { column: "Total", code: "Amount", orderNo: "3" },
      ],
      variables: { AWBNo: "100200", Actl_Weight: "2.50", Pcs: "4", Total: "900" },
    });
    expect(body).toBe(
      ["Dear Customer,", "", "Your statement.", "", "Weight: 2.50", "AWB: 100200", "Amount: 900"].join(
        "\n",
      ),
    );
    expect(body).not.toContain("Pcs");
    expect(body).not.toContain("4");
    expect(body).not.toContain("AWBNo");
    expect(body).not.toContain("Actl_Weight");
    expect(body.indexOf("Weight:")).toBeLessThan(body.indexOf("AWB:"));
    expect(body.indexOf("AWB:")).toBeLessThan(body.indexOf("Amount:"));
  });

  it("schedules the statement send and applies Code and Order No in the database", () => {
    const sql = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../supabase/migrations/0130_estatement_schedule_and_weight_alert.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("function app.dispatch_due_estatement_emails");
    expect(sql).toContain("Asia/Kolkata");
    expect(sql).toContain("app.compose_estatement_output");
    expect(sql).toContain("order by ord, pos");
    expect(sql).toContain("estatement-scheduled-send");
    expect(sql).toContain('"flag":"printSender"');
    expect(sql).toContain('"flag":"printPcs"');
  });

  it("addresses the statement to the customer and keeps From Email as the sender", () => {
    const sender = "billing@courier.test";
    const recipients = estatementRecipientAddresses([
      { email: "meera@acme.test", eStatement: true },
      { email: "skip@acme.test", eStatement: false },
      { email: sender, eStatement: false },
      { email: "closed@acme.test", status: "INACTIVE", eStatement: true },
      { email: "  ", eStatement: true },
    ]);
    expect(recipients).toEqual(["meera@acme.test"]);
    expect(recipients).not.toContain(sender);

    const sql = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../supabase/migrations/0132_estatement_customer_recipients.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("v_cfg.sender_email, v_customer.email");
    expect(sql).not.toContain("v_cfg.sender_email, v_cfg.sender_email");
    expect(sql).toContain("wizard_extras #>> '{notification,eStatement}'");
  });
});