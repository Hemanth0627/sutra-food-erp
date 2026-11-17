# Demo script: Sutra Food Manufacturing ERP (under 8 minutes)

A ready-made narrated recording of this script is produced by `demo/record-demo.mjs` + `demo/assemble-demo.mjs` (see [Producing the video](#producing-the-video)); the narration with exact timings is in [`demo/narration.md`](demo/narration.md). Use this page to present live or to re-record.

## Before you start

```bash
npm run benchmark:reset          # database = the documented benchmark state (+ one open demo purchase order)
npm run build && npm start       # production build on http://localhost:3000
```

* Desktop browser at 1280–1440 px. For the salesman, use DevTools device mode (390 px) or a phone on the same network (set `COOKIE_SECURE=false` when serving over plain HTTP on a LAN).
* Every demo account uses the password `Demo@1234`; the login page has one-click buttons.
* Live actions in this script (a Mixture order and a packaging receipt) do not touch the 25 benchmark checks. Run `npm run benchmark:reset` afterwards to start clean.

| Role | Email |
|---|---|
| Owner | owner@sutra-erp.test |
| Admin | admin@sutra-erp.test |
| Salesman A / B | salesman.a@sutra-erp.test / salesman.b@sutra-erp.test |
| Production Supervisor | production@sutra-erp.test |
| Accountant | accounts@sutra-erp.test |

---

| # | Time | Segment | Role · screen | Do | Say / point out |
|---|---|---|---|---|---|
| 1 | 0:00 | **Introduction** | Visitor · `/` | Hold on the hero; scroll to *Sell, make, bill*; scroll to *Factory tour*; click **Frying** | "Sutra runs a snack factory, from flour sack to GST invoice." Three steps: sell, make, bill. 13 departments explained in a one-minute tour. |
| 2 | 0:27 | **Login & role dashboards** | `/login` → Owner | Click the **Owner** demo button → Sign in; scroll the overview | Five roles, one database; permissions checked on the server for every page and API call. Owner KPIs: revenue ₹7,500, output 188 packets (yield 94%), outstanding ₹3,875, alerts. |
| 3 | 0:53 | **Mobile order entry** | Salesman A · `/orders/new` at 390 px | Tap **Retailer A** → **+10** Mixture twice → **Place order** | Under a minute; value before tax shown; offline orders queue on the phone and sync once (idempotent `clientRef`). |
| 4 | 1:13 | **Admin approval** | Admin · `/orders` → new order | Open it; **Edit lines** (show, cancel); **Approve** | Live stock check (ordered, available, shortage); amendments need a reason and are audited with before/after values. |
| 5 | 1:35 | **GST invoice & dispatch** | Admin · `/invoices` → `INV/2026-27/0001` | Scroll the invoice; point at **Download PDF** | 150 × ₹50 = ₹7,500; intra-state (TN → TN): CGST 2.5% ₹187.50 + SGST 2.5% ₹187.50 = **₹7,875**. FY numbering, credit-note-only cancellation, dispatched once (238 → 88). |
| 6 | 2:15 | **Purchase** | Admin · `/purchases` → `PUR/2026-27/0001`, then `/purchase-orders` → `PO/2026-27/0001` → **Receive goods** | Show ledger row 100 → 160; on the PO, type a supplier invoice no. → **Post purchase** | 60 kg × ₹45 = ₹2,700; weighted average (100×42 + 60×45)/160 = **₹43.125/kg**. A PO never moves stock; the receipt does, and over-receipt is refused. |
| 7 | 2:44 | **BOM & production run** | Production · `/bom` → Murukku, `/production` → `PR/2026-27/0001` | Show BOM v1 lines; open the run | BOM per 200 packets: flour 40 kg, oil 10 L, spice 1.2 kg, 200 pouches, 10 cartons. Run: oil 10.5 L, **188 good**, 6 pouches damaged, 9 cartons. One atomic transaction. |
| 8 | 3:14 | **Planned vs actual** | Production · `/reports/planned-vs-actual` | Point at the oil row | `(10.5 − 10) ÷ 10 × 100` = **+5%** > ±3% tolerance → flagged. |
| 9 | 3:31 | **Yield & wastage** | Production · `/reports/yield-wastage` | Point at yield and damaged pouches | `(188 − 200) ÷ 200 × 100` = **−6%**; damaged pouches recorded separately and costed. |
| 10 | 3:46 | **Stock ledger** | Accountant · `/reports/stock-ledger` | Scroll the rows | Append-only rows with document, user, before → after. Flour **120 kg**, oil **19.5 L**, pouches **306** (500 − 188 − 6), FG 50 → **238** → **88**. |
| 11 | 4:11 | **Cost per packet** | Owner · `/costing` | Scroll the build-up | ₹1,725 + ₹1,470 + ₹240 + ₹485 (194 pouches incl. 6 damaged) + ₹135 + ₹1,200 + ₹600 = **₹5,855**; ÷ 188 = **₹31.14**; margin ₹18.86 (37.71%). |
| 12 | 4:42 | **Retailer A payment** | Admin · `/customers` → Retailer A | Show the statement | ₹4,000 by UPI allocated to the invoice; outstanding **₹3,875**; ageing buckets. |
| 13 | 4:58 | **Distributor B shortage** | Admin · `/orders` → `SO/2026-27/0002` | Show the red banner and GST preview | Ordered 120, available 88 → **short 32**; cannot invoice or dispatch the shortfall; inter-state (TN → KA) → IGST (₹300 if invoiced in full). |
| 14 | 5:20 | **Monthly reports** | Accountant · `/reports` → *Consolidated monthly audit report* | Show the export buttons; scroll | Read-only role; 18 reports with date filters; CSV, Excel and PDF; GST summary maps to GSTR-1/3B concepts (operational reporting, not a filing service). |
| 15 | 5:44 | **3D digital twin** | Owner · `/factory` | Click **Finished goods**, **Frying**, **Packaging store**; **Reset camera**; **Guided tour** | Colours come from the database, always with text: FG red (short 32), frying amber (oil +5%), packaging store shows the pouches just received. Machines move only while a run is in progress, so the line is idle. |
| 16 | 6:22 | **Summary** | Owner · `/benchmark` | Scroll the check table | **25/25** benchmark checks pass from posted records; 68 automated tests. "One ledger, from flour sack to GST invoice." |

Total: 6 minutes 43 seconds (the delivered video).

## Optional live production run (if you have extra time)

To show the twin react to production, sign in as **Production**, plan a Mixture run (`/production/new`), **Start** it, and open `/factory` in another tab: within 15 seconds the line shows *running* and the mixer, cooling conveyor and packing machine animate. Complete the run and the finished-goods racks gain cartons. (This changes stock; reset afterwards.)

## Producing the video

The committed scripts reproduce the narrated recording from scratch:

1. **Narration** (`demo/segments.json`, `say` text): synthesised offline with the Windows speech engine using the *Microsoft Heera (English, India)* voice at rate 1.1, one WAV per segment.
2. **Screen recording**: `demo/record-demo.mjs` drives the real app with Playwright, one recording per segment, timed to the narration (a cursor dot is drawn because headless recordings do not show the pointer).
3. **Assembly**: `demo/assemble-demo.mjs` trims and joins the segments with ffmpeg (H.264 + AAC, 1280×720), adds chapter titles, writes `demo/sutra-erp-demo.srt` from the `sub` text, burns the subtitles in (and embeds them as a soft track), and renders `demo/thumbnail.png` and `demo/narration.md`.

```bash
# environment used for the delivered video (adjust paths):
BASE=http://localhost:3000 AUDIO_DIR=<wav dir> OUT_DIR=<work dir> FFMPEG=<ffmpeg with libx264/libass> \
  PLAYWRIGHT_CORE=<path to playwright-core> node demo/record-demo.mjs
FFMPEG=<ffmpeg> AUDIO_DIR=<wav dir> OUT_DIR=<work dir> FONT=<path to segoeuib.ttf> node demo/assemble-demo.mjs
npm run benchmark:reset          # the recording posts a Mixture order and a packaging receipt
```

`demo/sutra-erp-demo.mp4` is git-ignored so it is not published with the public repository by accident; share it directly or upload it yourself.

### Recording it yourself instead

Use OBS Studio or the Windows Game Bar (Win + Alt + R) at 1280×720 or 1920×1080, follow the table above, and read the narration from `demo/narration.md`. Keep each segment to its time slot; total under 8 minutes.
