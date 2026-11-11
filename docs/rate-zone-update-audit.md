# Rate / Zone Update Audit

**Date:** 11 Nov 2026  
**Scope:** Utility → Rate / Zone Update. Pages: Rate Update, Rate Update Jobs, Zone Update, Zone Update Jobs, Rate Import.  
**Live app:** `http://localhost:8082`, signed in as the test admin.  
**Database checked:** development project only. Read-only. No import, no job run, no cleanup script.  
**Working rule:** audit only. No code fixes until the owner approves.

The UPS file was not inside the project. It is `~/Downloads/zonelinking ups.xls`. `imports/` is now in `.gitignore` at the workspace root and in `swiftforge-core/.gitignore`, so a copy dropped into `imports/` will not be committed. The file itself was not copied into the repo.

---

## 1. Simple-language summary

These five screens look like the reference software. Only two of them do real work, and that work is the dangerous kind.

**Rate Import does not import rates.** Save checks that a customer (or vendor), an origin, a format, and a file name are filled in, then shows a success message. It does not read the Excel file and does not write customer rates or vendor contracts. Download does not download a file.

**Zone Update → Import does not import zones.** The file picker accepts `.xls`, `.xlsx`, and `.csv`, but the Import button never opens the file. With no file selected it says “Please select import file”. Download does not download a template. **+ Add Mapping → Save** says “Zone saved” and writes nothing. **Export → Search** does not search and does not produce an Excel file.

**Rate Update → Ok and Zone Update → Update Shipments → Ok do change existing AWBs.** They are not in the reference software. They are bulk jobs we added. They skip locked, invoiced, and cancelled AWBs. They do **not** skip a normal booked AWB. Booking does not lock an AWB unless the operator ticked Lock, and Lock starts unticked. So Ok can change the zone and, when rerate is on or the job is a rate update, the money on an already booked AWB. There is no list of AWBs, no old-versus-new amounts, and no second confirm. The dates default to today, and blank customer / product / destination filters mean “all shipments in that date range”.

**After a real zone import, a new booking can use the new zone. An old booking will not, until someone runs one of those jobs.** This UPS file is a zone-linking sheet, not a rate sheet. Even a correct import would not create customer prices. Freight on a new AWB still comes from Customer Rate. The zone only changes which zone-specific rate or vendor cost is picked.

**Do not import the UPS file yet.** See section 8.

---

## 2. What each page does

### Rate Update (`/utility/rate-zone-update/rate-update`)

Live: the form is on screen. Update Type options are AWB Entry Rate, Vendor Rate, Tax & Fuel, Vendor OBC Rate. From Date and To Date default to today. Ok was not clicked.

| Control | What it actually does |
|---|---|
| Update Type | Stored on the job. The runner ignores it and always recalculates the full charge (customer freight, fuel, tax, and vendor cost). |
| From Date / To Date | Required. Sent to the server. The server rejects a range longer than 92 days, or an end date before the start date. |
| Service Center, Customer, Product, Destination | The **code** box is sent. The name box is not. A blank code means “do not filter”. The search popup is a fixed demo list, not the live master. |
| Origin, Vendor, Payment Type, All / Zero Contract(0) | On screen only. Not sent. They do not change which AWBs are updated. |
| Add to Job Queue | If ticked, Ok creates a queued job and opens the jobs page. If unticked, Ok creates the job and runs it immediately. |
| Ok | Creates the job and, unless queued, runs it. No preview and no “are you sure”. |
| Reset | Clears the form back to today and blank filters. Client only. |
| Click Here Open Job Queue | Opens the jobs page. |

The red note says locked invoices and locked AWBs are not changed. That part is true. It does not say that an unlocked booked AWB **is** changed.

### Rate Update Jobs (`/utility/rate-zone-update/rate-update-jobs`)

Live: signed-in page loads. Status filter, Refresh, New job, and an empty table: “No jobs yet. Create one from Rate Update.” Run was not clicked.

This page is not in XpresiON. It lists jobs in `rate_update_jobs`. Run / Retry calls `execute_rate_update_job`. Cancel is offered for Queued and Running, but a job that is already running cannot be stopped mid-way: the whole run is one database transaction, so Cancel waits until the run has finished and then fails because the job is already completed. Progress percentages are not visible to anyone else until the run commits.

### Zone Update (`/utility/rate-zone-update/zone-update`)

Live: three tabs plus **+ Add Mapping**. Ok on Update Shipments was not clicked. Add Mapping was opened and closed with Close, not Save.

**Update Shipments** (default tab). From / To date (default today), Branch, Customer, Product, Destination, Current Zone. Same rule as Rate Update: only the code is sent. Blank means all. **Recalculate Rating After Zone Update**, if ticked, also rewrites charges after the zone changes. **Add to Job Queue** queues instead of running now. Ok runs immediately when that box is unticked. Reset clears the form.

**Export.** Export Type Domestic / International, Vendor, Date, Product, Origin, Zone, Country, Destination, Customer, Service. Live click of Search left the form as it was. No result grid and no file. The code only shows the toast “Zone export search started”.

**Import.** Import Type has one choice, Zone Updation. Date defaults to today and is not used. Choose accepts `.xlsx`, `.xls`, and `.csv` and only remembers the file name. Live click of Import with no file showed “Please select import file”. A selected file would show “Zone update import started” and still save nothing. Download showed no file. The code only toasts “Zone update Excel format download started”. There is no template under `public/ExcelFormat/`.

**+ Add Mapping.** Dialog title Add/Update. Fields: Date, Origin (marked required), Vendor, Service, Product, Country, Destination, Zone. Save toasts “Zone saved” and closes. It does not insert into `zone_mappings`. Close discards the dialog.

### Zone Update Jobs (`/utility/rate-zone-update/zone-update-jobs`)

Live: empty table, “No jobs yet. Create one from Zone Update.” Columns include Rerate (Yes/No), status, progress, counts, created time, Run / Retry / Cancel. Same cancel limitation as rate jobs. Not in the reference software.

### Rate Import (`/utility/rate-zone-update/rate-import`)

Live: Customer and Vendor tabs, Format, DOX Product, SPX Product, From Date (today), Rate Round Off, Choose, Save, Reset. Save with an empty form showed “Customer is required”. Download does not download a file. “Click Here Open Job Queue” is a toast (“Job queue opened”), not a link to the jobs page.

There is no Rate Applicable dropdown and no Currency dropdown. Those are on the reference spec and are absent here. DOX and SPX choices are a fixed name list, not the product master. Increase Rate and Copy Client Rate are not on this screen. Copy Client Rate and Increase Rate live on Master → Customer → Customer Rate.

---

## 3. Tables, and what a booking actually uses

| Table | Who reads it | Who writes it from these screens |
|---|---|---|
| `zone_mappings` | AWB booking, via `app.resolve_rating_zone`. Also the zone-update job. | Nobody on these screens. Add Mapping and Import do not insert. |
| `customer_rates` | AWB booking, via `app.resolve_customer_rate`. Freight is weight × `rate_per_kg`. | Nobody. Rate Import does not insert. Real edits are Customer Rate (`mst.customer-contract-master`). |
| `vendor_contracts` / `vendor_contract_slabs` | Vendor cost inside rating (`app.compute_vendor_cost`). | Nobody on these screens. Vendor Contract master owns them. |
| `shipments` | The jobs select rows by book date and optional codes. | Rate job overwrites charge totals. Zone job writes `shipments.zone_id`. Booking itself does **not** store `zone_id`. |
| `shipment_charge_snapshots` | Invoice / AWB charge display. | Rate job deletes every snapshot for the AWB and inserts new ones. It does not put manual charge lines back. |
| `rating_audit` | History of calculations. | Appended when a rate job, or a zone job with rerate, persists. |
| `rate_update_jobs` / `zone_update_jobs` | The jobs pages. | Created and updated by Ok / Run / Cancel. |
| `audit_logs` | Action history. | One summary row per finished job. Zone changes also store old and new `zone_id`. Rate changes store the new totals only, not the old ones. |
| `fuel_surcharge_rates`, `tax_rates` | Used inside the full rerate. | Not by these screens. |

`app.resolve_rating_zone` (`0041_rating_engine.sql` lines 321–339) picks a mapping by origin, destination, vendor, product, service, and effective date. A blank column on the mapping means “any”. It then falls back to the destination’s own zone. **It never looks at `zone_mappings.country_id`.**

On a new booking, if a mapping matches, that zone is used to pick the customer rate and the vendor cost. The zone is not saved on the shipment. An already booked AWB keeps the charges it had, until a rate job or a zone job with rerate runs.

Customer freight does not understand the reference rate types INITIAL / UPTO / ADDITIONAL / PLUS. The engine multiplies chargeable weight by `rate_per_kg` (`0041_rating_engine.sql` lines 659–661). Slab types on the customer rate row are stored and then ignored.

---

## 4. UPS file dry run (nothing saved)

**File:** `~/Downloads/zonelinking ups.xls`  
**Sheet1:** 885 used rows = 1 header + **884 data rows**. No duplicate key (origin + vendor + product + country + destination + service + zone).  
**Sheet2:** a colour note (Orange = 7A, Blue = 6A, Yellow = 15), not a second mapping table. It must not be imported as rows. **Sheet3:** empty.  
**There is no template in the app to compare with.** The Add Mapping dialog fields are Date, Origin, Vendor, Service, Product, Country, Destination, Zone. The file has no Date column. Service is named ServiceType.

| Column | Distinct values |
|---|---|
| Origin | HYD only |
| Vendor | UPS only |
| Product | DOX 221, SPX 221, PACK 221, ENV 221 |
| Country | 221 ISO codes, all present in the country master |
| Destination | 221 names. Each name exists once in the destination master, and the destination’s country code matches the Country column |
| Zone | 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 16, AU, CA, CZ, DE, HU, NZ, PL, RO, SG, US, and **ZW** |
| ServiceType | WORLDWIDE EXPRESS SAVER only |

First 10 data rows:

| Origin | Vendor | Product | Country | Destination | Zone | ServiceType |
|---|---|---|---|---|---|---|
| HYD | UPS | DOX | AF | Afghanistan | 8 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AX | Aland Islands | 6 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AL | Albania | 8 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | DZ | Algeria | 7 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AS | American Samoa | 7 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AD | Andorra | 4 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AO | Angola | 8 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AI | Anguilla | 7 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AG | Antigua and Barbuda | 7 | WORLDWIDE EXPRESS SAVER |
| HYD | UPS | DOX | AR | Argentina | 11 | WORLDWIDE EXPRESS SAVER |

Checked against the development masters, read only. `zone_mappings` has 2 rows today, and **none of them are UPS**, so this would be a first load, not an update of existing UPS rows. There is no unique key on `zone_mappings`, so a second load of the same file would insert another 880 copies.

| Result | Rows | Why |
|---|---|---|
| Would link | **880** | Origin HYD exists (destination Hyderabad and branch HYD). Vendor code UPS exists. Products DOX, SPX, PACK, ENV exist. Every country code exists. Every destination name exists. The zone code exists. Service WORLDWIDE EXPRESS SAVER exists on the UPS service mapping. |
| Would fail | **4** | Zimbabwe, country ZW, zone **ZW**, once each for DOX, SPX, PACK, and ENV. Zone code ZW is not in the zone master. |
| Not a failure | 20 | China, Lao, Tanzania, USA, and Venezuela use a destination name that is not the country master’s official name (“USA” vs “United States of America”, and four similar cases), for all four products. The country **code** matches, and the destination row’s country code matches. They would link if Destination is matched by the destination name. |

Other vendor codes UPS2 and UPS3 also exist. The file says UPS, which is “UNITED PARCEL SERVICE”. That match is exact, but it should be confirmed before any load.

This file is not a rate sheet. It must not be put through Rate Import. It has no weight, no rate, and no effective date.

If these 880 rows were later stored with destination, vendor UPS, product, service, and origin HYD filled in, a **new** booking that uses that same destination, vendor, product, service, and origin would pick the new zone. A booking with a different service would not. An already booked AWB would not change until Update Shipments or Rate Update is run.

---

## 5. Findings

| ID | Severity | Status | Live / code | Evidence | What happens |
|---|---|---|---|---|---|
| **RZ-01** | **CRITICAL** | FIXED | Live + code | Was: Ok called `execute_rate_update_job` with no preview. Now: `0151_safe_rate_update.sql` `preview_rate_update` writes nothing; `apply_rate_update` runs only after Confirm & Apply. Manual lines (`charges_type = 'MANUAL'`) are not deleted. Live Playwright on 11 Nov 2026: blank filters are blocked, the preview shows old and new freight, and a locked AWB booked 9 Nov 2026 is shown as Locked. Confirm was not clicked, so nothing was saved. | Ok shows a preview first. Locked, invoiced, and cancelled AWBs are listed as skipped and are not saved. A second dialog states the count and the amount difference before anything is written. |
| **RZ-02** | **CRITICAL** | FIXED | Live | Update Shipments tab, the rerate checkbox, and the job-queue controls are removed from Zone Update. `execute_zone_update_job` now refuses. Live Playwright: the page has Export and Import only, and the jobs URL returns 404. | A zone import does not change booked AWBs. The old job runner cannot be started from the screen. |
| **RZ-03** | **CRITICAL** | OPEN | Live | Zone Import button, live toast “Please select import file”. `zone-update.tsx` 177–179 and 578–586. | **Import does not read the file and does not save.** A chosen file only produces the toast “Zone update import started”. The UPS sheet cannot be loaded from this screen. |
| **RZ-04** | **CRITICAL** | OPEN | Live | Rate Import Save, live toast “Customer is required”. `rate-import.tsx` 92–98. | **Rate Import does not parse Excel and does not write `customer_rates` or vendor contracts.** A filled form still only toasts success. A new AWB cannot see rates from this screen. |
| **RZ-05** | **HIGH** | FIXED | Code + unit | `0151_safe_rate_update.sql` quote function. `previewMath.test.ts`. | AWB Entry Rate changes customer freight, fuel, tax, and may update the zone. Vendor Rate changes only vendor cost. Tax & Fuel changes only fuel and tax. Vendor OBC Rate is removed from the list because there is no separate OBC price. Origin, Vendor, Payment Type, and Zero Contract are sent and applied. |
| **RZ-06** | **HIGH** | OPEN | Code | `0041_rating_engine.sql` 321–339. Booking resolves a zone at `0148_proforma_dox_and_blank_csb_gates.sql` 476–479 and never assigns `shipments.zone_id`. | Even after a correct zone load, the resolver ignores `country_id`. A mapping only hits when origin, destination, vendor, product, and service match. Past bookings keep old charges until a job is run (RZ-01 / RZ-02). |
| **RZ-07** | **HIGH** | OPEN | Code | `0041_rating_engine.sql` 659–661. Customer rate types in `customerRates.ts` 5. | AWB freight is weight × `rate_per_kg`. INITIAL / UPTO / ADDITIONAL / PLUS from the reference rate sheet are not calculated. Zone linking does not create those rates. |
| **RZ-08** | **HIGH** | OPEN | Code | `zone_mappings` has no unique business key (`0041_rating_engine.sql` 98–128). Dry run: 0 UPS rows exist today. | A repeated import would add another full copy. There is no “replace this vendor’s mappings” mode, and no dry run on the screen. |
| **RZ-09** | **HIGH** | OPEN | Live + code | Download buttons. `zone-update.tsx` 231–233. `rate-import.tsx` 115–118. No file in `public/ExcelFormat/` except the proforma workbook. | **Download does not produce an Excel file.** Export Search does not produce one either (`zone-update.tsx` 507–511). An exported file cannot be imported back, because neither side exists. |
| **RZ-10** | **HIGH** | FIXED | Code | `apply_rate_update` writes `audit_logs` with old and new zone, freight, fuel, tax, total, and vendor, plus the signed-in user and the time. The 5,000 cap is gone. Unchanged AWBs are counted on screen and are not hidden inside a cap. | Each changed AWB has its own old-and-new audit row. There is no silent cutoff. |
| **RZ-11** | **MEDIUM** | FIXED | Code | `assert_rate_update_execute_permission` now requires `utl.rate-update` modify. The same check opens the page (`nav-permissions.ts`). Job slugs are set inactive in `0151` and removed from the menu. | One permission, modify on Rate Update, both opens the page and runs the preview and the apply. The server checks it. Tenant admins still pass, as they do for every module. |
| **RZ-12** | **MEDIUM** | OPEN | Code | `master-lookup-dialog.tsx` 19–25. `master-lookups.ts` 89–251. | Every search magnifying glass on these pages uses a fixed list baked into the program. It is not the live customer, destination, or zone master. The zone list in that popup stops at zone 10, while the database and the UPS file go past that (11, 16, AU, US, and others). A typed code is what the job uses, if that field is sent at all. |
| **RZ-13** | **MEDIUM** | OPEN | Code | `rate-import.tsx` 54–56 versus the reference spec. | Format names match the reference (Zone Rate, Country Rate, Country Rate New, Country Rate New1, Country Rate New2) and are then unused. Rate Applicable and Currency are missing. DOX / SPX options are a short fixed list, not products from the master. The 15 reference columns are not parsed. Merge rules (zone row must have a blank country and city, and the reverse) are not checked. |
| **RZ-14** | **LOW** | FIXED | Live | Job-queue links and “Add to Job Queue” are removed from Rate Update, Zone Update, and Rate Import. Playwright: those words are not on the screens, and both job URLs return 404. | There is no job queue control left on these pages. |
| **RZ-15** | **LOW** | OPEN | Code | `zone-update.tsx` 540–553 and 619–625. | The Date on Import and on Add Mapping is not an effective-from date. Nothing reads it. The UPS file also has no date column, so a future importer must be told what that date means. |
| **RZ-16** | INFO | OPEN | Dry run | Sheet1, 884 rows, development masters. | 880 rows would match masters. 4 Zimbabwe rows fail because zone ZW does not exist. Sheet2 must be left out. This was a read-only check. Nothing was written. |

---

## 6. Difference from the reference software

XpresiON (BusiSoft) is the layout these screens were copied from. Rate Update Jobs and Zone Update Jobs are ours. They are not in that software. Update Shipments and the rerate checkbox are ours as well.

From the Rate Import reference spec already agreed in the earlier review:

| Reference behaviour | This app |
|---|---|
| Save merges an Excel rate contract into customer or vendor rates | Save shows a toast |
| Download Excel File Format returns the template | Toast only. No template file |
| Columns: Branch, Account No, Effective Date, Vendor, Doc Type, Service, Zone, Country, City, Rate Type, Weight, Rate, Awb Charge, Unit, Days | Not parsed |
| Zone / country / destination rows must leave the other columns blank | Not checked |
| INITIAL, UPTO, ADDITIONAL, PLUS pricing | Not implemented. Booking uses weight × rate per kg |
| From Date is the effective date. Rate Round Off rounds imported amounts | Collected and ignored |
| Optional “add a rate-update job after import” | Checkbox is ignored. The job-queue control does not open the jobs page |
| Rate Applicable and Currency | Not on the form |
| Increase Rate and Copy Client Rate | Not on this screen. They are on Customer Rate |

Zone linking, from this courier file versus our Import screen:

| Courier file | Our screen |
|---|---|
| `.xls`, columns Origin, Vendor, Product, Country, Destination, Zone, ServiceType | Picker allows `.xls` and `.xlsx`, then does not read them |
| No date column | A Date box is on the form and is unused |
| One vendor, one origin, four products, one service, country-level destinations | Add Mapping can type those fields and then does not save |
| Sheet2 is a colour legend, not mappings | There is no rule to skip extra sheets, because nothing is read |

---

## 7. Proposed fix batches (do not start until approved)

### Batch 1 — Stop silent changes to booked AWBs

1. Rate Update and Zone Update must not change a booked AWB unless the operator is shown the AWB list and the old and new zone and charges, and confirms.
2. Default should be: booked AWBs are left alone. Lock should not be the only protection, because Lock starts unticked.
3. Update Type must do only what it says. Vendor Rate must not rebuild the customer freight. Tax & Fuel must not rebuild the freight.
4. Origin, vendor, payment type, and Zero Contract must either filter the job or come off the screen.
5. Ok with every filter blank must not run. Require at least one of customer, vendor, or an explicit “all shipments in this date range” confirm.
6. Do not delete manual charge lines as a side effect of a rerate.

### Batch 2 — Zone import that can take this UPS file

1. Real Import: read `.xls` and `.xlsx`, Sheet1 only, dry run first, then save only after confirm.
2. Map Origin, Vendor, Product, Country, Destination, Zone, ServiceType onto `zone_mappings`. Decide the Date box (see questions).
3. Reject unknown zone, unknown vendor, unknown product, unknown country, unknown destination, with a row number. Do not save any row if the owner wants all-or-nothing.
4. Upsert for this vendor + origin + product + destination + service. A second import must not duplicate.
5. Teach `resolve_rating_zone` to use the country when that is how the file is stored, and confirm a new test booking picks zone 8 for Afghanistan / UPS / DOX / WORLDWIDE EXPRESS SAVER from HYD.
6. Do not rerate existing AWBs as part of the import.

### Batch 3 — Rate Import, separate from this zone file

1. Template download, the 15 reference columns, row errors, merge-mode blanks, effective date, round off.
2. INITIAL / UPTO / ADDITIONAL / PLUS must match the reference examples before any rate file is loaded.
3. Imported rows must be what a new AWB uses. This UPS file is not that rate file.

### Batch 4 — Export, lookups, permissions, audit

1. Export writes the same columns Import reads, so a file can go out and come back.
2. Search popups read the live masters.
3. The jobs menu permission and the permission that runs a job should be the same, or the Run button should stay hidden when Run is not allowed.
4. Every charge change stores who, when, old amount, and new amount.

---

## 8. Recommendation on the UPS file

**Do not import it.**

The Import button would not save it anyway. It would only show a success toast, which is easy to mistake for a real load. A real load is also not safe yet:

- 4 Zimbabwe rows have zone ZW, which is not in the zone master.
- Sheet2 must not be treated as data.
- The file has no effective date.
- There is no dry run and no duplicate protection on the screen.
- A later Update Shipments or Rate Update can change charges on booked unlocked AWBs with no preview.

880 of 884 Sheet1 rows do match the current masters (origin HYD, vendor UPS, products DOX / SPX / PACK / ENV, country codes, destination names, and the zone codes other than ZW). That is a validation result only. Nothing was written.

---

## 9. Business questions

1. The UPS file has no date. Should the Date box on Zone Update → Import be the effective-from date for every row?
2. The vendor code on every row is UPS. UPS2 and UPS3 also exist. Is UPS (“UNITED PARCEL SERVICE”) the right vendor?
3. Zimbabwe is zone ZW in the file, and ZW is not in the zone master. Add zone ZW, or reject those 4 rows?
4. Sheet2 lists countries under Orange = 7A, Blue = 6A, and Yellow = 15. Are those corrections that should override Sheet1, or notes to ignore?
5. After a zone import, must booked AWBs keep the zone and the charges they were booked with, unless someone reviews a list and confirms?
6. Should Rate Update ever be allowed to change a booked AWB, or only drafts that were never booked?
7. In this file, Destination is the country (USA, Afghanistan), and the destination master is set up the same way. Should a new AWB to destination USA, vendor UPS, product DOX, service WORLDWIDE EXPRESS SAVER, origin HYD, receive that row’s zone?
8. If this file is loaded again next month, should it replace the previous UPS / HYD rows, or add another copy?
9. The only service in the file is WORLDWIDE EXPRESS SAVER. Should other UPS services keep their old zones?
