import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  composeEventEmailBody,
  creditReevalPages,
  CREDIT_REEVAL_BATCH_SIZE,
} from "@/lib/utility-setup/compose-event-email";

const variables = {
  Shipper_Name: "Acme Shipper",
  sender: "Sender Desk",
  BookTime: "10:15",
  pieces_unit: "DOX",
  weight: "2.50",
  product_name: "Express",
  vol_weight: "3.10",
  total: "900.00",
  vendor_awb: "V-100",
  origin: "BLR",
  Customer_Name: "Courierwala",
  content: "Documents",
  Ref_No: "REF-9",
  pcs: "2",
  Vendor_Name: "Blue Dart",
};

describe("compose event email body", () => {
  it("booking keeps toggled-on fields and drops toggled-off fields, including shipper vs sender", () => {
    const body = composeEventEmailBody({
      module: "BOOKING",
      dear: "Dear Sir/Madam,",
      body: "Your shipment is booked.",
      flags: {
        printShipper: true,
        printSender: false,
        printWeight: true,
        weightHeading: "Chargeable Wt",
        printContent: false,
        printOrigin: true,
      },
      variables,
    });
    expect(body).toContain("Dear Sir/Madam,");
    expect(body).toContain("Your shipment is booked.");
    expect(body).toContain("Shipper: Acme Shipper");
    expect(body).not.toContain("Sender:");
    expect(body).toContain("Chargeable Wt: 2.50");
    expect(body).not.toContain("Weight:");
    expect(body).toContain("Origin: BLR");
    expect(body).not.toContain("Content:");
    expect(body).not.toContain("Documents");
  });

  it("delivery shows only the enabled lines", () => {
    const body = composeEventEmailBody({
      module: "DELIVERY",
      flags: { printRefNo: true, printWeight: false, printSender: true, printPcs: true },
      variables,
    });
    expect(body).toContain("Ref No.: REF-9");
    expect(body).toContain("Pcs: 2");
    expect(body).toContain("Sender: Sender Desk");
    expect(body).not.toContain("Weight:");
    expect(body).not.toContain("2.50");
    expect(body).not.toContain("DOX");
  });

  it("forwarding shows vendor name only when that toggle is on", () => {
    const off = composeEventEmailBody({
      module: "FORWARDING",
      flags: { printDoxSpx: true, printVendorName: false, printWeight: true },
      variables,
    });
    expect(off).toContain("DOX/SPX: DOX");
    expect(off).toContain("Weight: 2.50");
    expect(off).not.toContain("Vendor Name");
    expect(off).not.toContain("Blue Dart");

    const on = composeEventEmailBody({
      module: "FORWARDING",
      flags: { printVendorName: true },
      variables,
    });
    expect(on).toContain("Vendor Name: Blue Dart");
    expect(on).not.toContain("DOX/SPX");
  });

  it("weight alert shows only the six toggles that are on", () => {
    const body = composeEventEmailBody({
      module: "WEIGHT_ALERT",
      flags: {
        printSender: true,
        printOrigin: false,
        printConsignee: true,
        printVendorAwbNo: false,
        printVendorName: true,
        printPcs: true,
      },
      variables: {
        sender: "Sender Desk",
        Origin_Name: "Bangalore",
        Consignee_Name: "Receiving Co",
        Agent_AWBno: "V-100",
        Vendor_Name: "Blue Dart",
        Pcs: "3",
      },
    });
    expect(body).toContain("Sender: Sender Desk");
    expect(body).toContain("Consignee: Receiving Co");
    expect(body).toContain("Vendor Name: Blue Dart");
    expect(body).toContain("PCS: 3");
    expect(body).not.toContain("Origin:");
    expect(body).not.toContain("Bangalore");
    expect(body).not.toContain("Vendor AWB No");
    expect(body).not.toContain("V-100");
  });
});

describe("credit-limit reevaluation batching", () => {
  it("does not walk a large customer set inside one percentage save", () => {
    expect(creditReevalPages(10_000)).toBe(50);
    expect(CREDIT_REEVAL_BATCH_SIZE).toBe(200);
    const sql = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/0128_utility_setup_module.sql"),
      "utf8",
    );
    const saveStart = sql.indexOf("function public.save_utility_miscellaneous");
    const saveEnd = sql.indexOf("function app.setup_email_module_code");
    const saveFn = sql.slice(saveStart, saveEnd);
    expect(saveFn).toContain("process_credit_limit_reeval_batch(v_tenant, 200)");
    expect(saveFn).not.toContain("for v_customer in");
    expect(sql).toContain("limit v_batch");
    expect(sql).toContain("c.credit_limit > 0");
  });
});
