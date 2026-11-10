# AWB and Proforma production-readiness test (Cursor Partial)

Date: 10 Nov 2026. Branch `awb-entry-production-ready` at `7df2cad`. Tester signed in as Karthik Test Admin at `http://localhost:8082/transaction/awb-entry`. Database is the DEV project `ijosczggsrvscponules` only. No cleanup script was run. No code was changed during the test.

Screen means the value was read on the open page while logged in. Database means a read-only query after the screen save. Print means the visible invoice preview (the iframe titled Invoice-*.pdf). A database query is never counted as the screen test.

Booked and left alone: **100063** `TEST_AWB_R1`, **100064** `TEST_AWB_R2`, **100065** `TEST_AWB_R4`. No row was created for `TEST_AWB_R3`, `TEST_AWB_R5`, or `TEST_AWB_R6`.

## Invalid: result taken from the old server

The dev server that had been running since 7 November was still the process on port 8082 until 10 Nov 2026, 17:36 IST (12:06:51 UTC). It was serving the old Next behaviour.

**INVALID.** On that old server, clicking Next on open AWB **000043** (`TEST_AWB_I2`) toasted “AWB 000043 booked”, saved it again, and opened a blank form. Database `updated_at` is 12:06:07 UTC, about 40 seconds before the restart. That click is not a test of commit `7df2cad`. Do not treat it as a failure of the current Next rule. Money on 000043 was unchanged (grand total 649.00).

The current server was then started from `swiftforge-core`, branch `awb-entry-production-ready`, commit `7df2cad`. Bookings after that restart, and so on the new server: 100063 at 12:13 UTC, 100064 at 12:20 UTC, 100065 at 12:48 UTC. R1, R2, and R4 below are those bookings.

**Fresh Next check, 10 Nov 2026 about 19:00 IST, after another server restart and a new sign-in.** One listener on port 8082. Signed in as Karthik Test Admin. On a blank AWB form, reference `TEST_NEXT_CHECK` was typed and Next was clicked. The selected tab changed from AWB to Proforma. No toast. AWB number stayed AUTO. Going back to the AWB tab still showed `TEST_NEXT_CHECK`. Next did not save and did not clear the form. PASS.

## What was not finished on the screen

R7 was walked on screen on 10 Nov 2026 after the fresh sign-in. R8 (credit with amount received 500), the rest of the R9 mistake list, and R10 (reopen, lock, unlock, edit instruction) are still not finished. R10 cannot be done until an R3 shipment actually books.

## Decisions checked

International only. Save books. Next only moves to the next tab and does not save or clear. The server is the source of truth after Save. DOX needs no proforma lines. A typed LUT is not taken from the branch. Exchange rates in the database are TEST placeholders. The CSB IV limit setting row is missing in DEV, so both the screen and the database function fall back to ₹1,00,000.

## Next, on every case that was walked

The tabs on the screen are **AWB, Proforma, Forwarding, KYC, Notification**. Next walks that order and is hidden on Notification. It did not assign an AWB number and did not clear the form. Checked on screen during R1, R2, R3, and R4.

The handoff is behind the screen. Section B lists AWB, Proforma, Forwarding, KYC and leaves out Notification. Section C still says Next saves and opens a blank form. Sections B and H, and the screen, say Next only changes the tab.

## Typed LUT expiry

There is no expiry box on the Proforma tab. The LUT box appears only when Bond/UT is Yes, and it does not fill itself from the shipper. On R3 the shipper LUT `LUT-TEST-RAVI-2026` (expiry 2027-03-31) was not copied onto the form. A different number typed by hand is not compared with any expiry. The code that would check the customer LUT crashes before it can show a message (PR-01). The comment at `transaction.awb-entry.tsx` lines 1409–1410 says the shipper is a source. The code on lines 1413–1422 reads only `loadedClientProfile`, which is the customer, and that name is not in scope inside `collectAwbProductionErrors`.

## R1. Gift, CSB 4 — PASS with print and display faults

Checked on screen, in the database, and on the print. AWB **100063**, reference `TEST_AWB_R1`, status BOOKED. Toast: "AWB 100063 booked".

| Item | Screen | Database | Print | Result |
| --- | --- | --- | --- | --- |
| Charge weight | 2.000 | 2.000 | 2.000 | PASS |
| Freight | 1,000.00 | 1,000.00 | 1,000.00 | PASS |
| Fuel | 100.00 | 100.00 | 100.00 | PASS |
| CGST / SGST | 99.00 / 99.00 | 99.00 / 99.00 | 99.00 / 99.00 | PASS |
| IGST on courier | 0.00 | 0.00 | 0.00 | PASS |
| Total | 1,298.00 | 1,298.00 | 1,298.00 | PASS |
| Received / balance | 1298 / 0.00 | 1,298.00 / 0.00 | 1,298.00 / 0.00 | PARTIAL — screen received has no decimals |
| CSB / reason | CSB 4 / UNSOLICITED GIFT - NOT FOR SALE | same | title PROFORMA INVOICE; other reference "BONAFIDE GIFT" | PARTIAL |
| Currency / rate / INR | INR / 1 / 1,400 | same | goods total 1,400.00 | PASS |
| LUT / AD / IEC | blank | blank | blank | PASS for a gift |

Evidence: `docs/production-readiness-evidence/r1-proforma-invoice.png`.

The sweets line stored box number `1` instead of `Box-1`, so the print repeats the same 30×20×15 box under two box numbers.

## R2. Documents only — PASS, with extra rules the operator still has to satisfy

Checked on screen, in the database, and on the visible print. AWB **100064**, reference `TEST_AWB_R2`, status BOOKED. ALIASSO, FEDEX, UAE, 0.500 kg, Credit, received 0. No proforma lines. CSB was set to ECM DOX and the reason to PERSONAL, because a first Save with both blank was blocked.

| Item | Screen | Database | Print | Result |
| --- | --- | --- | --- | --- |
| Charge weight | 0.500 | 0.500 | 0.500 | PASS |
| Freight | 350.00 | 350.00 | 350.00 | PASS |
| Fuel | 35.00 | 35.00 | 35.00 | PASS |
| CGST / SGST | 34.65 / 34.65 | 34.65 / 34.65 | 34.65 / 34.65 | PASS |
| Total | 454.30 | 454.30 | 454.30 | PASS |
| Received / balance | 0 / 454.30 | 0.00 / 454.30 | 0.00 / 454.30 | PASS — balance equals the total |
| Lines | none | `lines: []` | "No proforma lines" | PASS |
| Invoice number | blank | blank | printed "01" | FAIL |
| Amount in words | — | — | RUPEES ZERO ONLY (the goods total) | FAIL for a courier bill |

`book_awb_shipment` took 536 ms. Nothing over 1 second. `remember_party_contact` returned 409 and then 200.

Evidence: `docs/production-readiness-evidence/r2-invoice-100064.png`.

## R3. Sarees under LUT — FAIL, nothing was booked

Checked on screen only. Save was clicked twice. No toast, no `book_awb_shipment` call, no database row.

The weight rule passed on the screen before the crash. Three boxes: 40×30×20 cm at 1 kg (charge 4.800), 50×40×30 at 2 kg (charge 12.000), 20×20×20 at 1.2 kg (charge 1.600). Header actual 4.200, volumetric 18.400, charge weight **18.500** (the three unrounded charges added to 18.4, then one step up to the next 0.5 kg).

Money on screen, zone-2 COM at 700/kg: freight 12,950.00, fuel 1,295.00, CGST 1,282.05, SGST 1,282.05, total 16,809.10. USD banner: 1 USD = ₹86.50, goods USD 180.00 ≈ ₹15,570.00. Bond/UT Yes, Pay of IGST No, AD `ADTEST0001`, LUT typed `LUT-TEST-RAVI-2026`, IEC `TESTIEC001`.

| Item | Screen | Database | Print | Result |
| --- | --- | --- | --- | --- |
| Charge weight | 18.500 | no row | no print | PASS on screen only |
| Freight / fuel / GST / total | 12950 / 1295 / 1282.05+1282.05 / 16809.10 | no row | no print | PASS on screen only |
| USD rate and INR value | 86.50 / 15570 | no row | no print | PASS on screen only |
| Save, LUT, AD, IEC, title | form filled | not stored | not printed | FAIL |

Console, twice: `ReferenceError: loadedClientProfile is not defined` at `collectAwbProductionErrors` (`transaction.awb-entry.tsx` lines 1413–1414), called from `persistAwb` (line 3667). Buttons disable and then come back. No AWB number.

Evidence: `docs/production-readiness-evidence/page-2026-11-10T12-40-01-001Z.png` (three lines, USD 180 ≈ ₹15,570).

R10 was not started. There is no booked R3 shipment to reopen.

## R4. Commercial samples, IGST paid — PARTIAL

Checked on screen, in the database, and on the print. AWB **100065**, reference `TEST_AWB_R4`, status BOOKED. ALIASSO, COM, FEDEX, USA, 1.000 kg, Credit, received 0.

Bond/UT was set to Yes first. The LUT box appeared empty. Pay of IGST was then set to Yes. Bond/UT switched to No and the LUT box disappeared. That switch passed on screen and is stored as `bondUt: No`, `payOfIgst: Yes`.

Courier money (ALIASSO is in Telangana, so CGST+SGST, not IGST): freight 500.00, fuel 50.00, CGST 49.50, SGST 49.50, IGST 0.00, total 649.00, balance 649.00. Same in the database and on the print.

Goods lines: fabric swatches 200.00 with IGST 36.00, buttons 50.00 with IGST 9.00. Total IGST on the form 45.00. The database stores `igstAmount` 36.00 and 9.00. The print has no goods IGST column and no Total IGST.

| Item | Screen | Database | Print | Result |
| --- | --- | --- | --- | --- |
| Weight | 1.000 | 1.000 | 1.000 | PASS |
| Freight / fuel / CGST / SGST / total | 500 / 50 / 49.50 / 49.50 / 649 | same | same | PASS |
| Received / balance | 0 / 649.00 | 0.00 / 649.00 | 0.00 / 649.00 | PASS |
| CSB / reason | CSB 5 / COMMERCIAL SAMPLES | same | COMMERCIAL INVOICE, other reference COMMERCIAL SAMPLES | PASS |
| Line IGST / Total IGST | 36.00 + 9.00 = 45.00 | same | not shown | FAIL on the print |
| IEC / AD / GSTIN | TESTIEC001 / ADTEST0001 / 36ABCDE1234F1Z5 | in the proforma and shipper document | all three printed | PASS |
| LUT | hidden because Bond/UT is No | empty | LUT No blank | PASS |
| Second box number | stored as `1` | `boxNo: "1"` | printed as box 1, same dimensions repeated | FAIL |

`book_awb_shipment` took 846 ms. No call over 1 second. No console error on the successful save.

The first Save, before the document number was corrected, was blocked with "GSTIN format is invalid (15 characters) ..!". The shipper master had accepted `36TESTIEC001Z5` (14 characters, not the GSTIN pattern). The form was then given a pattern-valid test number `36ABCDE1234F1Z5` so the booking could finish. The master row was not changed.

Evidence: `docs/production-readiness-evidence/r4-proforma-igst.png`, `docs/production-readiness-evidence/r4-invoice-100065.png`.

## R5. OSMO, another state, 12 inch box — FAIL, not booked

Checked on screen. Customer OSMO (billing state Karnataka), NDOX, FEDEX, USA, one box 12×12×12 inches, actual 1 kg, Credit, CSB 4, gift reason, one gift line. No AWB was created.

| Item | Screen | Expected | Result |
| --- | --- | --- | --- |
| Unit chosen | Inch, then the draft went back to Centimeter after Add | Inch | PARTIAL |
| Division | 5000 | 305 | FAIL |
| Volumetric | 0.346 (12×12×12 / 5000) | about 5.666, then 6.000 | FAIL |
| Charge weight | 1.000 | 6.000 | FAIL |
| Customer rate link | none. Only the vendor link TEST_AWB_FEDEX_NDOX_Z1 | an OSMO NDOX zone-1 rate | FAIL |
| Freight and GST | 0.00, so IGST versus CGST was never shown | IGST, not CGST/SGST | not tested — nothing was rated |
| Save | blocked | a booked AWB | FAIL |

Save message, on screen: "No customer rate was found for this origin, destination, and product".

The database has no `customer_volumetrics` row for OSMO. ALIASSO NDOX/FEDEX has inch divisor 305. The seed gives OSMO only a DOX zone-1 rate (`TEST_AWB_OSMO_DOX_Z1`). With no matching row, `resolveDivision` returns `"5000"` (`awbEntryRules.ts` line 64) and the screen does not say that the inch divisor is missing.

## R6. Gift over the CSB IV limit — PASS for the block, on the open OSMO form

The limit check does not use the customer, so it was run on the OSMO form that was already open (reference still `TEST_AWB_R5` on screen; no R6 row). CSB 4, reason UNSOLICITED GIFT - NOT FOR SALE, currency USD, one line of USD 1,500. No AWB was created.

Banner on screen: "Customs Exchange Rate: 1 USD = ₹86.50 INR. Proforma Value: USD 1500.00 (≈ ₹129750.00 INR). Exceeds CSB-IV Limit (₹1,00,000) — CSB-V Commercial Required".

Save message: "Proforma value (1500.00 USD = ₹129750.00 INR) exceeds the statutory CSB-IV limit of ₹1,00,000.00 INR. Commercial CSB-V export is mandatory for shipments exceeding this limit."

Commercial was then pressed. The screen changed CSB to CSB 5 and the reason to SALE by itself. IEC was empty. AD Code was empty. Save stayed blocked. Two messages:

- Toast: "Ad Code is required when CSB Type is CSB 5"
- Field text: "Valid 10-character alphanumeric IEC is required on Shipper for CSB-V / Commercial export."

The page was on the AWB tab after that Save (the IEC field lives there) while the toast talked about Ad Code.

The gift reason was no longer on the form when Commercial was pressed, so "commercial plus a gift reason" was not the combination that was saved. That pair still needs its own click.

## R7. Five boxes and 15 lines from Excel — PASS on screen, not booked

Checked on screen. Not saved, so there is no AWB number and no print. Customer ALIASSO, product NDOX, vendor FEDEX, destination United Arab Emirates, reference `TEST_AWB_R7`.

MTS file: 5 rows, each 1 kg, 20×20×20 cm, 1 piece. Toast: "Added 5 piece rows".

| Item | Screen | Expected | Result |
| --- | --- | --- | --- |
| Pieces | 5 | 5 | PASS |
| Piece rows | 5 | 5 | PASS |
| Actual / volumetric / charge | 5.000 / 8.000 / 8.000 | 5 / 8 / 8 (1.6 kg per box, already on a 0.5 step) | PASS |
| Freight / fuel / CGST / SGST / total | 5600.00 / 560.00 / 554.40 / 554.40 / 7268.80 | zone-2 NDOX at 700/kg | PASS |
| Customer / vendor rate | TEST_AWB_NDOX_Z2 / TEST_AWB_FEDEX_NDOX_Z2, both zone 2 | those test contracts | PASS |

Proforma file: 15 lines, box numbers 1 through 5, HSN 6205, rate 10. Toast: "15 proforma lines imported". Total Record 15, quantity 15, weight 3.00, amount 150.00. The Box No list offered Box-1, Box-2, Box-3, Box-4, and Box-5. The page stayed responsive; Upload disabled while the file was read and came back. PASS.

One extra toast before the vendor was chosen: "Add the shipment weight before calculating vendor charges". The customer rate link TEST_AWB_NDOX_Z2 was already on the form before FEDEX was selected. After FEDEX, the vendor link became TEST_AWB_FEDEX_NDOX_Z2.

## R8, R9, R10

Not clicked through as their own cases, except the pieces already seen:

- Blank CSB on a DOX shipment (during R2) jumped to the Proforma tab and said "CSB Type is required. Select CSB 4, CSB 5, etc. on the Proforma tab." No AWB until CSB and a reason were filled.
- Credit with empty cash receipt fields saved on R2 and R4.
- Bond/UT Yes does not show the LUT message. It crashes (R3). The expired-LUT and missing-LUT cases will hit that crash.
- A box number above the piece count was not tried. The box list itself resets, and a line can store `1` when the box list has gone blank.
- Double-click Save was not tried on a booking that succeeds.
- An error that lives on the AWB tab, while the operator is on Proforma, was seen on R6: the page moved to the AWB tab. The toast and the field did not name the same thing.

R10 is blocked by the R3 crash.

## Problems

| ID | Severity | What happened | Where |
| --- | --- | --- | --- |
| PR-01 | Blocker | Bond/UT Yes crashes Save. No toast, no AWB. `loadedClientProfile is not defined`. | `src/routes/transaction.awb-entry.tsx` 1413–1414, called at 3667 |
| PR-02 | Major | Print changes any reason containing GIFT to "Bonafide Gift". Screen and database keep the chosen reason. | `src/lib/transactions/invoiceGenerator.ts` 741–745 |
| PR-03 | Major | After Add line, Box No goes blank. The next line can store `1`. The print then repeats one box under two numbers. Seen on 100063 and 100065. | Proforma line draft reset |
| PR-04 | Major | Choosing the customer copies the customer name, phone, and email onto the shipper and overwrites a name the operator already typed. | Customer select on the AWB tab |
| PR-05 | Major | A new form shows the previous shipment's rate links, including a vendor link before a vendor is chosen. They clear only after the new rating runs. | AWB tab rate links |
| PR-06 | Minor | Amount Received shows `1298` and `0`, not `1298.00` and `0.00`. | AWB tab |
| PR-07 | Major | A blank invoice number prints as `01`. | `invoiceGenerator.ts` 748 |
| PR-08 | Major | "Amount chargeable in words" is the goods total. R2 printed RUPEES ZERO ONLY for a 454.30 courier bill. R4 printed TWO HUNDRED FIFTY for a 649.00 bill. | invoice generator |
| PR-09 | Minor | DOX does not need lines, but CSB and export reason are still required. The first R2 Save was blocked until both were filled. | `transaction.awb-entry.tsx` 1373–1378 |
| PR-10 | Major | Forwarding shows vendor freight under Other Charges, vendor weight 0, and the label Fuel(0) while fuel is 25.00. Seen on 100064. | Forwarding tab |
| PR-11 | Major | The screen rate table does not match `customs_exchange_rates` for EUR, CAD, AUD, and SGD. USD 86.50 matches, so R3 and R6 looked right. | `getCustomsExchangeRate` around line 1340 |
| PR-12 | Major | `tenant_settings` has no `csb_iv_value_limit` row. The screen hardcodes 100000. The database function also returns 100000 when the row is missing. | `transaction.awb-entry.tsx` 1441; `0146` `app.get_csb_iv_limit` |
| PR-13 | Blocker for LUT shipments | A typed LUT has no expiry check. The shipper LUT is never read. The customer-LUT check crashes (PR-01). | `transaction.awb-entry.tsx` 1409–1422 |
| PR-14 | Minor | Searching the destination for "UAE" shows no matches. "ARAB" finds United Arab Emirates. | Destination lookup |
| PR-15 | Minor | After a successful Save, Cancel still says "You have an unfinished AWB entry". Discard does not delete the booked AWB. | Cancel dialog |
| PR-16 | Minor | Choosing the vendor before a piece exists clears a weight typed in the header. Seen on R2. | AWB tab |
| PR-17 | Major | Line IGST and Total IGST are correct on the form and in the database, and missing on the commercial invoice. | invoice generator goods table |
| PR-18 | Major | Shipper master saves a GSTIN that is not 15 characters. AWB Save then blocks with "GSTIN format is invalid (15 characters) ..!". | `master.customer.shipper.tsx` save; `awbValidations.ts` 56–61 |
| PR-19 | Blocker for the OSMO case | OSMO has no NDOX rate and no inch divisor. The screen silently uses 5000, charge weight 1.000 instead of 6.000, and Save says no customer rate. IGST on the courier bill was not reached. | `awbEntryRules.ts` 64; DEV rate and volumetric rows |
| PR-20 | Minor | After a piece is added, the unit draft returns to Centimeter. | Pieces draft |
| PR-21 | Minor | Pressing Commercial replaces CSB 4 and a gift reason with CSB 5 and SALE. The operator does not see a "gift reason is not allowed" message for the pair they had typed. | Commercial toggle |
| PR-22 | Minor | On the commercial save with no IEC, the toast named Ad Code and the page moved to the AWB tab, where the IEC message was showing. | `reportSaveErrors` 3612–3645 |
| PR-23 | Docs | Handoff section C still says Next saves. The screen does not. | `docs/awb-entry-handoff.md` section C |

## Verdicts

### a) Code ready?

**Not ready.**

Blockers:

1. A LUT shipment cannot be booked. Bond/UT Yes throws `loadedClientProfile is not defined` and creates nothing (PR-01, PR-13). R3 and R10 stop here.
2. The commercial invoice is not safe to hand to a customer or to customs: gift reasons are rewritten, a blank invoice number becomes 01, the amount in words is the goods total, and line IGST is omitted (PR-02, PR-07, PR-08, PR-17).
3. Box numbers are not reliable after the first line (PR-03).
4. Choosing a customer overwrites the shipper (PR-04). A new form shows the previous rate (PR-05).

The money that did book matched the screen, the database, and the print: R1 1,298.00, R2 454.30, R4 649.00. Weight rounding on the R3 screen (sum, then one step to the next 0.5 kg) was correct. Pay of IGST Yes does switch Bond/UT to No. Next does not save.

### b) Business go-live blockers (outside this code)

These are not fixed by a code change alone:

- Real customer and vendor rate cards, zones, and the fuel percent. The rows in DEV are TEST placeholders. OSMO has no NDOX rate and no inch divisor, so the Karnataka IGST case cannot be booked today.
- Real vendor contracts.
- Real CBIC exchange rates. The stored USD 86.50, EUR 92, GBP 110, AED 23.55 and the other seeded rates are marked TEST and run to 2030.
- A real AWB number series for production. DEV is on the 100001 auto series.
- The CSB IV limit and the LUT rule (whose LUT counts when the shipper, the customer, and a typed number differ) confirmed by the CA or the customs broker. DEV has no `csb_iv_value_limit` setting.
- A production Supabase project, with backups. `ijosczggsrvscponules` is DEV only.
- The Supabase security warning on `charge_definitions`. Not changed in this test.
- DTDC "LIVE" test AWB 000025. Not changed in this test.

## Proposed fixes, in batches

Not started. Waiting for approval.

**Batch 1 — booking must not crash.** Pass the customer profile into `collectAwbProductionErrors`. Read the shipper LUT as well as the customer LUT. Check expiry of a typed LUT against the book date, and show the message instead of throwing. Do not guess which LUT wins when the three sources differ until the CA confirms it.

**Batch 2 — the printed invoice.** Print the reason the operator chose. Print a blank invoice number as blank. Put the courier total in the amount in words, or label the goods total clearly. Add the line IGST and Total IGST when Pay of IGST is Yes. Keep LUT off the print when Bond/UT is No.

**Batch 3 — the form must not surprise the operator.** Keep the chosen box number after Add. Do not copy the customer onto the shipper when a shipper is already filled. Do not show another shipment's rate links on a blank form. Keep the measurement unit after Add.

**Batch 4 — one source for rates and limits.** Read exchange rates and the CSB IV limit from the database on the screen. Reject a bad GSTIN on the shipper master with the same rule the AWB uses. Say so when an inch divisor is missing instead of silently using 5000.

**Batch 5 — smaller corrections.** Forwarding should show vendor freight as freight, the vendor weight, and the fuel percent. Amount Received should show two decimals. "UAE" should find United Arab Emirates. Cancel after a successful Save should not say the entry is unfinished. The handoff section C sentence about Next should be corrected. The toast and the tab jump should name the same field.

