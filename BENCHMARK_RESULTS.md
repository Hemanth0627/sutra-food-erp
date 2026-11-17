# Benchmark results

This is the mandatory scenario from the assignment (section 6), as posted by the system. Every figure below was read from the database after `npm run benchmark:reset`, which replays the scenario through the same service functions the API uses. Document numbers depend on the financial year; dates are the day the seed runs (here 17 Nov 2026, FY 2026-27).

**Reproduce:**

```bash
npm run benchmark:reset     # wipe → migrate → seed → replay scenario → print the check table
npm run benchmark:verify    # re-read the checks from the current database (exit code 1 on any mismatch)
npm run test:benchmark      # the same scenario on the separate test database, with assertions
```

The in-app **Benchmark check** page (Owner, Admin and Accountant) shows the same table live.

---

## 1. Initial master data and inventory

Factory: Tamil Nadu (state code 33), seller GSTIN `33AAKCT4821M1Z2` (fictional, checksum-valid).
Murukku 200 g: ₹50.00 before tax, GST 5%, HSN 2106.
Customers: **Retailer A** (Coimbatore, Tamil Nadu, 33), **Distributor B** (Bengaluru, Karnataka, 29). Salesmen: **Salesman A**, **Salesman B**.

Opening stock, posted as `OPENING_STOCK` ledger rows dated just before the current month starts:

| Item | Quantity | Rate | Value |
|---|---:|---:|---:|
| Flour | 100 kg | ₹42.00 | ₹4,200.00 |
| Cooking oil | 30 L | ₹140.00 | ₹4,200.00 |
| Salt & spice mix | 5 kg | ₹200.00 | ₹1,000.00 |
| 200 g pouch | 500 pcs | ₹2.50 | ₹1,250.00 |
| Carton (20 × 200 g) | 30 pcs | ₹15.00 | ₹450.00 |
| Murukku 200 g | 50 pkts | ₹30.00 (fictional opening cost) | ₹1,500.00 |

BOM `BOM-MURUKKU` v1 (active), batch size 200 packets, expected yield 100%:

| Material | Qty / batch | Rate at activation | Std cost |
|---|---:|---:|---:|
| Flour | 40 kg | ₹42.000 | ₹1,680.00 |
| Cooking oil | 10 L | ₹140.000 | ₹1,400.00 |
| Salt & spice mix | 1.2 kg | ₹200.000 | ₹240.00 |
| 200 g pouch | 200 pcs | ₹2.500 | ₹500.00 |
| Carton | 10 pcs | ₹15.000 | ₹150.00 |
| **Standard material cost per batch** | | | **₹3,970.00** |

## 2. Purchase transaction (step 1)

`PUR/2026-27/0001`: 60 kg flour at ₹45.00/kg from Sri Lakshmi Flour Mills (fictional), GST 0% (unbranded flour). Total ₹2,700.00.

| Ledger row | Qty | Rate | Value | Balance before → after | Value after |
|---|---:|---:|---:|---|---:|
| Flour `PURCHASE_RECEIPT` | +60 | 45.0000 | +2,700.00 | 100 → 160 kg | 6,900.00 |

Weighted average: (100 × 42 + 60 × 45) / 160 = 6,900 / 160 = **₹43.125/kg**.

## 3. Production transaction (steps 2–4)

`PR/2026-27/0001`: Murukku 200 g, BOM-MURUKKU v1, 1 batch. Planned output 200, expected 200. Issued to the line: flour 40, oil 10.5, spice 1.2, pouches 200, cartons 10. Completed with **188 good packets, 6 damaged pouches, 9 cartons**. Batch `FG-MURUKKU-200-261117-0001`, best before 15 Feb 2027 (90-day shelf life).

### Raw-material and packaging consumption

| Material | Planned (BOM) | Used | Damaged | Total deducted | Variance | Flag |
|---|---:|---:|---:|---:|---:|---|
| Flour | 40 kg | 40 | 0 | 40 kg | 0.00% | – |
| Cooking oil | 10 L | 10.5 | 0 | 10.5 L | **+5.00%** | flagged |
| Salt & spice mix | 1.2 kg | 1.2 | 0 | 1.2 kg | 0.00% | – |
| 200 g pouch | 200 | 188 | 6 | 194 | −3.00% | – (on the limit) |
| Carton | 10 | 9 | 0 | 9 | −10.00% | flagged |

Yield: 188 / 200 = 94.00%; yield variance (188 − 200) / 200 = **−6.00%** (flagged, tolerance ±3%).

### Ledger rows posted by the run (one transaction)

| Item | Movement | Qty | Rate (WAC) | Value | Balance before → after |
|---|---|---:|---:|---:|---|
| Flour | `PRODUCTION_ISSUE` | −40 | 43.1250 | −1,725.00 | 160 → **120** kg |
| Cooking oil | `PRODUCTION_ISSUE` | −10.5 | 140.0000 | −1,470.00 | 30 → **19.5** L |
| Salt & spice mix | `PRODUCTION_ISSUE` | −1.2 | 200.0000 | −240.00 | 5 → **3.8** kg |
| 200 g pouch | `PACKAGING_CONSUMPTION` | −188 | 2.5000 | −470.00 | 500 → 312 |
| 200 g pouch | `DAMAGED_MATERIAL` | −6 | 2.5000 | −15.00 | 312 → **306** |
| Carton | `PACKAGING_CONSUMPTION` | −9 | 15.0000 | −135.00 | 30 → **21** |
| Murukku 200 g | `PRODUCTION_OUTPUT` | +188 | 21.5691 | +4,055.00 | 50 → **238** pkts |

The finished goods are received at the run's material + packaging cost known at completion (₹4,055 ÷ 188). Labour and gas were recorded afterwards (step 10), so they appear in the costing snapshot (section 7) and not in the stock value.

## 4. Finished-goods movement

| Event | Document | Qty | Balance after | Value after |
|---|---|---:|---:|---:|
| Opening | Opening stock | +50 | 50 | ₹1,500.00 |
| Production output | PR/2026-27/0001 | +188 | **238** | ₹5,555.00 |
| Sales dispatch to Retailer A | DSP/2026-27/0001 | −150 (at WAC ₹23.3403) | **88** | ₹2,053.95 |

## 5. Sales transactions (steps 5–8)

| Step | Document | Detail |
|---|---|---|
| 5 | `SO/2026-27/0001` | Salesman A → Retailer A, 150 × Murukku @ ₹50.00 = ₹7,500.00 before tax |
| 6 | approval | Admin approves; available 238 ≥ 150, no shortage |
| 6 | `INV/2026-27/0001` | GST invoice (below) |
| 6 | `DSP/2026-27/0001` | Dispatch, vehicle TN 37 AB 1234; FG 238 → 88 |
| 7 | `SO/2026-27/0002` | Salesman B → Distributor B, 120 × Murukku = ₹6,000.00 before tax |
| 8 | stock check | Available = 88 on hand − 0 reserved = **88**; ordered 120 → **shortage 32 packets**. The order stays **PENDING** and is flagged as a critical alert. The system refuses to invoice more than 88 (HTTP 422, tested) |

If Distributor B is invoiced (inter-state, place of supply 29-Karnataka): IGST 5% applies. In full that is 120 × ₹50 = ₹6,000 + IGST ₹300 = ₹6,300. A partial invoice of the 88 available packets would be ₹4,400 + IGST ₹220 = ₹4,620. The order page shows this IGST preview, and the integration test posts the partial invoice to prove it.

## 6. GST invoice and outstanding balance

`INV/2026-27/0001`: Retailer A, place of supply **33-Tamil Nadu**, intra-state.

| Description | HSN | Qty | Rate | Taxable | CGST 2.5% | SGST 2.5% | Total |
|---|---|---:|---:|---:|---:|---:|---:|
| Murukku 200 g | 2106 | 150 PKT | 50.00 | 7,500.00 | 187.50 | 187.50 | 7,875.00 |

Round-off ₹0.00, grand total **₹7,875.00** (Seven Thousand Eight Hundred Seventy Five Rupees Only). Due 15 days after the invoice date.

Payment (step 9): `RCPT/2026-27/0001`, ₹4,000.00 by UPI, allocated to INV/2026-27/0001.

| Retailer A | Amount |
|---|---:|
| Invoiced | ₹7,875.00 |
| Received | ₹4,000.00 |
| **Outstanding** | **₹3,875.00** (ageing bucket: not due) |

## 7. Costing calculation (steps 10–11)

Expenses charged **directly** to PR/2026-27/0001: `EXP/2026-27/0001` labour ₹1,200.00 and `EXP/2026-27/0002` gas & power ₹600.00.

| Component | Basis | Amount |
|---|---|---:|
| Flour | 40 kg × ₹43.125 (weighted average) | ₹1,725.00 |
| Cooking oil | 10.5 L × ₹140 | ₹1,470.00 |
| Salt & spice mix | 1.2 kg × ₹200 | ₹240.00 |
| **Raw materials** | | **₹3,435.00** |
| Pouches | 194 × ₹2.50 (188 filled + 6 damaged) | ₹485.00 |
| Cartons | 9 × ₹15 | ₹135.00 |
| **Packaging** | | **₹620.00** |
| Labour | direct expense | ₹1,200.00 |
| Gas & power | direct expense | ₹600.00 |
| **Total production cost** | | **₹5,855.00** |
| Cost per good packet | ₹5,855 ÷ 188 | **₹31.1436 ≈ ₹31.14** |
| Selling price | | ₹50.00 |
| Gross margin per packet | ₹50.00 − ₹31.1436 | ₹18.8564 (37.71%) |

Assumptions: 194 pouches are consumed because 188 went into good packets and 6 were damaged during packing. All 194 leave stock, and the damaged ones are costed into the good output. 9 cartons are used because 188 packets fill 9 full cartons of 20; the remaining 8 packets are held in a part-filled carton completed by the next run. The 12-packet yield loss raises the cost per good packet because all raw materials are charged to the 188 good packets.

## 8. Monthly reports (step 11)

All 18 reports, including the consolidated monthly audit report, are generated from the posted records above and export to CSV, Excel and PDF. The monthly audit report for the benchmark month shows taxable sales ₹7,500.00, output GST ₹375.00, purchases ₹2,700.00, 1 production run with variance beyond tolerance, collections ₹4,000.00, outstanding ₹3,875.00, and "all items reconcile" for the stock ledger.

## 9. Expected versus actual

Output of `npm run benchmark:verify`. Stock checks read the ledger rows posted by the benchmark documents; receivable and shortage checks read the current state.

| Area | Check | Expected | Actual | Result |
|---|---|---:|---:|---|
| Inventory | Flour closing stock (kg) | 120.000 | 120.000 | PASS |
| Inventory | Oil closing stock (L) | 19.500 | 19.500 | PASS |
| Inventory | Spice mix closing stock (kg) | 3.800 | 3.800 | PASS |
| Inventory | Pouches closing stock | 306 | 306 | PASS |
| Inventory | Cartons closing stock | 21 | 21 | PASS |
| Inventory | Finished goods after production | 238 | 238 | PASS |
| Inventory | Finished goods after dispatch | 88 | 88 | PASS |
| Production | Yield variance (%) | −6.00 | −6.00 | PASS |
| Production | Oil consumption variance (%) | 5.00 | 5.00 | PASS |
| Production | Weighted-average flour rate (₹/kg) | 43.125 | 43.125 | PASS |
| Sales & GST | Retailer A taxable amount | 7,500.00 | 7,500.00 | PASS |
| Sales & GST | CGST 2.5% | 187.50 | 187.50 | PASS |
| Sales & GST | SGST 2.5% | 187.50 | 187.50 | PASS |
| Sales & GST | Invoice total | 7,875.00 | 7,875.00 | PASS |
| Sales & GST | Distributor B shortage (packets) | 32 | 32 | PASS |
| Sales & GST | Distributor B IGST if invoiced in full | 300.00 | 300.00 | PASS |
| Receivables | Retailer A outstanding | 3,875.00 | 3,875.00 | PASS |
| Costing | Flour cost | 1,725.00 | 1,725.00 | PASS |
| Costing | Oil cost | 1,470.00 | 1,470.00 | PASS |
| Costing | Spice mix cost | 240.00 | 240.00 | PASS |
| Costing | Pouch cost | 485.00 | 485.00 | PASS |
| Costing | Carton cost | 135.00 | 135.00 | PASS |
| Costing | Labour + gas & power | 1,800.00 | 1,800.00 | PASS |
| Costing | Total production cost | 5,855.00 | 5,855.00 | PASS |
| Costing | Cost per good packet | 31.14 | 31.14 | PASS |

**25 / 25 checks pass.**

## 10. Automated validation

`tests/unit/calculations.test.ts` (23 tests) and `tests/integration/benchmark.test.ts` (22 tests against PostgreSQL) cover what section 6.5 asks for:

| Requirement | Test(s) |
|---|---|
| Purchase receipt calculations | integration: ₹2,700 purchase, ledger row 100 → 160 |
| Weighted-average valuation | unit: ₹43.125 after purchase, issue at average; integration: run issue rate 43.125 |
| BOM material consumption | integration: planned 40 / 10 / 1.2 / 200 / 10 |
| Unit conversions | unit: g↔kg, mL↔L, rate conversion, cross-dimension rejected; integration: 1500 g → 1.5 kg |
| Raw-material closing stock | integration: 120 / 19.5 / 3.8 |
| Packaging closing stock | integration: 306 / 21, damaged row −6 |
| Finished-goods production | integration: output +188, balance 238 |
| Sales dispatch deduction | integration: −150, balance 88; second dispatch rejected |
| Yield variance | unit + integration: −6% (actual yield 94%) |
| Material consumption variance | unit + integration: oil +5%, flagged |
| CGST/SGST | unit + integration: ₹187.50 each |
| IGST | unit: ₹300 (full), ₹220 (88 pkts); integration: partial IGST invoice ₹4,620 |
| Invoice totals | unit + integration: ₹7,875, round-off, amount in words |
| Outstanding balances | integration: ₹3,875; over-allocation rejected |
| Cost per packet | unit + integration: ₹5,855, ₹31.14; unchanged after a later ₹60 flour purchase |
