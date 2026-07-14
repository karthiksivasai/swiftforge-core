// Generates supabase/migrations/0010_permission_modules_seed.sql from the exact
// module list shown on the Access Rights screen (src/routes/utility.users.access-rights.tsx).
// Run: node supabase/tests/gen_permission_modules.mjs
import { writeFileSync } from "node:fs";

const SECTIONS = {
  MASTERS: {
    code: "mst",
    items: [
      "Product Master|Masters",
      "Zone Master|Masters",
      "Country Master|Masters",
      "Customer Master Edit Contract Amount|Masters",
      "Unit Master|Masters",
      "Destination Master|Masters",
      "Service Center Master|Masters",
      "State Master|Masters",
      "Sales Executive Master|Masters",
      "Industry Master|Masters",
      "Flight No Master|Masters",
      "Product Type|Masters",
      "Content Master|Masters",
      "Instruction Master|Masters",
      "Local Branch Master|Masters",
      "Charge Master|Masters",
      "Bank Master|Masters",
      "Customer Master|Masters",
      "Customer Contract Master|Masters",
      "Consignee Master|Masters",
      "Shipper Master|Masters",
      "Expense Master|Masters",
      "Vendor Master|Masters",
      "Vendor Contract Master|Masters",
      "Service Mapping|Masters",
      "Field Executive Master|Masters",
      "Delivery Routes Master|Masters",
      "Area Master|Masters",
      "Delivery Exception Master|Masters",
      "Airlines|Masters",
      "Country Pincodes|Masters",
    ],
  },
  TRANSACTION: {
    code: "txn",
    items: [
      "Pickup|Entry",
      "Pickup Insacn|Entry",
      "Allow Modify Delivered Entry|Entry",
      "AWB Entry|Entry",
      "AWB Entry Allow Previous Date Entry|Entry",
      "AWB Entry Change Volumetric Weight Divide|Entry",
      "AWB Entry Display Amount|Entry",
      "AWB Entry Display Cash Receipt Details|Entry",
      "AWB Entry Display Vendor Amount|Entry",
      "AWB Entry Edit Amount|Entry",
      "Awb Entry File Setup|Entry",
      "AWB Entry Lock Option|Entry",
      "AWB Entry Modify after Invoice Generated|Entry",
      "AWB Entry Modify after Manifest Generated|Entry",
      "AWB Entry Modify Customer Code-Entryby Customer|Entry",
      "AWB Entry VOID/Cancel|Entry",
      "AWB Weight Change Access|Entry",
      "Freight Amount Edit|Entry",
      "Modify Amount Edit Entry|Entry",
      "OBC Entry Lock/UnLock|Entry",
      "Performa Invoice|Entry",
      "POD Entry OK Update|Entry",
      "shipment details|Entry",
      "Manifest Scan|Entry",
      "Manifest In Scan|Entry",
      "Update Manifest|Entry",
      "Drs Scan|Entry",
      "Bagging|Entry",
      "Un-Delivery Scan|Entry",
      "Miss Route Scan|Entry",
      "Transfer Run|Entry",
      "OBC Entry|Entry",
      "Awb Query|Entry",
      "Forwarding Updation|Entry",
      "AWB Query Comment Update|Entry",
      "AWB Query Progress Update|Entry",
      "Progress / Comments Update|Entry",
      "KYC Tracking|Entry",
      "AWB Hold Unhold|Entry",
      "Entry Lock Update|Entry",
      "Update Record|Entry",
      "Expense Authorize|Entry",
      "Receipt Adjustment|Entry",
      "Receipt Entry|Entry",
      "Expense Entry|Entry",
      "Debit Note|Entry",
      "Credit Note|Entry",
      "Customer Pay|Entry",
      "Pickup Cancel|Entry",
      "Pod To Excel|Entry",
      "Vendor Rate Compare|Entry",
      "CustomerRateCompare|Entry",
      "Opertation Dashboard|Entry",
      "Sales Dashboard|Entry",
    ],
  },
  DOCUMENTS: {
    code: "doc",
    items: [
      "Invoice Cancel After IRN Generated|Documents",
      "Generate Invoice|Documents",
      "Print Invoice|Documents",
      "Allow Invoice Date To Change|Documents",
      "Invoice Finalise|Documents",
      "Invoice IRN Generation|Documents",
    ],
  },
  REPORTS: {
    code: "rpt",
    items: [
      "Action Log|Reports",
      "AWB Printing|Reports",
      "Bag wise Detail Print|Reports",
      "Bagging Report|Reports",
      "Billing Report|Reports",
      "Cash Collection Report|Reports",
      "COD Report|Reports",
      "Comment View Report|Reports",
      "Customer AWB Stock Report|Reports",
      "Customer Register / Profit|Reports",
      "Customer Summary|Reports",
      "Daily Report|Reports",
      "Delivery Status Report|Reports",
      "Destination Summary Report|Reports",
      "DRS Report|Reports",
      "EDI CSB Files|Reports",
      "Forwarding No Missing Report|Reports",
      "Forwarding Report|Reports",
      "Invoice Report|Reports",
      "Location Summary|Reports",
      "Login Log|Reports",
      "Manifest POD Report|Reports",
      "Manifest Report|Reports",
      "MIS Report|Reports",
      "OBC Report / Checklist|Reports",
      "OK Delivery|Reports",
      "Operation Report|Reports",
      "Product Summary|Reports",
      "Sales Executive Wise Sales Report|Reports",
      "Scan Report|Reports",
      "Tariff Rate Report|Reports",
      "Tax Report|Reports",
      "Unassigned DRS Report|Reports",
      "Unassigned Manifest Report|Reports",
      "Unassigned OBC Report|Reports",
      "Undelivery Report|Reports",
      "User Analysis Report|Reports",
      "User Entry Log Report|Reports",
      "Vendor Profit Report|Reports",
      "Void Report|Reports",
      "Volumetric Weight Report|Reports",
      "Zero Report|Reports",
      "Statement Report|Reports",
      "AWB Report|Reports",
      "Reports Allow Report Field Selection|Reports",
      "Scan Report|Reports",
      "AR Report|Reports",
    ],
  },
  UTILITIES: {
    code: "utl",
    items: [
      "Serviceable Pincode|Utilities",
      "Notification|Utilities",
      "Fuel Setup|Utilities",
      "User Setup|Utilities",
      "Access Rights|Utilities",
      "AWB Merging|Utilities",
      "LoggedIn Users|Utilities",
      "Pod Merging|Utilities",
      "Forwarding Merging|Utilities",
      "Customer AWB Stock Merging|Utilities",
      "Data Import|Utilities",
      "Other Charges Import|Utilities",
      "Data Updation|Utilities",
      "Tax & Surcharge Setup|Utilities",
      "Xpresion Setup|Utilities",
      "Rate Update|Utilities",
      "Zone Update|Utilities",
      "Rate Import|Utilities",
    ],
  },
  MOBILE: {
    code: "mob",
    items: [
      "AWBEntry|MobileApplication",
      "Delivery|MobileApplication",
      "DRS|MobileApplication",
      "Manifest|MobileApplication",
      "ManifestInscan|MobileApplication",
      "Pickup|MobileApplication",
      "PickupInScan|MobileApplication",
      "POD Entry|MobileApplication",
      "PreDrs|MobileApplication",
      "Report|MobileApplication",
      "TRACK|MobileApplication",
      "Pickup Return|MobileApplication",
      "Scan & Print|MobileApplication",
    ],
  },
};

const kebab = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const esc = (s) => s.replace(/'/g, "''");

const rows = [];
const seen = new Set();
let order = 0;
let dupes = 0;
for (const [section, { code, items }] of Object.entries(SECTIONS)) {
  for (const entry of items) {
    const [name, underMenu] = entry.split("|");
    const slug = `${code}.${kebab(name)}`;
    order += 1;
    if (seen.has(slug)) {
      dupes += 1;
      continue;
    } // dedupe (e.g. Reports "Scan Report" twice)
    seen.add(slug);
    rows.push(`  ('${esc(slug)}', '${section}', '${esc(name)}', '${esc(underMenu)}', ${order})`);
  }
}

const sql = `-- ===========================================================================
-- 0010  permission_modules seed (GENERATED — do not edit by hand)
-- ---------------------------------------------------------------------------
-- Source: Access Rights screen (src/routes/utility.users.access-rights.tsx).
-- Generator: supabase/tests/gen_permission_modules.mjs
-- The screen lists 169 entries but "Scan Report" appears twice in REPORTS, so
-- there are ${rows.length} UNIQUE modules (${dupes} duplicate collapsed by slug).
-- Idempotent: ON CONFLICT (slug) keeps rows current.
-- ===========================================================================

insert into public.permission_modules (slug, section, name, under_menu, sort_order) values
${rows.join(",\n")}
on conflict (slug) do update
  set section    = excluded.section,
      name       = excluded.name,
      under_menu = excluded.under_menu,
      sort_order = excluded.sort_order,
      is_active  = true,
      updated_at = now();
`;

const out = new URL("../migrations/0010_permission_modules_seed.sql", import.meta.url);
writeFileSync(out, sql);
console.log(`Wrote ${rows.length} unique modules (${dupes} duplicate(s) collapsed).`);
