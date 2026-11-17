# Demo guide: 8-minute video script

This script follows the mandatory benchmark scenario exactly (assignment section 6). It covers each screen to show, each transaction to perform and each calculation to point out.

## Before recording

```bash
npm run build && npm start      # production build: service worker on, fastest pages
npm run demo:fresh              # master data + opening stock only, so you enter steps 1–10 live
```

> Prefer not to type live? Run `npm run benchmark:reset` instead. The scenario is then already posted, and you narrate the same screens. Each step below notes where to see its result.

* Use a desktop browser at 1440 px wide. For the salesman steps, open DevTools device mode (iPhone 12/13, 390 px) or a phone on the same network.
* Open one browser profile per role, or sign out and in between steps. The login page has one-click buttons for every demo account.
* Keep a second tab open on the **Benchmark check** page (Owner) to reveal at the end.

### Test credentials (password `Demo@1234` for all, fictional data)

| Role | Email |
|---|---|
| Owner | owner@sutra-erp.test |
| Admin | admin@sutra-erp.test |
| Salesman A | salesman.a@sutra-erp.test |
| Salesman B | salesman.b@sutra-erp.test |
| Production Supervisor | production@sutra-erp.test |
| Accountant | accounts@sutra-erp.test |

---

## 0:00 – 0:35 · Introduction (landing page)

**Screen:** `http://localhost:3000/`

* "Sutra is an ERP for a South Indian snack factory. Every transaction is entered once and flows through a single inventory ledger."
* Scroll slowly through the **workflow** section. The 3D camera moves from raw ingredients → frying → packed pouches → warehouse → sales orders → invoices, matching the two workflows: Purchase → Production → Stock and Order → Invoice → Dispatch → Payment.
* Click **Sign in**.

## 0:35 – 1:05 · Master data and the BOM

**Sign in as Production** → **Bill of materials** → *Murukku 200 g – standard batch*.

* Show v1 **Active**: batch 200 packets, flour 40 kg, oil 10 L, spice 1.2 kg, 200 pouches, 10 cartons.
* Point out the standard cost: ₹3,970 per batch at opening rates (flour ₹42, oil ₹140, spice ₹200, pouch ₹2.50, carton ₹15).
* "BOMs are versioned. Editing creates a new draft, and production runs keep the version they used."
* Open **Raw-material inventory**: flour 100 kg, oil 30 L, spice 5 kg. Switch to the Packaging tab: pouches 500, cartons 30. Switch to Finished goods: Murukku 50.

## 1:05 – 1:40 · Step 1: purchase 60 kg flour at ₹45

**Sign in as Admin** → **Purchases** → **Record purchase**.

* Supplier *Sri Lakshmi Flour Mills*, supplier invoice `SLFM/26-27/0412`, material **Flour**, quantity **60**, unit KG, rate **45**, GST **0**.
* Before posting, point at the live preview line: *"60 KG → stock 160 KG, new avg ₹43.125/KG"*.
* **Calculation:** (100 × 42 + 60 × 45) / 160 = 6,900 / 160 = **₹43.125/kg**.
* Click **Post purchase**. On the purchase page, show the ledger row `PURCHASE_RECEIPT +60`, balance **100 → 160**.

## 1:40 – 3:10 · Steps 2–4: production run

**Sign in as Production** → **New production run**.

1. Product **Murukku 200 g**, BOM `BOM-MURUKKU v1`, **1** batch. The expected-consumption table shows 40 kg / 10 L / 1.2 kg / 200 / 10, and every line shows stock OK. Click **Plan production run**.
2. **Issue materials & start:** change Cooking Oil from 10 to **10.5** (step 3 actual consumption), keep the rest, click **Start run**.
3. **Record output & complete:**
   * Good output **188**. The hint shows *yield variance −6.00%*.
   * 200 g Pouch: used **188**, damaged **6**. Carton: used **9**. (Or click *Packaging from good output*, which fills 188 pouches and ⌊188/20⌋ = 9 cartons, then add the 6 damaged pouches.)
   * Point at the variance column: oil **+5.00%** in red.
   * Click **Complete run**.
4. On the run page, show:
   * **Yield variance −6.00%** (red, beyond ±3%) and actual yield 94%.
   * The planned vs actual table and the variance chart: oil +5% ⚑, cartons −10% ⚑, pouches −3% (on the tolerance, not flagged).
   * **Stock ledger entries posted by this run**, all in one atomic transaction: flour **160 → 120**, oil **30 → 19.5**, spice **5 → 3.8**, pouches 500 → 312 → **306** (188 used + 6 damaged), cartons **30 → 21**, Murukku **50 → 238**.
   * Costing snapshot so far: raw ₹3,435 + packaging ₹620 = ₹4,055.
   * "Why 194 pouches? 188 went into good packets and 6 were damaged while packing. All 194 leave stock and are costed. Why 9 cartons? 188 packets fill 9 cartons of 20; the last 8 wait in a part-filled carton for the next run."

## 3:10 – 3:45 · Step 5: Salesman A places an order (mobile)

**Phone / 390 px, sign in as Salesman A** → bottom tab **New**.

* Tap **Retailer A** (tagged *My customer*), type **150** for Murukku 200 g. The sticky footer shows **₹7,500.00** before tax. Tap **Place order**. This takes well under a minute.
* "If the phone is offline, the order is saved on the device with a unique reference and synced exactly once when the connection returns."

## 3:45 – 4:45 · Step 6: approve, GST invoice, dispatch

**Sign in as Admin** → **Orders** → the pending order for Retailer A.

* Show the green *Stock is available* banner, the credit check, and the **GST preview** (intra-state: CGST + SGST).
* Click **Approve**, then **Create GST invoice**. The quantity defaults to 150. Click **Issue invoice**.
* On the invoice: **Taxable ₹7,500.00, CGST 2.5% ₹187.50, SGST 2.5% ₹187.50, total ₹7,875.00**, place of supply 33-Tamil Nadu. Click **PDF** to show the printable tax invoice.
* Click **Dispatch**, then **Confirm dispatch**. The dispatch number appears, and finished goods go **238 → 88** (`SALES_DISPATCH −150` at weighted-average cost).
* "Posted invoices can't be edited or deleted, and the database enforces this. Cancelling requires a credit note."

## 4:45 – 5:30 · Steps 7–8: Distributor B and the shortage

**Salesman B (mobile)** → New → **Distributor B** → **120** → Place order.

**Admin** → Orders → Distributor B's order (also listed under **Alerts** as critical).

* Red banner: *"Murukku 200 g: 120 to fulfil, 88 available → **shortage 32 packets**"*.
* **IGST preview:** inter-state (Karnataka), taxable ₹6,000 → **IGST 5% ₹300**, total ₹6,300 if invoiced in full.
* "The system will not invoice or dispatch stock it doesn't have. If you try to invoice 120, it refuses with the 32-packet shortage. The order stays pending as a backorder, or you can invoice the 88 available as a partial fulfilment with IGST."

## 5:30 – 5:55 · Step 9: payment from Retailer A

**Admin** → **Payments** → **Record payment** → Retailer A, **₹4,000**, UPI → **Save receipt** (auto-allocated to the invoice).

* Customer balances: invoiced ₹7,875, received ₹4,000, **outstanding ₹3,875**. The open invoice ages in the *Not due* bucket.

## 5:55 – 6:35 · Step 10: production expenses and costing

**Sign in as Production** → **Production expenses** → **Record expense**:

* Labour **₹1,200**, allocation *Direct to one run* → the Murukku run. Save.
* Gas & power **₹600**, direct to the same run. Save.

Open the run (**Production history** → `PR/…/0001`) and walk through the **costing snapshot**:

| | |
|---|---|
| Flour 40 kg × ₹43.125 | ₹1,725 |
| Oil 10.5 L × ₹140 | ₹1,470 |
| Spice 1.2 kg × ₹200 | ₹240 |
| Pouches 194 × ₹2.50 | ₹485 |
| Cartons 9 × ₹15 | ₹135 |
| Labour + gas & power | ₹1,800 |
| **Total** | **₹5,855** |
| **Cost per good packet** ₹5,855 ÷ 188 | **₹31.14** |

* "Material cost was frozen when the run completed. A later flour purchase at a different price won't change this history."

## 6:35 – 7:30 · Step 11: monthly reports (Accountant)

**Sign in as Accountant** (read-only; no create buttons, and the API refuses writes too).

* **Accounting dashboard**: taxable sales ₹7,500, output GST ₹375, purchases ₹2,700, outstanding ₹3,875.
* **GST reports**: HSN 2106, intra-state, taxable ₹7,500, CGST ₹187.50, SGST ₹187.50.
* **Stock reports → Raw-material stock**: flour opening 100, in 60, out 40, closing **120** at ₹43.125; oil **19.5**; spice **3.8**. Packaging: pouches **306**, cartons **21**.
* **Audit reports** (consolidated monthly audit): click **PDF** and **Excel**. Show the summary, registers, production variance, cost per packet, receivables ageing, "All items reconcile" and the audit trail.
* Mention that every report filters by date, customer, product and type, and exports to CSV, Excel or PDF. Each export is itself logged in the audit trail.

## 7:30 – 8:00 · Proof and wrap-up

**Sign in as Owner** → **Overview**: today's sales, revenue, production output, stock values, alerts (shortage, variance, Murukku below reorder), product profitability (₹31.14 cost, 37.71% margin).

Then open **Benchmark check**: **25 of 25 checks pass**, read live from the posted records.

Close with: "The same scenario runs as an automated integration test against PostgreSQL (`npm test`: 45 tests), and the HTTP smoke test checks every role's pages and permissions (`npm run test:smoke`: 174 checks)."

---

### Fallback narration with `npm run benchmark:reset`

If the scenario is pre-posted, show the same screens in the same order: the purchase `PUR/…/0001`, the production run `PR/…/0001`, the orders `SO/…/0001` and `SO/…/0002`, the invoice `INV/…/0001` with its PDF, dispatch `DSP/…/0001`, receipt `RCPT/…/0001`, the expenses, the reports and the Benchmark check page. The numbers are identical.
