# AWB Entry audit findings

Code review snapshot, 9 Nov 2026. These 52 findings are stored as recorded. No application code was changed.

Source: review of `/transaction/awb-entry?view=form`, `src/routes/transaction.awb-entry.tsx`, `save_shipment` in `supabase/migrations/0127_awb_number_claim.sql`, and the rating rules.

Counts: 22 FAIL, 20 PARTIAL, 2 BLOCKED, 8 PASS.

## Scope update, 9 Nov 2026

The client will use this software for international bookings only. Domestic lane cases are **Out of scope – domestic**. They are not deleted:

- Domestic same-state lane (Hyderabad to another Telangana city)
- Domestic cross-state lane
- A domestic-only rate card, and a domestic consignee pincode case that does not also apply to an international consignment

None of AWB-01 through AWB-52 is only a domestic-lane defect, so their original status lines are unchanged. GST split (AWB-31) stays in scope, because GST is still billed to the Indian customer. A live addendum is at the end of this file.

## Live addendum, 9 Nov 2026

Signed in as Karthik Test Admin. Test rows were inserted by `scripts/awb-audit/seed-international-test-data.mjs` and can be removed by `scripts/awb-audit/cleanup-international-test-data.mjs`. Every business key starts with `TEST_AWB_`. OSMO billing state was left empty. No application code was changed. Booking cases A–F were run after the inch divisor was changed to 305. The cleanup script has not been run. The original AWB-01 to AWB-52 evidence below is unchanged. The live mark for each one is in "Live status, 9 Nov 2026".

Records used:

- Client ALIASSO / ALI ASSOCIATES, billing state Telangana (TS). Previous billing state was empty.
- Origin HYD / HYDERABAD.
- Zone 1: destination US / USA linked to INTERNATIONAL ZONE 1 (code 1).
- Zone 2: destination AE / United Arab Emirates linked to INTERNATIONAL ZONE 2 (code 2).
- Products DOX / INTL DOX, NDOX / NON DOCUMENTS, and COM / COMMERCIAL. The rate table has no DOX flag, so DOX and Non-DOX are separate product rows. COM is included so a commercial AWB still has a rate.
- Vendor FEDEX, master code FEDE, mapped service FEDEX (0.5–999 kg).
- Compare vendor DHL / DHL EXPRESS (I) PVT LTD, mapped service EXPRESS. Compare rates are Rs 400 and Rs 600 per kg. Those amounts were not specified, so they are marked test data and sit above the FEDEX rates.
- Customer rates from 01-Nov-2026: Rs 500 per kg on zone 1, Rs 700 per kg on zone 2, rate type Per KG, minimum weight 0. The table has no slab-end column. A minimum of 9999 would bill 9999 kg, so the 0–9999 slab is stored as minimum 0.
- FEDEX contracts: Rs 350 and Rs 500 per kg, one Per KG slab whose weight column is 9999.
- Divisors 5000 cm and 305 inch are on ALIASSO customer volumetrics. 305 is the kilogram inch equivalent of 5000 cm (5000 / 2.54³). The earlier 166 figure is the US pounds divisor and was replaced. Vendor contracts have no divisor columns, and the AWB form reads the customer rows. See AWB-53.
- Fuel 10% from 01-Nov-2026, scoped to ALIASSO, plus FEDEX and DHL rows at the same 10%.

Check Rate Combination, signed in, 1.000 kg, product INTL DOX, vendor FEDEX:

| Destination | Contract | Zone | Freight | Fuel 10% | IGST | CGST | SGST | Total |
|---|---|---|---|---|---|---|---|---|
| US / USA | TEST_AWB_DOX_Z1, vendor TEST_AWB_FEDEX_DOX_Z1 | 1 | 500.000 | 50.000 | 0.0000 | 49.5000 | 49.5000 | 649.00 |
| AE / United Arab Emirates | TEST_AWB_DOX_Z2, vendor TEST_AWB_FEDEX_DOX_Z2 | 2 | 700.000 | 70.000 | 0.0000 | 69.3000 | 69.3000 | 908.60 |

Rate Compare for USA at 1.000 kg returned two vendors: FEDEX / FEDEX at Rs 350.00, final Rs 454.30; DHL EXPRESS at Rs 400.00, final Rs 519.20.

Live notes already seen, not a full retest:

- Consignee country starts as India, then becomes United States of America or United Arab Emirates after the destination is selected. It is read-only. A foreign postcode was not typed.
- Consignee Address 1, Pincode, City, and State still have no asterisk. Shipper fields do.
- Fuel label shows 10%. GST for this non-commercial international AWB is CGST + SGST, not IGST, because ALIASSO billing state is Telangana and the rating default branch state is Telangana.
- Lock is enabled for this signed-in admin. Book date 2026-11-09 is editable.

## AWB-01

- Area: Page load
- Check: Signed-in page, console, slow calls
- Status: BLOCKED
- Severity: High
- Evidence: Cursor browser opened /transaction/awb-entry?view=form and painted the form, then redirected to /login. Computer Use is off (Accessibility and Screen Recording). No authenticated console or network trace. Needed: a signed-in session as Karthik Test Admin.

## AWB-02

- Area: Page load
- Check: Sidebar, Head Office, quick action, notifications, user menu
- Status: PARTIAL
- Severity: Low
- Evidence: Pre-redirect snapshot showed Toggle Sidebar, Head Office, search, Quick action, theme, and Notifications. The user control was a Sign in link, not Karthik Test Admin. Notification count was not readable.

## AWB-03

- Area: Page load
- Check: Tabs keep unsaved data
- Status: PARTIAL
- Severity: Low
- Evidence: Tabs AWB, Proforma, Forwarding, KYC, Notification share one form state (setActiveTab). Switching tabs does not warn and does not clear fields. Live click was lost to the login redirect. transaction.awb-entry.tsx:1672, 5050.

## AWB-04

- Area: Page load
- Check: Header info bar updates after save
- Status: FAIL
- Severity: High
- Evidence: GET /api/awb-entry/status returns the login name, podUserId null, manifestNo = count of all tenant manifests, and invoice, flight, and manifest date always empty. It is not the open AWB and does not change after save. src/routes/api/awb-entry.status.ts:34-43.

## AWB-05

- Area: Page load
- Check: 1366px, 1920px, tablet layout
- Status: BLOCKED
- Severity: Medium
- Evidence: Could not hold the page long enough to resize. The form uses responsive grids (xl:grid-cols-3, piece row xl template). Overlap was not observed.

## AWB-06

- Area: AWB header
- Check: Auto AWB unique, sequential, per branch, concurrent
- Status: FAIL
- Severity: Critical
- Evidence: allocate_document_no locks the counter FOR UPDATE (0030_transaction_core.sql:184) and shipments_tenant_awb_uq blocks duplicates. The UI sends branch_id and branch_code as null (shipmentUiMap.ts:235-236). save_shipment then picks the head-office branch (0127_awb_number_claim.sql:149-157). Every new AWB uses the head-office series, not the selected branch.

## AWB-07

- Area: AWB header
- Check: Manual AWB validated on the server
- Status: FAIL
- Severity: High
- Evidence: The client calls validate_manual_awb before save. claim_awb_no keeps any unused typed number and does not check the branch series (0127:32-43). A direct RPC can store an out-of-series AWB. Two users typing the same free number: one insert wins, the other hits the unique index.

## AWB-08

- Area: AWB header
- Check: Book date and time, IST, no future date
- Status: FAIL
- Severity: High
- Evidence: Observed defaults 2026-11-09 and 1313, which matched local afternoon. todayIso uses UTC toISOString().slice(0,10) (line 909), so between 00:00 and 05:30 IST the date is the previous day. nowBookTime uses local hours (line 911). No future-date check. Date and time were read-only because the signed-out user has no modify permission.

## AWB-09

- Area: AWB header
- Check: Reference No. length and characters
- Status: FAIL
- Severity: Medium
- Evidence: The field is a free text input (line 5231). shipmentFieldsSchema caps it at 64 but saveShipment does not parse that schema (shipments.ts:340). The RPC stores the trimmed string with no character check.

## AWB-10

- Area: AWB header
- Check: Client Name required, active only, fills dependents
- Status: PARTIAL
- Severity: Medium
- Evidence: Save rejects an empty client (line 3250). Lookup SQL keeps status = ACTIVE (0114_fix_lookup_product_and_all_keys.sql:108). Client select copies payment type (line 4881). Autocomplete and contract fill were not clicked because the session dropped.

## AWB-11

- Area: Shipper
- Check: Origin, company, address, pincode, city, state required
- Status: PASS
- Severity: —
- Evidence: Snapshot labels carried asterisks. collectAwbProductionErrors requires address 1, pincode, city, and state (lines 1242-1245). Origin and company are required at lines 3252-3254.

## AWB-12

- Area: Shipper
- Check: Pincode fills city, state, country; unknown pin rejected
- Status: PARTIAL
- Severity: Medium
- Evidence: onSelect writes pincode, city, and state only (lines 7965-7970). Country stays the origin country. countryCode is hardcoded IN, including for the consignee. A typed unknown pin is not rejected.

## AWB-13

- Area: Shipper
- Check: Mobile, email, telephone, IEC, document number
- Status: FAIL
- Severity: High
- Evidence: Mobile and email inputs have no format check (lines 8003-8016). Save runs validateAwbEntry, which checks payment, shipper document format for a few exact type names, and that some contact exists. It does not require a 10-digit mobile. IEC is toasted on blur only. Consignee ID checks run on Book, not Save (collectClientBookingErrors line 3593).

## AWB-14

- Area: Shipper
- Check: Max length, spaces, Unicode
- Status: FAIL
- Severity: Medium
- Evidence: Shipper and consignee are stored as an untyped jsonb object (shipmentFieldsSchema shipper: z.record). No max length on address, name, or phone. Leading spaces are not stripped on party fields.

## AWB-15

- Area: Shipper
- Check: Origin is a serviceable location
- Status: PARTIAL
- Severity: Low
- Evidence: Origin must resolve to a destinations row on book (0103_awb_compliance_gates.sql:39-49). There is no separate serviceable-location rule.

## AWB-16

- Area: Consignee
- Check: Address, pincode, city, state not required
- Status: PARTIAL
- Severity: Medium
- Evidence: Snapshot labels: Destination * and Company Name *, Address 1, Pincode, City, and State without asterisks. Save matches that (lines 3255-3266, PartySection addressRequired only on shipper). International AWBs can be saved with no consignee address. Confirm this is intended.

## AWB-17

- Area: Consignee
- Check: Destination drives zone and rate
- Status: PARTIAL
- Severity: Medium
- Evidence: Rating resolves destination code, name, or country (ratingEngine.ts resolveCustomerRate). A missing rate throws NO_RATE_FOUND. Not executed live.

## AWB-18

- Area: Consignee
- Check: International country, IEC, documents
- Status: FAIL
- Severity: High
- Evidence: Consignee country rendered as read-only India. Pincode lookup is forced to IN. IEC and CSB checks run on Book only, and only when Commercial or CSB 5 is set (0103:123-145).

## AWB-19

- Area: Services
- Check: Vendor change clears service and loads mapped services
- Status: PASS
- Severity: —
- Evidence: Vendor onChange sets service to empty (lines 8135-8140). Snapshot showed the helper “Select a Vendor to load mapped services.” and a disabled Service control.

## AWB-20

- Area: Services
- Check: Charge weight = max(actual, volumetric), vendor round-off
- Status: PASS
- Severity: —
- Evidence: calcVolWeight is L×W×H×pieces / division (line 1222). calcChargeWeight takes the max and formatChargeWeight rounds up to 0.500 kg only when the vendor flag is on (awbEntryRules.ts:71-75). Piece lines roll into the service totals (summarizePieceLines, line 1297).

## AWB-21

- Area: Services
- Check: Commercial, ODA, Medical change the charges
- Status: FAIL
- Severity: High
- Evidence: awbGstPercent returns 0 whenever Commercial is checked, including a domestic AWB (awbEntryRules.ts:154-157). The rating engine has no ODA term. Medical is stored as a boolean; the 0.500 kg MEDICINE rule runs only on Book (lines 3547-3551).

## AWB-22

- Area: Services
- Check: Rate Compare and missing contract, zone, or slab
- Status: PARTIAL
- Severity: Medium
- Evidence: Check Rate Combination calls the rating APIs and surfaces NO_RATE_FOUND. Missing-contract, missing-zone, and missing-slab cases were not run against live master data.

## AWB-23

- Area: Services
- Check: Negative, zero, decimal, very large numbers
- Status: PARTIAL
- Severity: Medium
- Evidence: Piece draft fields strip letters. Service Pieces and Actual Weight do not (lines 8221 and 8249). Amount Received does not. The RPC casts client numbers and accepts negatives. Zero weight can be saved as a draft.

## AWB-24

- Area: Pieces
- Check: Alt+U focuses the section
- Status: FAIL
- Severity: High
- Evidence: The trigger says “Press [Alt + u]” (line 5423). The only Alt handler is Alt+` for Auto/Manual (lines 1753-1770). Alt is ignored by the form nav (erp-form-nav-context.tsx:200).

## AWB-25

- Area: Pieces
- Check: Import MTS template, bad files, duplicates, size
- Status: PARTIAL
- Severity: Medium
- Evidence: Download and Upload are wired. Unit tests cover the example row and inch math (awbMtsImport.test.ts). No file-size cap was found, unlike the 5 MB proforma upload. Live download was not completed. Duplicate piece rows are appended, not rejected.

## AWB-26

- Area: Pieces
- Check: Inch versus centimetre
- Status: PARTIAL
- Severity: Medium
- Evidence: resolveDivision uses inch_divisor for Inch and otherwise 5000 (awbEntryRules.ts:43-64). With no vendor inch row, a 10×10×10 inch box is divided by 5000 and becomes 0.200 kg.

## AWB-27

- Area: Pieces
- Check: Volumetric discount
- Status: FAIL
- Severity: Medium
- Evidence: The label is hardcoded “Vol Weight (Discount - 0 %)” (line 5551). No discount is applied.

## AWB-28

- Area: Pieces
- Check: Add, edit, delete, child AWB, empty state, totals
- Status: PARTIAL
- Severity: Medium
- Evidence: Add/Update and pencil/delete exist (editPiecesLine line 4476, empty text “No piece lines added” line 5626). Child numbers are stamped {awb}-n on save if blank (lines 3444-3448). They are not unique in the database. Live add was not clicked.

## AWB-29

- Area: Charges
- Check: Alt+C
- Status: FAIL
- Severity: High
- Evidence: The charge trigger says “Press [Alt + c]” (line 5676). No key handler opens or focuses it.

## AWB-30

- Area: Charges
- Check: Contract, fuel, GST, total by hand
- Status: PARTIAL
- Severity: High
- Evidence: Rating math is deterministic (see worked examples). Manual lines use a different intra-state test than the rating engine. Draft save stores the client totals. Server rating runs only inside confirm_booking (0127:421).

## AWB-31

- Area: Charges
- Check: IGST versus CGST+SGST
- Status: FAIL
- Severity: High
- Evidence: Rating compares customer billing state with branch state and defaults a blank state to TELANGANA (ratingEngine.ts:405-407). Charge lines use shipper state versus consignee state, and a blank side is treated as intra-state (awbEntryRules.ts:160-165). The two sections can show different tax splits for the same AWB.

## AWB-32

- Area: Charges
- Check: Fuel % and Tax On Fuel
- Status: PASS
- Severity: —
- Evidence: fuelPercentFor picks the most specific vendor/product/destination row (awbEntryRules.ts:78-101). manualChargeAmounts adds fuel and optionally taxes the fuel (lines 113-138).

## AWB-33

- Area: Charges
- Check: Add, edit, delete a charge line
- Status: PARTIAL
- Severity: Medium
- Evidence: Add requires description and amount. The grid has Delete only (line 5941). There is no edit action. Totals are a client sum of the line fields.

## AWB-34

- Area: Charges
- Check: Both Check Rate Combination actions match
- Status: PASS
- Severity: —
- Evidence: The services link and the charge-section button both call handleCheckRateCombination. Not clicked live.

## AWB-35

- Area: Shipment
- Check: Payment type changes required cash fields
- Status: FAIL
- Severity: Medium
- Evidence: Payment type itself is required (“Payment type cant be empty..!!”). Cash Receipt No., Amount Received, and Cash Receipt Date stay optional for every payment type (ShipmentDetailsFields, line 8404).

## AWB-36

- Area: Shipment
- Check: Field Executive lists active staff
- Status: PASS
- Severity: —
- Evidence: field_executives lookup requires status = ACTIVE (0114:141). Popup not opened live.

## AWB-37

- Area: Shipment
- Check: Balance = total − received, never negative
- Status: FAIL
- Severity: Medium
- Evidence: balanceDue returns (gross − paid).toFixed(2) with no floor (awbEntryRules.ts:141-144). Amount Received is not limited to the total.

## AWB-38

- Area: Shipment
- Check: Expected delivery versus TAT and book date
- Status: FAIL
- Severity: Medium
- Evidence: The date is free text stored in wizard_extras.expectedDeliveryDate (shipmentUiMap.ts:278). No TAT lookup and no check that it is on or after the book date.

## AWB-39

- Area: Actions
- Check: Lock and unlock, UI and API
- Status: FAIL
- Severity: Critical
- Evidence: The checkbox is disabled without modify permission (line 5975). save_shipment rejects the whole update when is_locked is already true, before it can write is_locked false (0127:285-287). A locked AWB cannot be unlocked through this API. The UI copy says modify permission is enough to unlock. That is wrong.

## AWB-40

- Area: Actions
- Check: Save validates, persists, and ignores a double click
- Status: FAIL
- Severity: Critical
- Evidence: Save does not require piece lines, a real email, or a 10-digit mobile. setSaving(true) is after the manual-AWB await (line 3287 then 3300), and there is no in-flight ref, so a double click can create two drafts. Network failure shows toast.error. Party and money fields are not rechecked in SQL on save.

## AWB-41

- Area: Actions
- Check: Next saves or warns, then opens a fresh form
- Status: FAIL
- Severity: High
- Evidence: Next calls goNextTab, which only moves to the next tab (lines 2120-2122). It does not save and does not open a blank AWB.

## AWB-42

- Area: Actions
- Check: Cancel confirms before discard
- Status: PASS
- Severity: —
- Evidence: Cancel calls requestCloseForm (line 6124). A draft worth keeping opens “Any unsaved changes will be discarded.” (line 7706). A read-only or empty form closes without the prompt.

## AWB-43

- Area: Actions
- Check: Reopen loads pieces, charges, and header fields
- Status: PARTIAL
- Severity: Medium
- Evidence: shipmentToUi maps pieces, charges, cash receipt, and expected delivery. KYC rows in wizard_extras have names only. Not reopened in the browser.

## AWB-44

- Area: Cross-cutting
- Check: Keyboard tab order and shortcuts
- Status: PARTIAL
- Severity: Medium
- Evidence: Fields carry AWB_NAV order and Enter/Tab advance. Alt+U, Alt+C, and Alt+W are advertised and not implemented. Esc behaviour was not exercised.

## AWB-45

- Area: Cross-cutting
- Check: Labels, focus, errors, contrast
- Status: PARTIAL
- Severity: Low
- Evidence: Required labels are exposed to the accessibility tree. Errors are toasts and one modal, not aria-live on the field. Contrast was not measured.

## AWB-46

- Area: Cross-cutting
- Check: Server validation, permissions, tenant isolation, XSS, auth
- Status: FAIL
- Severity: Critical
- Evidence: save_shipment checks txn.awb-entry add/modify and the tenant. It does not validate party formats, weights, GST, or the branch. Booking checks customer, origin, destination, product, pieces, IEC, and CSB (0103). React text nodes avoid HTML injection. Status and proforma APIs use requireApiAuth. Unauthenticated use of the form is possible until the client redirects.

## AWB-47

- Area: Cross-cutting
- Check: Audit trail
- Status: PASS
- Severity: —
- Evidence: Insert sets created_by and updated_by to auth.uid(). write_audit_log records ADD (0127:268-270). Updates write an UPDATED shipment event. The audit payload is only awb number and status, not a field diff.

## AWB-48

- Area: Cross-cutting
- Check: Lookup speed and 100 piece lines
- Status: PARTIAL
- Severity: Low
- Evidence: Lookups cache for 5 minutes and limit results to 50. No test or UI cap for 100 piece lines. A large grid will render every row.

## AWB-49

- Area: Cross-cutting
- Check: API failures are visible
- Status: PASS
- Severity: —
- Evidence: Save, book, search, and rating catch errors and toast them. Carrier document save failures are only console.warn (line 3422), so that one path is quiet.

## AWB-50

- Area: Cross-cutting
- Check: Server recalculates totals
- Status: FAIL
- Severity: Critical
- Evidence: Draft save writes client actual_weight, vol_weight, charge_weight, charge totals, and balance_amount (0127:309-320). confirm_booking calls app.run_shipment_rating (0127:421). A draft can store numbers the screen did not calculate.

## AWB-51

- Area: Cross-cutting
- Check: KYC file bytes
- Status: FAIL
- Severity: Critical
- Evidence: addKycDocument stores id, fileName, entryType, and entryDate only (lines 4812-4819). The file bytes are discarded. Reopening cannot download the document.

## AWB-52

- Area: Cross-cutting
- Check: Tests and hardcoded values
- Status: PARTIAL
- Severity: Medium
- Evidence: Rating, vendor tariff, proforma, and MTS have unit tests. There is no end-to-end AWB test. GST 18, division 5000, and TELANGANA are hardcoded fallbacks. Document-format messages still carry TODOs (awbValidations.ts:24).

## AWB-53

- Area: Rating
- Check: Vendor volumetric divisor
- Status: FAIL
- Severity: High
- Evidence: `vendor_contracts` (supabase/migrations/0028_vendor_contract_aggregate.sql) has no cm or inch divisor columns. The AWB form and the vendor-rate API calculate the vendor's volumetric weight with the customer's divisor (`resolveDivision` in awbEntryRules.ts, and the division sent on the rate request). Seeded contracts TEST_AWB_FEDEX_* and TEST_AWB_DHL_* cannot store their own divisor. Live: the UAE shipment's charge weight was 6.500 kg and the FEDEX vendor cost used that same weight (6.500 × 500). The inch shipment stored divisor 305 and the vendor cost used that too. A vendor with a different factor would be costed wrong. Source: code, schema, and live.

## Live cases A–F, 9 Nov 2026

Origin HYD, client ALIASSO, vendor FEDEX, service FEDEX. The form has no Book button (`handleBook` is never rendered). Booking below was the signed-in `confirm_booking` call, which is the server path that button would use. No application code was changed. Cleanup was not run. These AWBs are still in the database:

| Case | AWB | Reference | What was booked | Draft screen | Database after save | After confirm_booking |
|---|---|---|---|---|---|---|
| A | 000028 | TEST_AWB_A | DOX, 0.500 kg, USA, cash, received 324.50 | Freight 250, fuel 25, CGST 24.75, SGST 24.75, total 324.50, balance 0. Branch on screen is Head Office. AWB field stayed blank until reopen. | HO, status DRAFT, weights 0.500 / 0 / 0.500, total 324.50, balance 0, GST as on screen, locked false | BOOKED. Freight 250, fuel 25, tax 0, grand 275, vendor 175. Balance left at 0. Received still 324.50. |
| B | 000029 | TEST_AWB_B | NDOX, 3 cm pieces, UAE, no consignee address | Actual 2.500, vol 6.200, charge 6.500. Lines 1.200, 4.800, and 0.500. Freight 4550, fuel 455, CGST/SGST 450.45, total 5905.90. Header pieces stayed 1. Child AWB blank. | HO, pieces column 1, pieces_unit DOX, three piece rows, divisor 5000, same weights and GST, consignee address empty | BOOKED. Charge weight kept 6.500. Customer freight 4550, fuel 455, tax 0, grand 5005. Vendor 3250 with no fuel. Balance left at 5905.90. |
| C | 000030 | TEST_AWB_C | NDOX, 12×12×12 inch, 1 kg, USA | Unit Inch, divisor 305, vol and charge 5.666. Freight shown 2832.787 (1728/305 unrounded), fuel 283.279, GST 280.4459 each, total 3676.96. | Divisor 305, vol and charge stored 5.666, freight stored 2832.79, total 3676.96 | BOOKED. Uses stored 5.666 × 500 = 2833, fuel 283.30, tax 0, grand 3116.30. Vendor 1983.10. Balance left at 3676.96. |
| D | 000031 | TEST_AWB_D | Commercial, 1 kg, USA, IEC, CSB 5 | Commercial on, GST 0, total 550. Save succeeded with no IEC, then with IEC `BAD-IEC`. CSB 5 without Ad Code was rejected on Save. | commercial true, IEC `ABCDE12345` stored as `shipper.iec_no`, CSB 5, reason SALE, Ad Code ADCODE01, total 550 | Booking rejected. The checker reads `shipper.iecNo`, so it does not see `iec_no`. Still DRAFT. |
| E | 000032 | TEST_AWB_E | DOX, 0.500 kg, USA, payment Credit, received 100 | Total 324.50, balance 224.50. Cash receipt fields stayed visible. ALIASSO has no credit limit and the save was accepted. | HO, payment Credit, received 100, balance 224.50, total 324.50, consignee address empty, country United States of America. Not booked. | — |
| F | 000033 and 000034 | TEST_AWB_F | Break tests | One double-click on Save created both AWBs. Mobile `12` and email `not-an-email` were saved. Typing `-5` became `5`. A 5000 kg piece was rated at 32,45,000 even though the FEDEX service maximum is 999 kg. | 000033: weight 0.500 but total 3245000, unlocked. 000034: weight 0.500, total corrected to 324.50 on a later update, then `is_locked` true. | Unlock update returned "Shipment is locked". The checkbox on screen went back to unchecked. |

Consignee country became United States of America or United Arab Emirates after the destination was chosen, and stayed read-only. Postcode 10001 was saved as typed. KYC file `kyc-audit.txt` showed "KYC document added"; Update was then rejected because 000034 was locked, so the file was not reopened from the database. The save path still stores only the file name.

`/api/shipments/rate` on case A took 1496 ms to 2023 ms. `/api/shipments/vendor-rate` returned 422 three times before the service was selected, with no toast, then one 1058 ms success. No `console.error` was captured on the hooked session.

## Live status, 9 Nov 2026

Original evidence is unchanged. Domestic lanes stay out of scope.

| ID | Live mark | What the live pass showed |
|---|---|---|
| AWB-01 | Confirmed | Signed in as Karthik Test Admin. Rate calls are over 1 second. See AWB-59. |
| AWB-02 | Not a problem | Head Office, Karthik Test Admin, and the notification badge rendered. |
| AWB-03 | Not a problem | AWB, Proforma, Forwarding, KYC, and Notification keep one shipment. |
| AWB-04 | Confirmed | Save said "AWB 000028 saved" while the AWB field was still blank. Reopen showed 000028. |
| AWB-05 | Not retested | No 1366, 1920, or tablet pass. |
| AWB-06 | Confirmed | 000028–000034 are all branch HO. The form sends no branch and save picks Head Office. |
| AWB-07 | Not retested | AUTO was used. Manual series was not entered. |
| AWB-08 | Confirmed | Book date 2026-11-09 and the time were editable for this admin. A future date was not entered. |
| AWB-09 | Not retested | No over-long reference was entered. |
| AWB-10 | Confirmed | ALIASSO filled company, mobile, and email. Payment became Cash although the master payment type is empty. |
| AWB-11 | Not a problem | Save refused an empty shipper address and an empty pincode. |
| AWB-12 | Confirmed | Country follows the destination. Zip 10001 was stored as typed. The lookup is still India-only. |
| AWB-13 | Confirmed | Mobile `12`, email `not-an-email`, and IEC `BAD-IEC` all saved. |
| AWB-14 | Not retested | No over-long name or address was entered. |
| AWB-15 | Not retested | HYD was accepted. No unserviceable origin was tried. |
| AWB-16 | Confirmed | Consignee address, city, state, and postcode are not required. Empty values saved on B, D, E, and F. |
| AWB-17 | Confirmed | USA used zone 1 at 500 per kg. UAE used zone 2 at 700 per kg. |
| AWB-18 | Confirmed | Country updates and is read-only. IEC is not checked on Save. Book cannot see a valid IEC. See AWB-55. |
| AWB-19 | Not a problem | Service stayed disabled until FEDEX was chosen, then FEDEX - FEDEX was selected. |
| AWB-20 | Not a problem | 0.500 kg actual became charge weight 0.500. The inch case is AWB-26. |
| AWB-21 | Confirmed | Commercial forced GST to 0 and total 550. CSB 5 without Ad Code was blocked on Save. ODA and Medical were not toggled. |
| AWB-22 | Not retested | The earlier USA compare still stands. A missing-slab vendor was not run. |
| AWB-23 | Confirmed | The minus sign is stripped. 5000 kg was rated past the 999 kg FEDEX maximum, and 000033 kept that money against 0.500 kg. |
| AWB-24 | Not retested | The pieces panel was already open. Alt+U was not pressed. |
| AWB-25 | Not retested | The piece-import Upload button was not used. |
| AWB-26 | Confirmed | Inch divisor 305. 12×12×12 shows 5.666, but the freight used the unrounded 1728/305. Booking then used 5.666. |
| AWB-27 | Confirmed | The label is still "Vol Weight (Discount - 0 %)". |
| AWB-28 | Confirmed | Three piece lines saved. Header pieces stayed 1. No child AWB. See AWB-58. |
| AWB-29 | Not retested | The charge panel was already open. Alt+C was not pressed. |
| AWB-30 | Confirmed | 0.500 kg and the three centimetre pieces matched the hand total. The inch line did not, because of rounding. |
| AWB-31 | Confirmed | Non-commercial USA and UAE showed CGST + SGST, not IGST. Booking then wrote tax 0. See AWB-56. |
| AWB-32 | Not a problem | Fuel was 10% on every rated shipment. |
| AWB-33 | Not retested | The system freight line appeared. A manual charge was not added. |
| AWB-34 | Not a problem | Check Rate Combination priced USA and UAE. |
| AWB-35 | Confirmed | Cash receipt fields stayed on screen when payment was Credit. |
| AWB-36 | Not retested | No field executive was chosen. |
| AWB-37 | Confirmed | Empty receipt leaves the full total as the balance. Credit 100 of 324.50 left 224.50. Booking does not recalculate the balance. |
| AWB-38 | Confirmed | Expected delivery stayed empty on the saved AWBs. |
| AWB-39 | Confirmed | Lock saved `is_locked` true on 000034. A later update to clear it returned "Shipment is locked". The checkbox on screen was then unchecked. |
| AWB-40 | Confirmed | One double-click created 000033 and 000034. Save accepted the bad mobile and email. |
| AWB-41 | Confirmed | Next moved from KYC to Notification. It did not save and did not open a blank form. |
| AWB-42 | Not retested | Cancel was not pressed. |
| AWB-43 | Confirmed | Reopening 000028 showed the charge grid at 275 and the summary boxes still at 324.50. |
| AWB-44 | Not retested | Shortcuts were not pressed. |
| AWB-45 | Not retested | No accessibility pass. |
| AWB-46 | Confirmed | Draft save trusts the browser. Book checks IEC, then misses the stored value. |
| AWB-47 | Not retested | Audit rows were not read. |
| AWB-48 | Confirmed | Lookups were usable. The rate API is the slow call. See AWB-59. |
| AWB-49 | Confirmed | Success toasts showed. Three vendor-rate 422 responses did not. |
| AWB-50 | Confirmed | Draft totals are the browser totals. 000033 stored 32,45,000 against 0.500 kg. Booking replaces the figures. |
| AWB-51 | Confirmed | The KYC name was added on screen. Bytes are still not part of the save payload, and the locked update never stored the name. |
| AWB-52 | Confirmed | No end-to-end AWB test was added. GST 18 and TELANGANA are still hardcoded. |
| AWB-53 | New, confirmed | Vendor cost uses the customer divisor. |

## AWB-54

- Area: Booking
- Check: Book control
- Status: FAIL
- Severity: Critical
- Evidence: The footer is Previous, Save or Update, Next, and Cancel. `handleBook` in transaction.awb-entry.tsx is never passed to a button. A user cannot book from the screen. The server `confirm_booking` path works when called directly, and cases A–C reached BOOKED that way. Source: live screen and code.

## AWB-55

- Area: Booking
- Check: IEC is visible to booking
- Status: FAIL
- Severity: Critical
- Evidence: Save writes `shipper.iec_no` (shipmentUiMap.ts). `app.validate_shipment_for_booking` reads `shipper.iecNo` (0103_awb_compliance_gates.sql). AWB 000031 stored IEC ABCDE12345, CSB 5, and commercial true. Booking still returned "Valid 10-character alphanumeric IEC is required". A valid commercial shipment cannot be booked. Source: live database and the booking error.

## AWB-56

- Area: Rating
- Check: Booking rating against the screen
- Status: FAIL
- Severity: Critical
- Evidence: `tax_rates` has no rows, so `app.resolve_tax_pcts` returns 0. The form hardcodes 18% and, for this Telangana customer, splits it into CGST and SGST. After booking, 000028 went from screen total 324.50 to grand total 275 and tax 0, while amount received stayed 324.50 and balance stayed 0. Vendor fuel is also dropped: the UAE vendor total went from 4218.50 on screen to 3250 in the database. The charge grid after reopen shows the server total and the summary boxes can keep the old one. Source: live database and 0041_rating_engine.sql.

## AWB-57

- Area: Client
- Check: Profile load and typed address
- Status: FAIL
- Severity: High
- Evidence: `handleClientSelect` spreads the loaded shipper over the current shipper when the profile returns. On cases C and E the address was typed, then found empty when Save ran, and Save said "Shipper Address 1 is required" or "Shipper Pincode is required". ALIASSO has no stored address, so the late response clears what the user typed. Source: live save errors and transaction.awb-entry.tsx.

## AWB-58

- Area: Pieces
- Check: Piece count, unit, and child AWB
- Status: FAIL
- Severity: High
- Evidence: Three piece lines saved on 000029, but `shipments.pieces` is 1 and `pieces_unit` is DOX. The product was NDOX. Commercial 000031 is also pieces_unit DOX. Every child AWB is null. The header piece count is not the sum of the lines. Source: live database.

## AWB-59

- Area: Performance
- Check: Rate calls over 1 second
- Status: FAIL
- Severity: High
- Evidence: On case A, `/api/shipments/rate` returned 200 in 1496, 1558, 1577, 1583, 2008, 2019, and 2023 ms. `/api/shipments/vendor-rate` returned 422 three times with no toast, then 200 in 1058 ms. Source: live network times.

## Fix batches

The original AWB-01 to AWB-52 write-ups above are unchanged. This section is the live status after Batches 1 and 2.

Batch 1 is done on screen. Booked AWBs 000035–000041 stay. Save books in one transaction. Screen, database, and invoice use the same money. Head Office and HYD are stored as state code TS. Cleanup has not been run.

Batch 2 is done. Live booking 000042, reference TEST_AWB_H2, ALIASSO (Telangana), USA, INTL DOX, FEDEX, 0.5 kg, Cash, receipt CR-H2, field executive AKHIL CW.

Manual charge HANDLING CHARGES Rs 10, fuel Yes, tax Yes, tax on fuel No. The server kept the line and calculated fuel and GST itself:

| Line | Amount | Fuel | IGST | CGST | SGST | Total | Type |
|---|---|---|---|---|---|---|---|
| Freight | 250.00 | 25.00 | 0.00 | 24.75 | 24.75 | 324.50 | SYSTEM |
| HANDLING CHARGES | 10.00 | 1.00 | 0.00 | 0.90 | 0.90 | 12.80 | MANUAL |
| Header / invoice |  | 26.00 | 0.00 | 25.65 | 25.65 | 337.30 |  |

Amount received 337.30, balance 0.00. The invoice iframe matches those header figures. The vendor freight line is unchanged: 175.00, fuel 17.50, CGST 17.33, SGST 17.32, total 227.15.

Field executive list comes from the database. An empty search with origin HYD shows the 8 active executives. Reopening 000042 shows AKHIL CW and code AKHIL.

Manual AWB numbers were first checked as option (b): digits only, 6 characters, inside the branch MANUAL series 500001–899999, and unused. Migration 0145 then applied option (a). AUTO is 100001–499999 and MANUAL stays 500001–899999. The two ranges cannot overlap. The screen accepts digits only. Leaving the field on 000043 showed "Manual AWB 000043 is outside this branch series 500001 to 899999". That attempt was discarded and inserted no row. The server rejects letters and rejects 000042 as a manual number. A later AUTO booking used 000043 for TEST_AWB_I2.

Length limits are on the screen and in `app.awb_field_errors`: reference 30, names 100, address lines 100, city and state 50, phone 15, email 100, IEC 10.

After Save, the status strip shows AWB No 000042, Status BOOKED, AWB UserID KKARTHIK. Next saves, toasts "AWB {number} booked", and opens a blank form. Next on 000042 updated that same row. The database still has one TEST_AWB_H2 shipment, grand total 337.30.

Customer rate cards and vendor tariffs are cached for 60 seconds. A failed rate call shows an error toast.

Batch 3 rules are in the screen checks and in `app.awb_field_errors`, which runs inside `book_awb_shipment` before anything is written. Migration `0144_awb_manual_charges_and_limits.sql`.

- AWB-09 and AWB-14: the length limits above.
- AWB-13: an India shipper mobile, when filled, must be 10 digits. Email must be a valid address. IEC, when filled, must be 10 letters or numbers. A foreign consignee phone stays up to 15 characters.
- AWB-27: the piece label later became "Vol Weight". Piece weights are not changed.
- AWB-35: Cash requires a receipt number, an amount received above 0, and a receipt date.
- AWB-37: amount received cannot be more than the total.
- AWB-38: expected delivery cannot be before the book date. No transit-time table is used.
- AWB-49: a failed customer or vendor rate call shows the error.

Batch 3 was blocked on the live form before any AWB was written. The only shipment after 000042 is the later AUTO booking 000043. Each message sat next to the field, the field was focused, and the field was marked invalid.

| Case | Value | Message | AWB created |
|---|---|---|---|
| Mobile | 12 | Shipper mobile must be 10 digits | No |
| Email | abc | Shipper email is not a valid email address | No |
| IEC | BAD | Shipper IEC must be 10 letters or numbers | No |
| Cash, no receipt | receipt empty, amount 100.00, date 2026-11-09 | Cash Receipt No. is required for a cash payment | No |
| Amount above the total | 100.00 while the total was 0.00 | Amount received cannot be more than the total | No |
| Delivery before the book date | 2026-11-08, book date 2026-11-09 | Expected delivery date cannot be before the book date | No |

Tax On Fuel on a new manual charge line now defaults to Yes. The Yes/No control stays on the form. At this point in the pass the stored freight line still had `tax_on_fuel` false, while GST on freight already included the fuel. Migration 0145 sets freight `tax_on_fuel` true so the flag matches the charge. 000042 HANDLING stays false because that line was entered as No. The piece label is now "Vol Weight". The "(Discount - 0 %)" text is gone.

### AWB number series

500001–899999 is not test data from this audit. Migration `0102_awb_stock_allotment_and_gating.sql` seeds a MANUAL allotment for every branch: prefix `M` plus the branch code, start 500001, end 899999, status ACTIVE. The same migration seeds an AUTO allotment 100001–999999.

Before migration 0145, the live Head Office rows were AUTO prefix HO, 100001–999999, and MANUAL prefix MHO, 500001–899999. An empty claim called `app.allocate_document_no`, which reads `sequence_counters` for doc type AWB and formats a 6-digit number with an empty prefix. Before 000043 the counter's next number was 43, so the next AUTO number was 000043. 0145 stops that. AUTO now comes from the allotment, clipped to 100001–499999, and the next AUTO number is 100001.

A manual number must be digits only, 6 characters, inside that branch's ACTIVE MANUAL series, and unused. 000043 and 500001 do not overlap today. They could have overlapped later, because an empty claim used `allocate_document_no` and that counter does not skip 500001–899999. Migration 0145 replaces that path. The current rule is in the recheck below.

Batch 4 was checked on the same form, then on booking 000043.

- Validation errors render under the field with a red border, `role="alert"`, `aria-invalid`, and `aria-describedby`. Save moves the cursor to the first error.
- Alt+U focuses Actl Weight/PCS. Alt+C focuses the customer charge description. Alt+W focuses the vendor charge description. Alt+E opens Customer Details. Alt+` switches AUTO to MANUAL and back. Enter on Reference No. moves to Client Name. Escape closed Customer Details and the destination lookup.
- Import MTS of one CSV row, unit C, 0.005 kg, 120 pieces, dimensions 0, added 120 piece lines. Actual weight 0.600 kg. Charge weight rounded once to 1.000 kg. Freight 500.00, fuel 50.00, CGST 49.50, SGST 49.50, IGST 0.00, total 649.00. The piece table scrolls. No console error was recorded. The browser resource log had no call over 1 second. Cross-origin Supabase timings are not exposed in that log. The Pieces box stays at 1 until it is typed. It was set to 120 before Save, and the database stored 120.
- Full flow on 000043, reference TEST_AWB_I2, ALIASSO, USA, INTL DOX, FEDEX, Cash, receipt CR-I2. Save booked it. Lock showed "Locked by Karthik Test Admin on 09 Nov 2026, 23:26". Unlock cleared `locked_by` and `locked_at` and toasted "AWB 000043 unlocked". Instruction was changed to "Edited after unlock" and saved. Row version is 21. Money was unchanged. The invoice iframe matches the screen and the database.

| | Freight | Fuel | IGST | CGST | SGST | Total | Received | Balance |
|---|---|---|---|---|---|---|---|---|
| Screen, database, invoice | 500.00 | 50.00 | 0.00 | 49.50 | 49.50 | 649.00 | 649.00 | 0.00 |

Customer freight is SYSTEM, `tax_on_fuel` false, total 649.00. Vendor freight is 350.00, fuel 35.00, CGST 34.65, SGST 34.65, total 454.30. Piece rows: 120. Charge weight: 1.000 kg.

## Recheck before Ready, 9 Nov 2026

These seven points were checked again on AWB 000043. The original finding text above is unchanged.

1. Branch. 000043 stores branch HO (`b69b8007-dd55-4808-a8b1-afb91a9a46a4`). That is this user's Head Office, and it is the branch the server used for the GST split. The earlier gap was that the form could send a null branch and the server filled the home branch. Save now sends the active branch, or the home branch when no active branch is set.
2. KYC. The file `kyc-000043.txt` is stored on the shipment as a user upload. After the form was closed and 000043 was opened again, Download returned the same 80 bytes: `ABCDEFGHIJKLMNOPQRSTUVWXYZ` repeated. The booking total stayed 649.00 and the piece count stayed 120.
3. Vendor divisor. The FEDEX test contract `TEST_AWB_FEDEX_DOX_Z1` stores cm divisor 5000 and inch divisor 305. `app.vendor_chargeable_weight` reads those columns. 000043's booked pieces have no dimensions, so the vendor weight is the rounded actual weight, 1.000 kg. A 20×20×20 inch cube on one piece, calculated and then rolled back, returned 27.000 kg. That is 8,000 / 305, plus the other 119 pieces, rounded up to the next 0.5 kg. The same cube at 5,000 would be about 2.500 kg, and at 166 would be about 49.000 kg. The booked row was not changed.
4. Permissions. `book_awb_shipment` requires `txn.awb-entry` add or modify. `lookup_field_executives` requires `txn.awb-entry` list or search. The full suite is 427 tests, 427 passed.
5. Numbering. AUTO is 100001–499999 per branch, taken from the AUTO allotment. MANUAL is 500001–899999. The server rejects a number that falls in the other series, and it rejects an allotment whose ranges overlap. A rolled-back claim returned auto 100001 and accepted manual 500001. Manual 100001 and 499999 were rejected. AWBs 000028–000043 stay as they are. They are below 100001, so the new series does not reuse them and the next AUTO number is 100001.
6. Pieces. After a piece line is added, the Pieces box is the total of the lines. On 000043 it moved from 120 to 124 when lines were added, and that edit was discarded. The saved shipment is still 120 pieces.
7. Freight `tax_on_fuel` is true on 000043 for customer Freight and Vendor Freight. The amounts are unchanged: customer 649.00, vendor 454.30.
8. Cancel and screen size were listed open because the last write-up had not repeated them. Cancel was already a pass in the original finding. Pressing it on a dirty form opened "Any unsaved changes will be discarded." Discard returned to the list. The AWB tab has no horizontal page overflow at 1366, 768, or 1920, and Update, Next, and Cancel sit inside each width.

The cleanup script has not been run.

## Final status, 9 Nov 2026

Original evidence above is unchanged. This is the status after the recheck.

| ID | Final status | Note |
|---|---|---|
| AWB-01 | Partial | A cold rate call was over 1 second on case A. Booking 000043 had no console error and no browser resource over 1 second. Rate cards are cached for 60 seconds. |
| AWB-02 | Closed | Head Office, the user chip, and notifications render. |
| AWB-03 | Closed | The shipment tabs keep one shipment. |
| AWB-04 | Fixed | The status strip shows the booked number. 000043 shows AWB No 000043 and Status BOOKED. |
| AWB-05 | Fixed | 1366, 768, and 1920 were checked on the open AWB tab. No horizontal page overflow. The footer buttons sit inside each width. |
| AWB-06 | Fixed | 000043 is stored on branch HO. Save sends the active branch, or the home branch when none is selected. |
| AWB-07 | Fixed | AUTO is 100001–499999 from the branch allotment. MANUAL is 500001–899999. The server rejects an overlap. 000028–000043 stay below the new series. |
| AWB-08 | Partial | Book date 2026-11-09 saved. A future book date was not entered again. |
| AWB-09 | Fixed | Reference length is limited on the screen and in `app.awb_field_errors`. |
| AWB-10 | Open | ALIASSO still loads payment type Cash when the customer master payment type is empty. |
| AWB-11 | Closed | An empty shipper address or pincode is refused. |
| AWB-12 | Fixed | Country follows the destination. A foreign postcode is stored as typed. |
| AWB-13 | Fixed | Mobile 12, email abc, and IEC BAD were blocked on the live form. No AWB was created. |
| AWB-14 | Fixed | Name and address lengths are limited on the screen and in `app.awb_field_errors`. |
| AWB-15 | Open | An unserviceable origin was not tried. |
| AWB-16 | Fixed | Consignee company, address 1, city, postcode, country, and phone are required. State and email stay optional. |
| AWB-17 | Closed | USA is zone 1 at 500 per kg. UAE is zone 2 at 700 per kg on the test cards. |
| AWB-18 | Fixed | IEC BAD was blocked before Save. |
| AWB-19 | Closed | Service stays disabled until a vendor is chosen. |
| AWB-20 | Fixed | Piece charge weights are summed, then rounded once to the next 0.5 kg. 0.600 kg became 1.000 kg on 000043. |
| AWB-21 | Partial | Commercial is no longer forced to 0% GST. The 18% row is waiting on the CA. CSB without Ad Code was not retried. |
| AWB-22 | Partial | The earlier USA rate compare still stands. A vendor with no slab was not run. |
| AWB-23 | Fixed | 5000 kg was rejected against the FEDEX maximum. The minus sign is stripped. |
| AWB-24 | Fixed | Alt+U opens pieces and focuses Actl Weight/PCS. |
| AWB-25 | Fixed | Import MTS added 120 piece lines. Totals matched 1.000 kg. |
| AWB-26 | Fixed | The inch divisor is 305. Charge weight rounds once on the shipment total. |
| AWB-27 | Fixed | The label is "Vol Weight". The discount text is removed. |
| AWB-28 | Fixed | Adding piece lines sets the Pieces box to the total. On 000043 the box moved from 120 to 124, then the edit was discarded. The saved shipment is still 120 pieces and child AWBs 000043-1 onward. |
| AWB-29 | Fixed | Alt+C opens charges and focuses the description. |
| AWB-30 | Fixed | Screen, database, and invoice use the same money on 000043. |
| AWB-31 | Fixed | GST is totalled, rounded to 2 decimals, then split. 000043 is CGST 49.50 and SGST 49.50. 000041 is the IGST case. The rate is waiting on the CA. |
| AWB-32 | Closed | Fuel is 10% on the test rows. |
| AWB-33 | Fixed | Manual charges are priced on the server. A new manual line defaults Tax On Fuel to Yes. |
| AWB-34 | Closed | Check Rate Combination priced USA and UAE. |
| AWB-35 | Fixed | Cash with no receipt number was blocked. |
| AWB-36 | Fixed | Field executive search and save were confirmed on 000042. |
| AWB-37 | Fixed | Amount received above the total was blocked. |
| AWB-38 | Fixed | Expected delivery before the book date was blocked. |
| AWB-39 | Fixed | 000043 locked with who and when, then unlock cleared `locked_by` and `locked_at`. |
| AWB-40 | Fixed | One Save creates one AWB. Invalid mobile, email, and IEC are blocked. |
| AWB-41 | Fixed | Next saves, shows the AWB number, and opens a blank form. Confirmed on 000042. |
| AWB-42 | Closed | Cancel on a dirty form asks before discard. Discard closed 000043 without deleting it. The original finding was already a pass. |
| AWB-43 | Fixed | Reopen does not change the booked money. |
| AWB-44 | Fixed | Alt+U, Alt+C, Alt+W, Alt+E, and Alt+` work. Enter follows the field order. Escape closes the lookup and Customer Details. |
| AWB-45 | Partial | Error fields expose a label, a red border, `aria-invalid`, `aria-describedby`, and `role="alert"`. A screen reader was not run. |
| AWB-46 | Fixed | The server recalculates and ignores the browser totals. |
| AWB-47 | Partial | Lock and unlock write an audit row. Those rows were not re-read on 000043. |
| AWB-48 | Partial | 120 piece lines stayed usable and the totals were correct. No console error. No browser resource over 1 second on this booking. |
| AWB-49 | Fixed | A failed customer or vendor rate call shows an error toast. |
| AWB-50 | Fixed | 000043 screen, database, and invoice match. |
| AWB-51 | Fixed | `kyc-000043.txt` was saved, reopened, and downloaded. The downloaded file is the same 80 bytes. |
| AWB-52 | Fixed | Booking, rating, and field-rule tests exist. GST comes from the tax table. |
| AWB-53 | Fixed | The FEDEX contract stores cm 5000 and inch 305. Vendor weight on 000043 uses that contract. A rolled-back 20 inch cube came back at 27.000 kg. |
| AWB-54 | Fixed | Save books in one transaction. There is no separate Book button, by decision. |
| AWB-55 | Fixed | IEC is checked before the booking is written. |
| AWB-56 | Fixed | Booked money matches the screen. 000043 total is 649.00 in the database and on the invoice. |
| AWB-57 | Fixed | The typed shipper address on 000043 stayed "12 Test Road". The late profile wipe was not seen. |
| AWB-58 | Fixed | Same as AWB-28. Child AWBs are written, and the Pieces box follows the lines. |
| AWB-59 | Partial | Same as AWB-01. Cold rate calls can still exceed 1 second. This booking did not. |

## Go-live checklist

Verdict: Not production ready.

The booking code for this recheck is in place, and all 427 tests passed. It is not ready for live customers until the real cards are loaded and the test data is removed. The cleanup script has not been run.

- Replace the TEST_AWB_ rate cards, vendor contracts, zone mappings, and fuel percent with the real ones.
- Confirm each client's billing state. ALIASSO is Telangana. OSMO is Karnataka for the IGST booking 000041. A blank billing state must keep blocking the save.
- Confirm GST with the CA. The loaded row is IGST 18, CGST 9, SGST 9, from 1 Apr 2026. International shipments use it for every product when the customer is in India.
- Confirm tax on fuel with the CA. Freight now stores `tax_on_fuel` true, and the GST on freight includes the fuel. 000043 customer freight and vendor freight are both true. The amounts are still 649.00 and 454.30.
- AUTO numbers are 100001–499999 per branch. MANUAL numbers are 500001–899999. The server rejects an overlap. Existing AWBs 000028–000043 stay until cleanup. The next AUTO number is 100001.
- `book_awb_shipment` requires AWB Entry add or modify. `lookup_field_executives` requires AWB Entry list or search. The suite is 427 passed.
- Run `scripts/awb-audit/cleanup-international-test-data.mjs` only when asked. It has not been run. Do not delete AWBs 000028–000043 until that go-live cleanup.

