# Rate Import design

**Date:** 11 Nov 2026  
**Status:** Design only. Nothing in this document is built. The rating engine is unchanged. Rate Import does not read the Excel file. Save says “Rate Import is not available yet” and writes no rate.

This is the proposal for RZ-04, RZ-07, and RZ-13. Do not load a rate file, and do not import the UPS zone file here. That file has no weight and no rate.

The live Xpresion screen was not open while this was written. The formulas below are the rule to approve before any code changes. If the courier team’s sheet uses a different slab rule, these examples are the ones to correct.

---

## What a booking uses today

`book_awb_shipment` calls `app.run_shipment_rating`, then `app.apply_booked_money`, then `app.price_manual_charges`.

Freight is `round(max(chargeable weight, min weight) × rate per kg, 2)`. That is `app.run_shipment_rating` in `0041_rating_engine.sql`, lines 659–661. `customer_rates.rate_type` (`FLAT`, `PER_KG`, `PER_SLAB`, `MINIMUM`) is stored and ignored. INITIAL, UPTO, ADDITIONAL, and PLUS are not stored as slab rows at all.

A customer rate with only `rate_per_kg` must keep that formula. The AWB and Proforma tests book against those cards. A slab import must not change their totals.

---

## Template columns

One sheet. The download is a real workbook with these headers and one example row. Save does not run until the file has been dry-run and confirmed.

| Column | Meaning |
|---|---|
| Branch | Origin branch or origin code |
| Account No | Customer code on the Customer tab. Blank on a vendor file |
| Effective Date | Date the row starts. A blank cell uses the From Date on the screen |
| Vendor | Vendor code. Required on the Vendor tab. Optional on a customer file |
| Doc Type | Product code, from the product master. Not the fixed DOX / SPX name lists on the screen today |
| Service | Vendor service. Blank means any service |
| Zone | Zone code. Blank when the row is a country or city row |
| Country | Country code. Blank when the row is a zone or city row |
| City | Destination code or destination name. Blank when the row is a zone or country row |
| Rate Type | `INITIAL`, `UPTO`, `ADDITIONAL`, or `PLUS` |
| Weight | Slab size in the Unit. `0` on a PLUS row |
| Rate | Money for that slab |
| Awb Charge | Flat amount added once per AWB. The same value on every row of the lane |
| Unit | `KG` for the first version. Any other unit fails that row |
| Days | Transit days. Stored. Not used in the freight sum |

A lane is one customer or vendor, one origin, one product, one service (including “any”), one of zone / country / city, and one effective date.

Blank rules, checked on the dry run:

- A zone row has a zone, and the country and city are blank.
- A country row has a country, and the zone and city are blank.
- A city row has a city, and the zone is blank.
- A row with more than one of zone, country, and city fails.
- A lane may be UPTO rows, or INITIAL plus ADDITIONAL. Mixing UPTO with INITIAL or ADDITIONAL fails the lane.
- PLUS is allowed on either kind of lane. It is not a third way to price the weight.

The screen format (Zone Rate, Country Rate, Country Rate New, Country Rate New1, Country Rate New2) only chooses which of those blank rules to expect. It does not change the arithmetic.

---

## How the four rate types are calculated

Chargeable weight is the weight the AWB already uses: each piece is the greater of actual and volumetric, the pieces are added, then the vendor round-off runs if that vendor has it. Rate Applicable can choose a different weight. The default is chargeable weight, which is today’s behaviour.

Money is rounded to 2 decimals, half up, at the end of the freight sum. A block that is only partly used is charged as a whole block. `ceil` is used. An exact multiple is not rounded up an extra block.

Sample lane used for every example below:

| Rate Type | Weight | Rate |
|---|---:|---:|
| INITIAL | 0.5 kg | ₹500 |
| ADDITIONAL | 0.5 kg | ₹200 |
| UPTO | 0.5 kg | ₹450 |
| UPTO | 5 kg | ₹2,000 |
| UPTO | 20 kg | ₹7,500 |
| PLUS | 0 | ₹75 |

UPTO is not mixed with INITIAL on a real lane. The table is one sample card so the three weights can be checked by hand. A file that contains both styles for the same lane is a dry-run failure.

### INITIAL

The first 0.5 kg costs ₹500. That amount does not grow with weight. Weight above 0.5 kg is priced by ADDITIONAL, in the next section. INITIAL alone does not price a shipment that is over 0.5 kg.

| Chargeable weight | INITIAL amount | Why |
|---:|---:|---|
| 0.5 kg | ₹500.00 | Weight is inside the first slab |
| 2.3 kg | ₹500.00 | The first slab is still ₹500. The extra 1.8 kg is not multiplied by 500 |
| 12 kg | ₹500.00 | Same first slab. The extra 11.5 kg is not multiplied by 500 |

### ADDITIONAL

Each extra 0.5 kg, or part of 0.5 kg, above the INITIAL slab costs ₹200.

`blocks = ceil((weight − 0.5) / 0.5)` when weight is above 0.5, otherwise 0.

| Chargeable weight | Blocks | ADDITIONAL amount | Freight (INITIAL + ADDITIONAL) |
|---:|---:|---:|---:|
| 0.5 kg | 0 | ₹0.00 | ₹500.00 |
| 2.3 kg | ceil(1.8 / 0.5) = 4 | ₹800.00 | ₹1,300.00 |
| 12 kg | ceil(11.5 / 0.5) = 23 | ₹4,600.00 | ₹5,100.00 |

A weight of exactly 2.5 kg is `(2.5 − 0.5) / 0.5 = 4` blocks, ₹800, freight ₹1,300. It does not become 5 blocks.

If a lane has ADDITIONAL and no INITIAL, the dry run fails. There is no “start from zero” rule until the owner asks for one.

### UPTO

Use the smallest UPTO slab whose weight is greater than or equal to the chargeable weight. The rate is flat. It is not multiplied by the weight.

| Chargeable weight | Slab used | Freight |
|---:|---|---:|
| 0.5 kg | UPTO 0.5 kg | ₹450.00 |
| 2.3 kg | UPTO 5 kg | ₹2,000.00 |
| 12 kg | UPTO 20 kg | ₹7,500.00 |

A weight above every UPTO slab has no rate. Booking shows the same “no customer rate” error it shows today. It does not invent a per-kg price from the last slab.

### PLUS

PLUS is added once per AWB after the weight freight. The weight column is 0. The rate is not multiplied by kilograms.

On the INITIAL + ADDITIONAL freight from above, plus ₹75:

| Chargeable weight | Weight freight | PLUS | Total freight |
|---:|---:|---:|---:|
| 0.5 kg | ₹500.00 | ₹75.00 | ₹575.00 |
| 2.3 kg | ₹1,300.00 | ₹75.00 | ₹1,375.00 |
| 12 kg | ₹5,100.00 | ₹75.00 | ₹5,175.00 |

On the UPTO freight, the same ₹75 gives ₹525.00, ₹2,075.00, and ₹7,575.00.

Awb Charge is a second flat amount, also once per AWB. If the sheet says Awb Charge ₹25 and PLUS ₹75, both are added: the 0.5 kg INITIAL shipment would be ₹600.00. These two columns must not be treated as the same number. If the courier team uses only one of them, the other stays 0.

Fuel and GST stay as they are today, calculated on the freight this design produces. This design does not change the manual-charge GST flag.

---

## Rate Applicable and Currency

Rate Applicable chooses the weight that enters the formula:

| Choice | Weight used |
|---|---|
| Chargeable Weight | Today’s weight. This is the default when the field is blank |
| Actual Weight | Actual weight only, after the same piece sum |
| Volumetric Weight | Volumetric weight only |

The choice is stored on the imported lane. A per-kg customer rate that was typed on Customer Rate, not imported, keeps chargeable weight.

Currency is the currency of Rate, PLUS, and Awb Charge.

- `INR` is used as the number on the sheet. No conversion.
- Any other currency is stored and is not converted. A booking that would use that lane fails with “rate currency is not INR” until the owner names the exchange-rate source. The customs exchange rate on the proforma is not reused for freight in this design.

---

## Dry run, confirm, and upsert

Same shape as zone import.

1. Dry run writes nothing. It returns the row count, how many are OK, how many failed, and for each failure the row number and the reason (unknown customer, vendor, product, zone, country, destination, or service; mixed UPTO and INITIAL; missing slab; bad unit; currency not INR is a warning, not a failure).
2. It also counts NEW and REPLACE.
3. Confirm is one transaction. If any row failed, nothing is saved unless “Skip failed rows and import the rest” is ticked. The server rejects a partial save when that box is off.
4. The upsert key is tenant + customer or vendor + origin + product + service + zone or country or destination + effective date + rate type + weight. A second import of the same lane replaces those slabs. It does not insert another copy.
5. An identical file shows 0 new. Rows whose rate, Awb Charge, unit, and days are unchanged are reported as unchanged, not as a replace. Confirming an unchanged file writes nothing.
6. Booked AWBs are not updated. A later Rate Update, with a preview and a confirm, is the only way to reprice them.

From Date on the screen is the effective date for every row whose Effective Date cell is blank. Rate Round Off, when ticked, rounds each imported Rate to the nearest rupee before the dry run shows it. When unticked, the sheet amount is kept to 2 decimals.

Customer and Vendor are separate files. A customer file writes the customer rate. A vendor file writes the vendor contract slabs. One save does not write both.

---

## Engine change, after this design is approved

Do not edit `0041_rating_engine.sql` or `0148_proforma_dox_and_blank_csb_gates.sql`. Add a new migration that replaces `app.run_shipment_rating`’s freight step:

- If the matched lane has slab rows, use the formula in this document.
- If it has none, keep `round(max(weight, min weight) × rate per kg, 2)`.

Store slabs in a new table, one row per INITIAL, UPTO, ADDITIONAL, or PLUS line, with the upsert key above. Keep `customer_rates` as the lane header so today’s per-kg cards stay where they are.

Vendor cost uses the same four types against `vendor_contract_slabs`, without changing a vendor row that is still a single per-kg rate.

Existing AWB and Proforma tests stay green because their customer rates have no slab rows, Rate Applicable defaults to chargeable weight, and currency stays INR. A new unit test should assert the twelve amounts in the tables above. A Playwright test should dry-run a small file, confirm it, book one TEST AWB, and check the freight, then delete that test rate.

Rate Import’s template button should download this workbook. Save should say “Not available yet” until the dry run and confirm exist. Neither of those screen changes is part of this document’s approval.
