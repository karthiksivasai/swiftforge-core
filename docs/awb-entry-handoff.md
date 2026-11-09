# AWB Entry handoff

Written 9 Nov 2026 for a new agent that cannot see the previous chat. The detailed finding list is `docs/awb-entry-audit.md`. Trust the "Final status, 9 Nov 2026" table there over the original FAIL lines and over the "Live status" table. Those earlier sections are the evidence from before the fixes. They were kept on purpose.

The app is not production ready. The booking code for the decided rules is in place. Real rate cards, a CA confirmation, and the test-data cleanup are still waiting. The cleanup script has not been run.

## A. Project overview

This is Swiftforge, a courier ERP. The owner is using the AWB Entry screen for international bookings only. The git repo is this `swiftforge-core` folder. The parent folder is only the workspace.

Stack:

- TanStack Start and TanStack Router, React 19, Vite 8, Tailwind 4, Zod
- Supabase (Postgres, Auth, RLS). The linked project is used with `supabase db query --linked`
- Tests are Vitest 4

Useful folders:

- `src/routes` — pages and API routes. AWB Entry is `src/routes/transaction.awb-entry.tsx`
- `src/lib/transactions` — form mapping, booking rules, documents, MTS import
- `src/lib/rating/ratingEngine.ts` — client-side rating helpers used by tests. The booked money comes from the SQL rating functions, not from this file
- `src/lib/validation/awbValidations.ts` — older client validation helpers. The save path that matters is `app.awb_field_errors` inside `book_awb_shipment`
- `src/components` — shared UI
- `supabase/migrations` — schema. Do not edit a file that is already applied
- `scripts/awb-audit` — seed and cleanup for the international test cards
- `docs/awb-entry-audit.md` — every finding and the current status

### Run it locally

From `swiftforge-core`:

```bash
npm install
npm run dev
```

The dev server is `http://localhost:8082` (`vite.config.ts`). The AWB page is `/transaction/awb-entry`.

Copy `.env.example` to `.env.local`. Do not commit that file. The names, with no secret values:

- `VITE_SUPABASE_URL` — project URL only, no `/rest/v1`
- `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` — browser anon key
- `SUPABASE_SERVICE_ROLE_KEY` — server only. The seed and cleanup scripts use it. Never print it
- `SUPABASE_DB_URL` — optional direct Postgres URL. The working path for SQL in this project is the Supabase CLI, already linked: `supabase db query --linked -f supabase/migrations/0146_something.sql`

Apply a new migration with that CLI command from `swiftforge-core`. A multi-statement query returns only the last result. Prefix column names in joins (`s.fuel_amount`, `c.fuel_amount`). The CLI needs to run outside a sandbox because its telemetry file is blocked otherwise.

### Sign in

Username `kkarthik`. The screen chip is "KA Karthik Test Admin". The session email is `kkarthik3162@gmail.com`. Home branch is Head Office, branch code HO, id `b69b8007-dd55-4808-a8b1-afb91a9a46a4`. The password is not in the repo. Ask the owner. Do not write it into a file, a commit, or a reply.

After a navigation the page can flash "Sign in" before it hydrates. Wait until the chip says Karthik Test Admin.

### Tests

```bash
npm test
```

That is `vitest run`. The last full run, on 9 Nov 2026, was 427 tests in 84 files, all passed. Some DB tests time out in a restricted sandbox and pass when the process can reach the network. A timeout is not a product failure until it still fails with network access.

### Key files

| File | What it does |
|---|---|
| `src/routes/transaction.awb-entry.tsx` | The whole AWB screen: form, pieces, charges, KYC, Save, Next, Cancel, lock. Save calls `bookAwbShipment` at the two persist sites. There is no Book button. `handleBook` exists and is not wired to a button. Leave it that way. |
| `src/lib/transactions/shipmentUiMap.ts` | `uiFormToShipmentPayload` and `dbShipmentToFormPatch`. Maps the form to the shipment JSON and back. Branch comes from the caller. KYC metadata in `wizard_extras` is the file name, not the bytes. |
| `src/lib/transactions/awbEntryRules.ts` | Piece weight, GST split, fuel, money formatting, consignee checks, length checks, lock caption, and whether a reopen should keep the stored rate. |
| `src/lib/rating/ratingEngine.ts` | Pure rating helpers and seed-shaped records for unit tests. Booked totals are calculated in SQL. |
| `src/lib/validation/awbValidations.ts` | Older field checks and document-format messages. Do not treat this file as the booking gate. |
| `src/routes/api/awb-entry.status.ts` | Status-strip counts (manifest, invoice, debit note, credit note). The AWB number and BOOKED status come from the shipment row. |
| `src/lib/transactions/resources/shipments.ts` | `bookAwbShipment` calls the `book_awb_shipment` RPC. |
| `src/lib/transactions/shipmentDocuments.ts` | Saves and loads shipment files. List does not include bytes. `getShipmentDocument` does. |
| `src/lib/transactions/awbMtsImport.ts` | Import MTS. Headers include Measurement Unit, Actl Weight/PCS, No. Of Pieces, Length, Width, Height. |
| `scripts/awb-audit/seed-international-test-data.mjs` | Creates the TEST_ cards. Do not run it again unless asked. It deletes and recreates the TEST_ rate rows. |
| `scripts/awb-audit/cleanup-international-test-data.mjs` | Go-live delete. Has not been run. Do not run it. |
| `scripts/awb-audit/test-data.mjs` | Shared ids, divisors, and the delete helpers. |

Migrations added for this work. All are applied. Do not edit them. The next new file is `supabase/migrations/0146_*.sql`.

| Migration | What it did |
|---|---|
| `0139_awb_save_books.sql` | Save books in one transaction. Adds `vendor_contracts.cm_divisor` and `inch_divisor` (5000 and 305). Blank billing state or branch state blocks the save. |
| `0140_weight_round_gst_split.sql` | Telangana stays state code `TS`. GST alias `36` is only the GST code. One GST rounding rule. `app.apply_booked_money`. |
| `0141_awb_lock_actor.sql` | Adds `locked_by`, `locked_at`, `unlocked_by`, `unlocked_at`. |
| `0142_total_charge_weight_round.sql` | Round the shipment total once, not each piece. `app.vendor_chargeable_weight` reads the vendor contract divisors. |
| `0143_unlock_clears_lock_actor.sql` | Unlock clears `locked_by` and `locked_at`. The audit row keeps the history. |
| `0144_awb_manual_charges_and_limits.sql` | Server prices manual charges. Length limits. Field-executive lookup. Manual numbers must be in 500001–899999. |
| `0145_awb_series_permissions_tax_flag.sql` | AUTO 100001–499999 from the allotment. Overlap rejected. `book_awb_shipment` requires add or modify. `lookup_field_executives` requires list or search. Freight `tax_on_fuel` is set true. |

AWB-related tests:

- `src/lib/transactions/awbEntryRules.test.ts`
- `src/lib/transactions/awbBookingFlow.test.ts`
- `src/lib/transactions/awbMtsImport.test.ts`
- `src/lib/rating/ratingEngine.test.ts`
- `src/lib/validation/awbValidations.test.ts`
- `src/lib/forms/awb-entry-required-fields.test.ts`
- `src/lib/security/rpc-permission-gate.contract.test.ts`
- `src/lib/transactions/resources/awbQuery.test.ts`
- `src/lib/transactions/resources/awbQuerySubTables.test.ts`
- `src/lib/transactions/resources/awbLookup.test.ts`
- `supabase/tests/0125_rpc_permission_gates.sql` is a SQL script the permission-gate test reads. Vitest does not execute it against the database.

## B. Business scope and decisions

These are decided. Do not ask them again, and do not undo them.

- International bookings only. Domestic lanes are out of scope. None of AWB-01 through AWB-52 was only a domestic defect, so they stayed in the list. GST still applies because the customer is in India.
- Save means Book. One server transaction (`book_awb_shipment`). Every booking check runs first. If any check fails, nothing is saved. Status becomes BOOKED. There is no separate Book button.
- Saving an unlocked BOOKED AWB again re-rates it and leaves it BOOKED. A locked AWB cannot be saved until it is unlocked.
- Next saves, toasts the AWB number, then opens a blank form.
- The server is the only source of truth for weights, rates, fuel, GST, totals, and balance. Browser totals are ignored. After Save, show the amounts the server returned.
- GST is 18% from the tax table for every international product, including Commercial and CSB V. CGST+SGST when the customer billing state equals the branch state. Otherwise IGST. Compare `branches.state_code` with `states.code`. Telangana is `TS`, not `36`. `36` is `states.gst_alias`. A blank customer billing state or a blank branch state blocks Save. Do not assume Telangana.
- GST rounding: round the total GST to 2 decimals, then split it in half. CGST is the rounded half. SGST is the remainder. SQL function `app.split_gst`. Do not edit migration `0041`.
- Weight: each piece is max(actual, volumetric), unrounded. Add the pieces. Then, if `vendors.vol_weight_round_off` is true, round that one total up to the next 0.5 kg. The same rule is used for the customer and the vendor. Example: three pieces of 0.6 kg and no dimensions become 2.000 kg, not 3.000 kg. FEDEX and DHL have the round-off flag on.
- Divisors: 5000 cm and 305 inch. 166 is the old pounds figure and is not used. The customer divisor comes from customer volumetric rows (`resolveDivision`). The vendor divisor comes from `vendor_contracts.cm_divisor` and `inch_divisor`.
- Fuel on freight is taxed. The freight snapshot stores `tax_on_fuel` true. A new manual charge defaults Tax On Fuel to Yes. The user can still set a manual line to No. Vendor charge drafts stay No until the user changes them. Do not change the GST math.
- Lock: a locked AWB cannot be saved. Only `txn.awb-unlock` (Admin) can unlock. Lock and unlock write an audit row. Unlock clears `locked_by` and `locked_at`. The screen shows "Locked by {name} on {date}".
- International consignee required: company, address 1, city, postcode, country, phone. State and email are optional. Postcode is loose (letters, numbers, spaces, hyphens). Do not force an Indian pincode lookup for a foreign country. Do not force a 10-digit foreign phone. An Indian shipper mobile, when filled, must be 10 digits.
- Reopening a saved AWB shows the stored amounts. It does not recalculate or write unless a rate-affecting field changes.
- Money fields show 2 decimals. Weights show 3 decimals.
- USA stays zone 1 at 500 per kg on the test card. UAE zone 2 NDOX is 700 per kg. Do not re-save AWB 000037 just to recheck it.
- AWB numbers, decided as option (a) and implemented in 0145: AUTO is 100001–499999 per branch, taken from that branch's AUTO allotment, with no HO prefix. MANUAL is 500001–899999. The server rejects a number that sits in the other series, and it rejects an allotment whose ranges overlap. Existing AWBs 000028–000043 stay. They are below 100001. The next AUTO number is 100001. Do not renumber the test AWBs.
- Pieces box: when piece lines exist, the Pieces field is the sum of those lines. Do not force 0 when there are no lines. The default stays 1.
- `book_awb_shipment` requires `txn.awb-entry` add or modify. `lookup_field_executives` requires `txn.awb-entry` list or search.
- Length limits, on the screen and in `app.awb_field_errors`: reference 30, names 100, address lines 100, city and state 50, phone 15, email 100, IEC 10.
- Cash requires a receipt number, an amount received above 0, and a receipt date. Amount received cannot exceed the total. Expected delivery cannot be before the book date. There is no transit-time table.
- Child AWBs are `{awb}-{seq}` and are written for the piece lines.
- The volumetric label is "Vol Weight". The "(Discount - 0 %)" text stays removed.
- Do not delete AWBs 000028–000043 until the owner asks for the cleanup.

## C. Work done so far

The original findings are AWB-01 to AWB-52. Later findings are AWB-53 to AWB-59. The current status of each one is the final-status table in `docs/awb-entry-audit.md`. Short version:

Fixed or closed: AWB-02, 03, 04, 05, 06, 07, 09, 11, 12, 13, 14, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 46, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58.

Still partial: AWB-01 and AWB-59 (a cold rate call can take over 1 second; booking 000043 did not), AWB-08 (a future book date was not entered again after the rule was added), AWB-21 (Commercial is no longer 0% GST; the 18% row is waiting on the CA; CSB without Ad Code was not retried), AWB-22 (a vendor with no slab was not run), AWB-45 (field errors are on the field; a screen reader was not used), AWB-47 (lock and unlock write an audit row; those rows were not re-read on 000043), AWB-48 (120 piece lines worked; no console error on that booking).

Still open: AWB-10 (ALIASSO loads payment type Cash when the customer master payment type is empty) and AWB-15 (an unserviceable origin was not tried).

No finding was marked "out of scope – domestic", because none of them was only a domestic-lane defect. Domestic work stays out of scope anyway.

### Batch 1 — done

Save books in one transaction. Server amounts. GST from the tax table, split once. Weight rounded once on the total. Vendor contract divisors. Blank state blocks Save. Consignee fields. Lock, unlock, and the lock caption. Invoice uses the same money as the screen and the database. Migrations 0139–0143.

### Batch 2 — done

This is not still open. Live booking 000042, reference TEST_AWB_H2.

- Alt+U focuses Actl Weight/PCS. Alt+C focuses the customer charge description. Alt+W focuses the vendor charge description.
- Book date cannot be in the future. The check uses the India date.
- Manual charge HANDLING CHARGES was kept by the server. Fuel and GST were calculated on the server. Screen, database, and invoice matched.
- Field executives come from `lookup_field_executives`. 000042 stored AKHIL CW.
- Status strip after booking shows the AWB number and BOOKED.
- Next saves, shows the number, and opens a blank form.
- Failed rate calls show an error toast. Rate cards are cached for 60 seconds.
- Length limits listed in section B.
- Manual numbers were checked against 500001–899999 in this batch. The full AUTO/MANUAL split was finished in 0145. See section B. Do not treat the series as undecided.

### Batch 3 — done

Blocked on the live form before any AWB was written. Messages sat on the field.

| Case | Value | Message | AWB created |
|---|---|---|---|
| Mobile | 12 | Shipper mobile must be 10 digits | No |
| Email | abc | Shipper email is not a valid email address | No |
| IEC | BAD | Shipper IEC must be 10 letters or numbers | No |
| Cash, no receipt | empty receipt, amount 100.00 | Cash Receipt No. is required for a cash payment | No |
| Amount above the total | 100.00 while the total was 0.00 | Amount received cannot be more than the total | No |
| Delivery before the book date | 2026-11-08 vs book date 2026-11-09 | Expected delivery date cannot be before the book date | No |

The amount-above-total block was against a total of 0.00. It was not retested after a rated total. Do not describe it as a second block after rating.

### Batch 4 — done

Inline errors (red border, `role="alert"`, `aria-invalid`, `aria-describedby`). Keyboard: Alt+U, Alt+C, Alt+W, Alt+E, Alt+`, Enter moves to the next field, Escape closes Customer Details and the destination dialog. Import MTS of 120 lines on 000043. The piece table scrolls. No console error was recorded on that booking. A screen reader was not used (AWB-45).

### Recheck on 9 Nov 2026 — done

- 000043 branch is HO.
- KYC file `kyc-000043.txt` was saved, the form was closed, 000043 was opened again, and Download returned the same 80 bytes. Total stayed 649.00. Pieces stayed 120.
- Vendor weight uses the contract divisor. A 20×20×20 inch cube was calculated on one piece of 000043 and rolled back. Result 27.000 kg, which is 8,000 / 305 plus the other pieces, rounded up. The booked row was not changed.
- Permissions are in the function bodies. 427 tests passed.
- AUTO 100001 was claimed and the transaction was rolled back, so 100001 was not consumed. Manual 500001 was accepted. Manual 100001 and 499999 were rejected.
- Adding piece lines moved the Pieces box from 120 to 124. That edit was discarded. The saved shipment is still 120.
- Freight `tax_on_fuel` is true on 000043. Money is unchanged.
- Cancel on a dirty form asks before discard. Widths 1366, 768, and 1920 have no horizontal page overflow.

### Screen, database, and invoice

The database was queried again on 9 Nov 2026 while this file was written. The invoice iframe was matched on the earlier live pass for 000035–000039 and 000043. It was not opened again for this file. Customer freight is the header total.

Correct bookings, ALIASSO unless noted, FEDEX, fuel 10%:

| AWB | Ref | What | Weight | Freight | Fuel | IGST | CGST | SGST | Total | Received | Balance |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 000035 | TEST_AWB_A2 | DOX, USA, Cash | 0.500 | 250.00 | 25.00 | 0.00 | 24.75 | 24.75 | 324.50 | 324.50 | 0.00 |
| 000036 | TEST_AWB_B2 | NDOX, UAE, 3 cm pieces | 6.500 | 4550.00 | 455.00 | 0.00 | 450.45 | 450.45 | 5905.90 | 5905.90 | 0.00 |
| 000037 | TEST_AWB_C2 | NDOX, USA, 12 inch cube | 6.000 | 3000.00 | 300.00 | 0.00 | 297.00 | 297.00 | 3894.00 | 3894.00 | 0.00 |
| 000038 | TEST_AWB_D2 | Commercial, USA, IEC | 1.000 | 500.00 | 50.00 | 0.00 | 49.50 | 49.50 | 649.00 | 649.00 | 0.00 |
| 000039 | TEST_AWB_E2 | DOX, USA, Credit | 0.500 | 250.00 | 25.00 | 0.00 | 24.75 | 24.75 | 324.50 | 100.00 | 224.50 |
| 000040 | TEST_AWB_F2 | DOX, USA, Cash | 0.500 | 250.00 | 25.00 | 0.00 | 24.75 | 24.75 | 324.50 | 324.50 | 0.00 |
| 000041 | TEST_AWB_G2 | DOX, USA, OSMO, Karnataka, IGST | 0.500 | 250.00 | 25.00 | 49.50 | 0.00 | 0.00 | 324.50 | 324.50 | 0.00 |
| 000042 | TEST_AWB_H2 | DOX plus HANDLING 10.00 | 0.500 | 250.00 + 10.00 | 26.00 | 0.00 | 25.65 | 25.65 | 337.30 | 337.30 | 0.00 |
| 000043 | TEST_AWB_I2 | 120 pieces, Import MTS | 1.000 | 500.00 | 50.00 | 0.00 | 49.50 | 49.50 | 649.00 | 649.00 | 0.00 |

000042 handling line: amount 10.00, fuel 1.00, CGST 0.90, SGST 0.90, total 12.80, `tax_on_fuel` false. Freight on that AWB is `tax_on_fuel` true. Vendor freight on 000042 is 175.00, fuel 17.50, CGST 17.33, SGST 17.32, total 227.15.

000043 vendor freight is 350.00, fuel 35.00, CGST 34.65, SGST 34.65, total 454.30. Header pieces is 120. Child AWBs run from 000043-1. It is unlocked. A KYC file is stored on it.

000036 header `pieces` is still 1 in the database. The pieces-box sum was added later and checked on 000043 only. Do not re-save 000036 to "fix" that unless the owner asks. Re-saving re-rates.

Vendor GST on 000035 uses the one-paise remainder: total GST 34.65, CGST 17.33, SGST 17.32.

## D. Test data

The seed script creates, from 1 Nov 2026, marked `TEST_AWB_`:

- ALIASSO billing state set to Telangana (`TS`). OSMO billing state set to Karnataka for the IGST case. Cleanup restores both from `scripts/awb-audit/.seed-state.json`, which is gitignored. OSMO's previous state in that file is null. Do not delete the file before cleanup, or the restore will not know the old value.
- Head Office and HYD are both state code `TS`.
- Vendors FEDEX (code FEDE, service FEDEX) and DHL (service EXPRESS). FEDEX and DHL have `vol_weight_round_off` true.
- Products DOX, NDOX, and COM.
- Zone mappings: origin HYD, destination US zone 1, destination AE zone 2.
- Customer rates: ALIASSO zone 1 at 500/kg and zone 2 at 700/kg for DOX, NDOX, and COM. OSMO DOX zone 1 at 500/kg with 10% fuel on the rate row.
- Vendor contracts: FEDEX 350 zone 1 and 500 zone 2. DHL compare rates 400 and 600. Both divisors 5000 cm and 305 inch.
- Fuel 10% on the test fuel rows.
- Customer volumetric rows for ALIASSO, FEDEX and DHL, at 5000 and 305.

Do not re-run the seed unless the owner asks. Running it deletes and recreates those TEST_ rows. It does not by itself delete the booked AWBs, but it does replace the cards those AWBs were priced from.

Commands, from `swiftforge-core`. Do not run the second one:

```bash
node scripts/awb-audit/seed-international-test-data.mjs
node scripts/awb-audit/cleanup-international-test-data.mjs
```

### AWBs in the database

Old and broken. Booked or saved before the server rules. Do not treat their money as correct. Do not re-save them. Migration 0145 set `tax_on_fuel` true on their freight lines and did not recalculate the money.

| AWB | Ref | Status | What is wrong |
|---|---|---|---|
| 000028 | TEST_AWB_A | BOOKED | Header total 275.00 with tax 0. Received 324.50. The screen had shown 324.50. |
| 000029 | TEST_AWB_B | BOOKED | Header total 5005.00 with tax 0. Balance left at 5905.90. Header pieces 1. |
| 000030 | TEST_AWB_C | BOOKED | Charge weight left at 5.666. Header total 3116.30 with tax 0. Balance left at 3676.96. |
| 000031 | TEST_AWB_D | DRAFT | Commercial booking never completed. Header grand total 0. |
| 000032 | TEST_AWB_E | DRAFT | Credit draft. Header grand total 0. Charge line still shows 324.50. |
| 000033 | TEST_AWB_F | DRAFT | Broken weight. Charge line total 3245000.00 against charge weight 0.500. |
| 000034 | TEST_AWB_F | DRAFT | Locked. Header grand total 0. Charge line 324.50. |

New and correct: 000035 through 000043. See the table in section C. 000043 also has the KYC file.

Cleanup, when the owner asks, deletes shipments 000028–000043 and any shipment whose reference starts with `TEST_AWB_`, plus their pieces, charge snapshots, comments, attachments, events, rating audit, proforma items, shipment documents (invoice, label, KYC), and the audit-log rows for those shipment ids. It also deletes the TEST_ contracts, slabs, customer rates, fuel rows, ALIASSO test volumetric rows, and the seeded zone mappings. It restores the ALIASSO and OSMO billing states, then resets AUTO to 100001–499999 and MANUAL to 500001–899999. It does not delete zone master rows. The finance `invoices` register is not written by AWB entry. The AWB invoice is a `shipment_documents` row.

## E. Pending work

The batch list below was the plan before Batches 2, 3, and 4 were finished. Do not rebuild it. The code for each item is in place and was checked live, except where section C says partial or open.

Already done, so it is not the next task:

- Manual charge lines kept and priced on the server (000042).
- Field executives from the database (000042, AKHIL CW).
- Status strip after booking (000042 and 000043).
- Next saves, shows the number, and opens a blank form (000042).
- Rate-call errors are visible. Cards are cached for 60 seconds. A cold call can still exceed 1 second (AWB-01, AWB-59). That part is not solved.
- Length limits.
- Manual AWB rule. Decided and implemented. AUTO 100001–499999, MANUAL 500001–899999, overlap rejected. Do not wait for another answer.
- Batch 3 field checks, cash receipt, balance, and expected delivery. The volumetric discount label is removed.
- Batch 4 field errors, keyboard, 120-piece import, and the three widths. A screen reader was not used.

Still open in the product:

- AWB-10. Empty customer payment type becomes Cash. No decision on what it should do instead. Ask before changing it.
- AWB-15. An unserviceable origin was never tried.
- AWB-08, AWB-21, AWB-22, AWB-45, AWB-47, AWB-48. See the partial notes in section C. Do not mark them closed without a live check.
- Cold rate calls over 1 second.

Go-live, in this order, and only when the owner asks:

1. Replace the TEST_ rate cards, vendor contracts, zone mappings, and fuel percent with the real ones.
2. Confirm billing state on every client and branch. A blank state must keep blocking Save.
3. Get the CA confirmation for 18% GST on every international type, and for fuel on freight being taxed. Do not change the rule while waiting.
4. Run `scripts/awb-audit/cleanup-international-test-data.mjs`. Not before. That is what removes 000028–000043 and resets the series.

## F. How we work

- Work one batch at a time. After each fix, add or update tests, retest on the live page while signed in, and show a table of screen vs database vs invoice.
- Stop and ask before any business decision. Do not guess a rate, a GST rule, a series, or a default state.
- Database changes only in a new migration. Never edit 0139–0145 or any older file. The next file is 0146.
- Test data only through the seed script, marked `TEST_`. Do not re-run the seed unless asked.
- Never run the cleanup script unless the owner says so. Never delete 000028–000043 by hand.
- Do not re-save 000035–000043 just to recheck them. Re-saving re-rates. 000037 in particular stays as booked.
- Report what was tested live and what was only read in code. Say "unconfirmed" when a click or a query was not done.
- Explain results in plain language, with one example and the amounts.
- Do not commit unless the owner asks. Do not put the password, the service-role key, or a database URL in a file or a commit.
- The original finding text in the audit stays. Add a new status note. Do not erase the old evidence.

## G. Open questions

Waiting on the owner. Do not invent an answer.

1. CA confirmation of the GST rule (18% on every international type, CGST+SGST or IGST by state) and of fuel on freight being taxed.
2. When to load the real rate cards, vendor contracts, zone mappings, fuel percent, and billing states.
3. When to run the cleanup script.
4. AWB-10: an empty customer payment type currently becomes Cash. What should the form do instead?
5. Whether the remaining partials are the next batch: cold rate calls over 1 second, a future book date typed again, CSB without Ad Code, a vendor with no slab, a screen reader, and a re-read of the 000043 lock audit rows.

Not open: the manual AWB series. Option (a) is implemented. Domestic scope. Save equals Book. The consignee fields. The weight rule. The GST split. The lock rule.
