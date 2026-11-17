import { Prisma } from "@prisma/client";
import { D, Dec, formatIndian, pctOf, round2, sum } from "@/lib/decimal";
import { formatDate, isoDateIst } from "@/lib/dates";
import { prisma } from "../db";
import { reconcileInventory } from "../inventory";
import { AGEING_BUCKETS, customerBalances, openInvoices } from "../queries/receivables";
import type { ReportFilters } from "./filters";

/**
 * Report catalogue. Every report reads posted database transactions only (no cached or demo
 * figures). The same definition drives the on-screen table and the CSV / Excel / PDF exports.
 */
export type ColumnType = "text" | "date" | "money" | "qty" | "pct" | "number";
export interface Column {
  key: string;
  label: string;
  type: ColumnType;
}
export type Row = Record<string, string | number | null>;
export interface ReportSection {
  title: string;
  columns: Column[];
  rows: Row[];
  totals?: Row;
  notes?: string[];
}
export interface ReportResult {
  sections: ReportSection[];
}
export type FilterKind = "date" | "customer" | "product" | "type";
export type ReportGroup = "Sales" | "Purchases" | "Inventory" | "Production" | "Receivables" | "Audit";

export interface ReportDef {
  key: string;
  title: string;
  group: ReportGroup;
  description: string;
  filters: FilterKind[];
  typeOptions?: { value: string; label: string }[];
  run: (f: ReportFilters) => Promise<ReportResult>;
}

const m = (v: Prisma.Decimal | Dec | string | number | null | undefined) => (v === null || v === undefined ? null : round2(D(v)).toFixed(2));
const q = (v: Prisma.Decimal | Dec | string | number | null | undefined) => (v === null || v === undefined ? null : D(v).toDecimalPlaces(3).toFixed());
const pct = (v: Prisma.Decimal | Dec | string | null | undefined) => (v === null || v === undefined ? null : D(v).toDecimalPlaces(2).toFixed(2));
const totalOf = (rows: Row[], key: string) => sum(rows.map((r) => (r[key] === null ? 0 : String(r[key])))).toFixed(2);
const qtyTotal = (rows: Row[], key: string) => sum(rows.map((r) => (r[key] === null ? 0 : String(r[key])))).toFixed();
const inRange = (f: ReportFilters) => ({ gte: f.from, lt: f.to });

const MOVEMENT_TYPES = [
  "OPENING_STOCK", "PURCHASE_RECEIPT", "PRODUCTION_ISSUE", "PRODUCTION_OUTPUT", "SALES_DISPATCH", "CUSTOMER_RETURN",
  "SUPPLIER_RETURN", "STOCK_ADJUSTMENT", "PACKAGING_CONSUMPTION", "DAMAGED_MATERIAL",
] as const;
const label = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// ───────────────────────────── Sales ─────────────────────────────

async function salesRegister(f: ReportFilters): Promise<ReportResult> {
  const invoices = await prisma.invoice.findMany({
    where: {
      invoiceDate: inRange(f),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.productId ? { items: { some: { productId: f.productId } } } : {}),
      ...(f.type === "ISSUED" || f.type === "CANCELLED" ? { status: f.type } : {}),
    },
    orderBy: [{ invoiceDate: "asc" }, { sequence: "asc" }],
  });
  const rows: Row[] = invoices.map((i) => ({
    invoiceNo: i.invoiceNo,
    invoiceDate: isoDateIst(i.invoiceDate),
    customer: i.customerName,
    gstin: i.customerGstin ?? "Unregistered",
    pos: i.placeOfSupply,
    taxable: m(i.taxableTotal),
    cgst: m(i.cgstTotal),
    sgst: m(i.sgstTotal),
    igst: m(i.igstTotal),
    total: m(i.grandTotal),
    status: i.status === "CANCELLED" ? "Cancelled (credit note)" : "Issued",
  }));
  const active = rows.filter((r) => r.status === "Issued");
  return {
    sections: [
      {
        title: "Sales register",
        columns: [
          { key: "invoiceNo", label: "Invoice", type: "text" },
          { key: "invoiceDate", label: "Date", type: "date" },
          { key: "customer", label: "Customer", type: "text" },
          { key: "gstin", label: "GSTIN", type: "text" },
          { key: "pos", label: "Place of supply", type: "text" },
          { key: "taxable", label: "Taxable", type: "money" },
          { key: "cgst", label: "CGST", type: "money" },
          { key: "sgst", label: "SGST", type: "money" },
          { key: "igst", label: "IGST", type: "money" },
          { key: "total", label: "Invoice total", type: "money" },
          { key: "status", label: "Status", type: "text" },
        ],
        rows,
        totals: { invoiceNo: `${active.length} issued`, taxable: totalOf(active, "taxable"), cgst: totalOf(active, "cgst"), sgst: totalOf(active, "sgst"), igst: totalOf(active, "igst"), total: totalOf(active, "total") },
        notes: ["Totals exclude invoices cancelled through credit notes."],
      },
    ],
  };
}

async function invoiceLines(f: ReportFilters) {
  return prisma.invoiceItem.findMany({
    where: {
      invoice: { status: "ISSUED", invoiceDate: inRange(f), ...(f.customerId ? { customerId: f.customerId } : {}) },
      ...(f.productId ? { productId: f.productId } : {}),
    },
    include: { invoice: { select: { customerId: true, customerName: true, supplyType: true } }, product: { include: { item: true } } },
  });
}

async function customerSales(f: ReportFilters): Promise<ReportResult> {
  const lines = await invoiceLines(f);
  const customers = await prisma.customer.findMany();
  const groups = new Map<string, typeof lines>();
  for (const l of lines) groups.set(l.invoice.customerId, [...(groups.get(l.invoice.customerId) ?? []), l]);
  const rows: Row[] = [...groups.entries()].map(([cid, ls]) => {
    const c = customers.find((x) => x.id === cid)!;
    const taxable = sum(ls.map((l) => l.taxableValue));
    const tax = sum(ls.map((l) => D(l.cgstAmount).plus(l.sgstAmount).plus(l.igstAmount)));
    return {
      customer: c.name,
      type: label(c.type),
      state: c.state,
      invoices: new Set(ls.map((l) => l.invoiceId)).size,
      qty: q(sum(ls.map((l) => l.quantity))),
      taxable: m(taxable),
      tax: m(tax),
      total: m(taxable.plus(tax)),
    };
  });
  rows.sort((a, b) => D(String(b.taxable)).comparedTo(D(String(a.taxable))));
  return {
    sections: [
      {
        title: "Customer-wise sales",
        columns: [
          { key: "customer", label: "Customer", type: "text" },
          { key: "type", label: "Type", type: "text" },
          { key: "state", label: "State", type: "text" },
          { key: "invoices", label: "Invoices", type: "number" },
          { key: "qty", label: "Quantity", type: "qty" },
          { key: "taxable", label: "Taxable", type: "money" },
          { key: "tax", label: "GST", type: "money" },
          { key: "total", label: "Total", type: "money" },
        ],
        rows,
        totals: { customer: "Total", qty: qtyTotal(rows, "qty"), taxable: totalOf(rows, "taxable"), tax: totalOf(rows, "tax"), total: totalOf(rows, "total") },
      },
    ],
  };
}

async function productSales(f: ReportFilters): Promise<ReportResult> {
  const lines = await invoiceLines(f);
  const dispatchCost = await prisma.dispatchItem.findMany({
    where: { dispatch: { invoice: { status: "ISSUED", invoiceDate: inRange(f), ...(f.customerId ? { customerId: f.customerId } : {}) } }, ...(f.productId ? { productId: f.productId } : {}) },
  });
  const groups = new Map<string, typeof lines>();
  for (const l of lines) groups.set(l.productId, [...(groups.get(l.productId) ?? []), l]);
  const rows: Row[] = [...groups.entries()].map(([pid, ls]) => {
    const qty = sum(ls.map((l) => l.quantity));
    const taxable = sum(ls.map((l) => l.taxableValue));
    const cogs = sum(dispatchCost.filter((d) => d.productId === pid).map((d) => d.costValue));
    return {
      product: ls[0].product.item.name,
      sku: ls[0].product.sku,
      hsn: ls[0].product.hsnCode,
      qty: q(qty),
      avgRate: m(qty.gt(0) ? taxable.div(qty) : 0),
      taxable: m(taxable),
      tax: m(sum(ls.map((l) => D(l.cgstAmount).plus(l.sgstAmount).plus(l.igstAmount)))),
      cogs: m(cogs),
    };
  });
  return {
    sections: [
      {
        title: "Product-wise sales",
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "sku", label: "SKU", type: "text" },
          { key: "hsn", label: "HSN", type: "text" },
          { key: "qty", label: "Quantity", type: "qty" },
          { key: "avgRate", label: "Avg rate", type: "money" },
          { key: "taxable", label: "Taxable", type: "money" },
          { key: "tax", label: "GST", type: "money" },
          { key: "cogs", label: "Stock cost of dispatches", type: "money" },
        ],
        rows,
        totals: { product: "Total", qty: qtyTotal(rows, "qty"), taxable: totalOf(rows, "taxable"), tax: totalOf(rows, "tax"), cogs: totalOf(rows, "cogs") },
        notes: ["Stock cost = weighted-average inventory value released by the dispatch ledger entries."],
      },
    ],
  };
}

async function gstSummary(f: ReportFilters): Promise<ReportResult> {
  const lines = await invoiceLines(f);
  const key = (l: (typeof lines)[number]) => `${l.hsnCode}|${l.gstRate.toString()}|${l.invoice.supplyType}`;
  const groups = new Map<string, typeof lines>();
  for (const l of lines) groups.set(key(l), [...(groups.get(key(l)) ?? []), l]);
  const rows: Row[] = [...groups.values()].map((ls) => ({
    hsn: ls[0].hsnCode,
    description: ls[0].product.item.name,
    uqc: "PAC",
    supply: ls[0].invoice.supplyType === "INTRA_STATE" ? "Intra-state" : "Inter-state",
    rate: pct(ls[0].gstRate),
    qty: q(sum(ls.map((l) => l.quantity))),
    taxable: m(sum(ls.map((l) => l.taxableValue))),
    cgst: m(sum(ls.map((l) => l.cgstAmount))),
    sgst: m(sum(ls.map((l) => l.sgstAmount))),
    igst: m(sum(ls.map((l) => l.igstAmount))),
  }));
  const creditNotes = await prisma.creditNote.findMany({ where: { noteDate: inRange(f), ...(f.customerId ? { customerId: f.customerId } : {}) } });
  return {
    sections: [
      {
        title: "GST outward supplies (HSN-wise)",
        columns: [
          { key: "hsn", label: "HSN", type: "text" },
          { key: "description", label: "Description", type: "text" },
          { key: "uqc", label: "UQC", type: "text" },
          { key: "supply", label: "Supply", type: "text" },
          { key: "rate", label: "GST %", type: "pct" },
          { key: "qty", label: "Quantity", type: "qty" },
          { key: "taxable", label: "Taxable value", type: "money" },
          { key: "cgst", label: "CGST", type: "money" },
          { key: "sgst", label: "SGST", type: "money" },
          { key: "igst", label: "IGST", type: "money" },
        ],
        rows,
        totals: { hsn: "Total", qty: qtyTotal(rows, "qty"), taxable: totalOf(rows, "taxable"), cgst: totalOf(rows, "cgst"), sgst: totalOf(rows, "sgst"), igst: totalOf(rows, "igst") },
        notes: ["Demonstration of GST computation only; not a GSTR-1 filing and not certified for government APIs."],
      },
      {
        title: "Credit notes issued (tax reversed)",
        columns: [
          { key: "no", label: "Credit note", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "taxable", label: "Taxable", type: "money" },
          { key: "cgst", label: "CGST", type: "money" },
          { key: "sgst", label: "SGST", type: "money" },
          { key: "igst", label: "IGST", type: "money" },
          { key: "total", label: "Total", type: "money" },
        ],
        rows: creditNotes.map((c) => ({ no: c.creditNoteNo, date: isoDateIst(c.noteDate), taxable: m(c.taxableTotal), cgst: m(c.cgstTotal), sgst: m(c.sgstTotal), igst: m(c.igstTotal), total: m(c.grandTotal) })),
      },
    ],
  };
}

// ───────────────────────────── Purchases ─────────────────────────────

async function purchaseRegister(f: ReportFilters): Promise<ReportResult> {
  const lines = await prisma.purchaseItem.findMany({
    where: { purchase: { receivedDate: inRange(f) } },
    include: { purchase: { include: { supplier: true } }, item: true, unit: true },
    orderBy: [{ purchase: { receivedDate: "asc" } }],
  });
  const rows: Row[] = lines.map((l) => ({
    purchaseNo: l.purchase.purchaseNo,
    date: isoDateIst(l.purchase.receivedDate),
    supplier: l.purchase.supplier.name,
    supplierInvoice: l.purchase.supplierInvoiceNo,
    item: l.item.name,
    qty: q(l.quantity),
    unit: l.unit.code,
    rate: m(l.rate),
    taxable: m(l.taxableValue),
    gstRate: pct(l.gstRate),
    tax: m(l.taxAmount),
    total: m(l.lineTotal),
  }));
  return {
    sections: [
      {
        title: "Purchase register",
        columns: [
          { key: "purchaseNo", label: "Purchase", type: "text" },
          { key: "date", label: "Received", type: "date" },
          { key: "supplier", label: "Supplier", type: "text" },
          { key: "supplierInvoice", label: "Supplier inv.", type: "text" },
          { key: "item", label: "Item", type: "text" },
          { key: "qty", label: "Qty", type: "qty" },
          { key: "unit", label: "Unit", type: "text" },
          { key: "rate", label: "Rate", type: "money" },
          { key: "taxable", label: "Taxable", type: "money" },
          { key: "gstRate", label: "GST %", type: "pct" },
          { key: "tax", label: "Input GST", type: "money" },
          { key: "total", label: "Total", type: "money" },
        ],
        rows,
        totals: { purchaseNo: "Total", taxable: totalOf(rows, "taxable"), tax: totalOf(rows, "tax"), total: totalOf(rows, "total") },
      },
    ],
  };
}

// ───────────────────────────── Inventory ─────────────────────────────

async function stockReport(f: ReportFilters, kind: "RAW_MATERIAL" | "PACKAGING_MATERIAL" | "FINISHED_GOOD", title: string): Promise<ReportResult> {
  const rows = await prisma.$queryRaw<
    { code: string; name: string; unit: string; reorder: unknown; oq: unknown; iq: unknown; xq: unknown; cv: unknown }[]
  >`
    SELECT i."code", i."name", u."code" AS unit, i."reorderLevel" AS reorder,
      COALESCE(SUM(t."quantity") FILTER (WHERE t."txnDate" < ${f.from}), 0) AS oq,
      COALESCE(SUM(t."quantity") FILTER (WHERE t."txnDate" >= ${f.from} AND t."txnDate" < ${f.to} AND t."quantity" > 0), 0) AS iq,
      COALESCE(SUM(t."quantity") FILTER (WHERE t."txnDate" >= ${f.from} AND t."txnDate" < ${f.to} AND t."quantity" < 0), 0) AS xq,
      COALESCE(SUM(t."value") FILTER (WHERE t."txnDate" < ${f.to}), 0) AS cv
    FROM "Item" i
    JOIN "Unit" u ON u."id" = i."unitId"
    LEFT JOIN "InventoryTransaction" t ON t."itemId" = i."id"
    WHERE i."kind" = ${kind}::"ItemKind"
    GROUP BY i."id", i."code", i."name", u."code", i."reorderLevel"
    ORDER BY i."code"`;
  const out: Row[] = rows.map((r) => {
    const closing = D(String(r.oq)).plus(D(String(r.iq))).plus(D(String(r.xq)));
    const value = D(String(r.cv));
    return {
      code: r.code,
      name: r.name,
      unit: r.unit,
      opening: q(String(r.oq)),
      inward: q(String(r.iq)),
      outward: q(D(String(r.xq)).abs()),
      closing: q(closing),
      avgCost: closing.gt(0) ? value.div(closing).toDecimalPlaces(4).toFixed(4) : "0.0000",
      value: m(value),
      reorder: q(String(r.reorder)),
      status: closing.lte(D(String(r.reorder))) ? "Reorder" : "OK",
    };
  });
  return {
    sections: [
      {
        title,
        columns: [
          { key: "code", label: "Code", type: "text" },
          { key: "name", label: "Item", type: "text" },
          { key: "unit", label: "Unit", type: "text" },
          { key: "opening", label: "Opening", type: "qty" },
          { key: "inward", label: "In", type: "qty" },
          { key: "outward", label: "Out", type: "qty" },
          { key: "closing", label: "Closing", type: "qty" },
          { key: "avgCost", label: "Avg cost", type: "money" },
          { key: "value", label: "Closing value", type: "money" },
          { key: "reorder", label: "Reorder level", type: "qty" },
          { key: "status", label: "Status", type: "text" },
        ],
        rows: out,
        totals: { code: "Total", value: totalOf(out, "value") },
        notes: [`Quantities and weighted-average values derived from the stock ledger for ${formatDate(f.from)} – ${f.toStr}.`],
      },
    ],
  };
}

async function stockLedger(f: ReportFilters): Promise<ReportResult> {
  const product = f.productId ? await prisma.product.findUnique({ where: { id: f.productId } }) : null;
  const txns = await prisma.inventoryTransaction.findMany({
    where: {
      txnDate: inRange(f),
      ...(product ? { itemId: product.itemId } : {}),
      ...(f.type && (MOVEMENT_TYPES as readonly string[]).includes(f.type) ? { movementType: f.type as (typeof MOVEMENT_TYPES)[number] } : {}),
    },
    include: { item: { include: { unit: true } }, createdBy: { select: { name: true } } },
    orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
  });
  return {
    sections: [
      {
        title: "Stock movement ledger",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "item", label: "Item", type: "text" },
          { key: "type", label: "Movement", type: "text" },
          { key: "qty", label: "Qty", type: "qty" },
          { key: "unit", label: "Unit", type: "text" },
          { key: "before", label: "Before", type: "qty" },
          { key: "after", label: "After", type: "qty" },
          { key: "rate", label: "Rate", type: "money" },
          { key: "value", label: "Value", type: "money" },
          { key: "ref", label: "Source", type: "text" },
          { key: "batch", label: "Batch", type: "text" },
          { key: "user", label: "User", type: "text" },
        ],
        rows: txns.map((t) => ({
          date: isoDateIst(t.txnDate),
          item: t.item.name,
          type: label(t.movementType),
          qty: q(t.quantity),
          unit: t.item.unit.code,
          before: q(t.balanceBefore),
          after: q(t.balanceAfter),
          rate: D(t.unitCost).toDecimalPlaces(4).toFixed(4),
          value: m(t.value),
          ref: t.sourceRef,
          batch: t.batchNo ?? "",
          user: t.createdBy.name,
        })),
      },
    ],
  };
}

// ───────────────────────────── Production ─────────────────────────────

async function runsInRange(f: ReportFilters) {
  return prisma.productionRun.findMany({
    where: { status: "COMPLETED", completedAt: inRange(f), ...(f.productId ? { productId: f.productId } : {}) },
    include: { product: { include: { item: true } }, bomVersion: { include: { bom: true } }, materials: { include: { item: { include: { unit: true } } } } },
    orderBy: { completedAt: "asc" },
  });
}

async function productionReport(f: ReportFilters): Promise<ReportResult> {
  const runs = await runsInRange(f);
  const rows: Row[] = runs.map((r) => ({
    runNo: r.runNo,
    date: isoDateIst(r.completedAt!),
    product: r.product.item.name,
    bom: `${r.bomVersion.bom.code} v${r.bomVersion.versionNo}`,
    batch: r.batchNo ?? "",
    planned: q(r.plannedOutput),
    expected: q(r.expectedOutput),
    good: q(r.actualGoodOutput),
    yieldPct: pct(r.actualYieldPct),
    yieldVar: pct(r.yieldVariancePct),
    totalCost: m(r.totalCost),
    alert: r.hasVarianceAlert ? "Variance > tolerance" : "Within tolerance",
  }));
  return {
    sections: [
      {
        title: "Production report",
        columns: [
          { key: "runNo", label: "Run", type: "text" },
          { key: "date", label: "Completed", type: "date" },
          { key: "product", label: "Product", type: "text" },
          { key: "bom", label: "BOM", type: "text" },
          { key: "batch", label: "Batch no.", type: "text" },
          { key: "planned", label: "Planned", type: "qty" },
          { key: "expected", label: "Expected", type: "qty" },
          { key: "good", label: "Good output", type: "qty" },
          { key: "yieldPct", label: "Yield %", type: "pct" },
          { key: "yieldVar", label: "Yield var %", type: "pct" },
          { key: "totalCost", label: "Total cost", type: "money" },
          { key: "alert", label: "Variance", type: "text" },
        ],
        rows,
        totals: { runNo: `${rows.length} runs`, planned: qtyTotal(rows, "planned"), good: qtyTotal(rows, "good"), totalCost: totalOf(rows, "totalCost") },
      },
    ],
  };
}

async function plannedVsActual(f: ReportFilters): Promise<ReportResult> {
  const runs = await runsInRange(f);
  const rows: Row[] = runs.flatMap((r) =>
    r.materials.map((mat) => {
      const total = D(mat.actualQty ?? 0).plus(mat.damagedQty);
      return {
        runNo: r.runNo,
        product: r.product.item.name,
        material: mat.item.name,
        unit: mat.item.unit.code,
        planned: q(mat.plannedQty),
        actual: q(mat.actualQty),
        damaged: q(mat.damagedQty),
        total: q(total),
        diff: q(total.minus(mat.plannedQty)),
        variance: pct(mat.variancePct),
        cost: m(mat.totalCost),
        flag: mat.isFlagged ? "Flagged" : "OK",
      };
    }),
  );
  return {
    sections: [
      {
        title: "Planned versus actual material consumption",
        columns: [
          { key: "runNo", label: "Run", type: "text" },
          { key: "product", label: "Product", type: "text" },
          { key: "material", label: "Material", type: "text" },
          { key: "unit", label: "Unit", type: "text" },
          { key: "planned", label: "Planned (BOM)", type: "qty" },
          { key: "actual", label: "Used", type: "qty" },
          { key: "damaged", label: "Damaged", type: "qty" },
          { key: "total", label: "Total issued", type: "qty" },
          { key: "diff", label: "Difference", type: "qty" },
          { key: "variance", label: "Variance %", type: "pct" },
          { key: "cost", label: "Cost", type: "money" },
          { key: "flag", label: "Flag", type: "text" },
        ],
        rows,
        totals: { runNo: "Total", cost: totalOf(rows, "cost") },
        notes: ["Variance % = (total issued − BOM standard for the planned batches) ÷ standard × 100. Flagged when |variance| exceeds the tolerance stored on the run."],
      },
    ],
  };
}

async function yieldWastage(f: ReportFilters): Promise<ReportResult> {
  const runs = await runsInRange(f);
  const rows: Row[] = runs.map((r) => {
    const damagedValue = sum(
      r.materials.filter((mat) => D(mat.damagedQty).gt(0)).map((mat) => D(mat.damagedQty).times(D(mat.unitCost ?? 0))),
    );
    const damagedQty = r.materials.filter((mat) => D(mat.damagedQty).gt(0)).map((mat) => `${q(mat.damagedQty)} ${mat.item.unit.code} ${mat.item.name}`).join("; ");
    return {
      runNo: r.runNo,
      product: r.product.item.name,
      expected: q(r.expectedOutput),
      good: q(r.actualGoodOutput),
      loss: q(D(r.expectedOutput).minus(D(r.actualGoodOutput ?? 0))),
      yieldPct: pct(r.actualYieldPct),
      yieldVar: pct(r.yieldVariancePct),
      damaged: damagedQty || "—",
      damagedValue: m(damagedValue),
      scrap: r.scrapQty ? `${q(r.scrapQty)} kg` : "—",
    };
  });
  return {
    sections: [
      {
        title: "Yield and wastage",
        columns: [
          { key: "runNo", label: "Run", type: "text" },
          { key: "product", label: "Product", type: "text" },
          { key: "expected", label: "Expected", type: "qty" },
          { key: "good", label: "Good", type: "qty" },
          { key: "loss", label: "Yield loss", type: "qty" },
          { key: "yieldPct", label: "Actual yield %", type: "pct" },
          { key: "yieldVar", label: "Yield var %", type: "pct" },
          { key: "damaged", label: "Damaged material", type: "text" },
          { key: "damagedValue", label: "Damage value", type: "money" },
          { key: "scrap", label: "Scrap", type: "text" },
        ],
        rows,
        totals: { runNo: "Total", expected: qtyTotal(rows, "expected"), good: qtyTotal(rows, "good"), loss: qtyTotal(rows, "loss"), damagedValue: totalOf(rows, "damagedValue") },
      },
    ],
  };
}

async function costPerPacket(f: ReportFilters): Promise<ReportResult> {
  const runs = await runsInRange(f);
  const rows: Row[] = runs.map((r) => ({
    runNo: r.runNo,
    product: r.product.item.name,
    material: m(r.materialCost),
    packaging: m(r.packagingCost),
    labour: m(r.labourCost),
    energy: m(r.energyCost),
    overhead: m(r.overheadCost),
    total: m(r.totalCost),
    good: q(r.actualGoodOutput),
    cpu: r.costPerUnit ? D(r.costPerUnit).toDecimalPlaces(2).toFixed(2) : null,
    price: m(r.sellingPrice),
    margin: r.grossMarginPerUnit ? D(r.grossMarginPerUnit).toDecimalPlaces(2).toFixed(2) : null,
    marginPct: pct(r.marginPct),
  }));
  return {
    sections: [
      {
        title: "Cost per packet",
        columns: [
          { key: "runNo", label: "Run", type: "text" },
          { key: "product", label: "Product", type: "text" },
          { key: "material", label: "Raw material", type: "money" },
          { key: "packaging", label: "Packaging", type: "money" },
          { key: "labour", label: "Labour", type: "money" },
          { key: "energy", label: "Gas & power", type: "money" },
          { key: "overhead", label: "Other overhead", type: "money" },
          { key: "total", label: "Total cost", type: "money" },
          { key: "good", label: "Good packets", type: "qty" },
          { key: "cpu", label: "Cost / packet", type: "money" },
          { key: "price", label: "Selling price", type: "money" },
          { key: "margin", label: "Margin / packet", type: "money" },
          { key: "marginPct", label: "Margin %", type: "pct" },
        ],
        rows,
        totals: { runNo: "Total", material: totalOf(rows, "material"), packaging: totalOf(rows, "packaging"), labour: totalOf(rows, "labour"), energy: totalOf(rows, "energy"), overhead: totalOf(rows, "overhead"), total: totalOf(rows, "total"), good: qtyTotal(rows, "good") },
        notes: ["Materials at weighted-average cost when issued (frozen at completion). Damaged packaging is included in packaging cost. Overheads are charged directly to the run or allocated by good output."],
      },
    ],
  };
}

// ───────────────────────────── Receivables ─────────────────────────────

async function collections(f: ReportFilters): Promise<ReportResult> {
  const payments = await prisma.payment.findMany({
    where: { paymentDate: inRange(f), ...(f.customerId ? { customerId: f.customerId } : {}), ...(f.type ? { mode: f.type as "CASH" } : {}) },
    include: { customer: true, allocations: { include: { invoice: { select: { invoiceNo: true } } } } },
    orderBy: { paymentDate: "asc" },
  });
  const rows: Row[] = payments.map((p) => {
    const allocated = sum(p.allocations.map((a) => a.amount));
    return {
      receiptNo: p.receiptNo,
      date: isoDateIst(p.paymentDate),
      customer: p.customer.name,
      mode: label(p.mode),
      reference: p.reference ?? "",
      invoices: p.allocations.map((a) => `${a.invoice.invoiceNo} (${m(a.amount)})`).join(", ") || "—",
      amount: m(p.amount),
      allocated: m(allocated),
      onAccount: m(D(p.amount).minus(allocated)),
    };
  });
  return {
    sections: [
      {
        title: "Payment collections",
        columns: [
          { key: "receiptNo", label: "Receipt", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "customer", label: "Customer", type: "text" },
          { key: "mode", label: "Mode", type: "text" },
          { key: "reference", label: "Reference", type: "text" },
          { key: "invoices", label: "Allocated to", type: "text" },
          { key: "amount", label: "Amount", type: "money" },
          { key: "allocated", label: "Allocated", type: "money" },
          { key: "onAccount", label: "On account", type: "money" },
        ],
        rows,
        totals: { receiptNo: `${rows.length} receipts`, amount: totalOf(rows, "amount"), allocated: totalOf(rows, "allocated"), onAccount: totalOf(rows, "onAccount") },
      },
    ],
  };
}

async function outstanding(f: ReportFilters): Promise<ReportResult> {
  const asOf = f.to;
  const invoices = await openInvoices({ customerId: f.customerId, asOf });
  const balances = await customerBalances(f.customerId);
  const customers = await prisma.customer.findMany({ where: f.customerId ? { id: f.customerId } : {} });
  const rows: Row[] = invoices.map((i) => ({
    invoiceNo: i.invoiceNo,
    date: isoDateIst(i.invoiceDate),
    due: isoDateIst(i.dueDate),
    customer: i.customerName,
    total: m(i.grandTotal),
    paid: m(i.paid),
    balance: m(i.balance),
    overdue: i.daysPastDue > 0 ? i.daysPastDue : 0,
    bucket: i.bucket,
  }));
  const summary: Row[] = customers
    .map((c) => {
      const b = balances.get(c.id);
      if (!b) return null;
      return {
        customer: c.name,
        invoiced: m(b.invoiced),
        received: m(b.received),
        onAccount: m(b.onAccount),
        outstanding: m(b.outstanding),
        creditLimit: m(c.creditLimit),
        utilisation: pct(pctOf(b.outstanding, c.creditLimit, 2)),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return {
    sections: [
      {
        title: "Outstanding receivables by customer",
        columns: [
          { key: "customer", label: "Customer", type: "text" },
          { key: "invoiced", label: "Invoiced", type: "money" },
          { key: "received", label: "Received", type: "money" },
          { key: "onAccount", label: "Unallocated credit", type: "money" },
          { key: "outstanding", label: "Outstanding", type: "money" },
          { key: "creditLimit", label: "Credit limit", type: "money" },
          { key: "utilisation", label: "Limit used %", type: "pct" },
        ],
        rows: summary,
        totals: { customer: "Total", invoiced: totalOf(summary, "invoiced"), received: totalOf(summary, "received"), outstanding: totalOf(summary, "outstanding") },
      },
      {
        title: "Open invoices",
        columns: [
          { key: "invoiceNo", label: "Invoice", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "due", label: "Due", type: "date" },
          { key: "customer", label: "Customer", type: "text" },
          { key: "total", label: "Total", type: "money" },
          { key: "paid", label: "Paid", type: "money" },
          { key: "balance", label: "Balance", type: "money" },
          { key: "overdue", label: "Days overdue", type: "number" },
          { key: "bucket", label: "Ageing", type: "text" },
        ],
        rows,
        totals: { invoiceNo: "Total", total: totalOf(rows, "total"), paid: totalOf(rows, "paid"), balance: totalOf(rows, "balance") },
      },
    ],
  };
}

async function ageing(f: ReportFilters): Promise<ReportResult> {
  const invoices = await openInvoices({ customerId: f.customerId, asOf: f.to });
  const byCustomer = new Map<string, Row>();
  for (const i of invoices) {
    const row = byCustomer.get(i.customerId) ?? { customer: i.customerName, ...Object.fromEntries(AGEING_BUCKETS.map((b) => [b, "0.00"])), total: "0.00" };
    row[i.bucket] = D(String(row[i.bucket])).plus(i.balance).toFixed(2);
    row.total = D(String(row.total)).plus(i.balance).toFixed(2);
    byCustomer.set(i.customerId, row);
  }
  const rows = [...byCustomer.values()];
  return {
    sections: [
      {
        title: "Receivables ageing (by days past due date)",
        columns: [{ key: "customer", label: "Customer", type: "text" }, ...AGEING_BUCKETS.map((b) => ({ key: b, label: b, type: "money" as const })), { key: "total", label: "Total", type: "money" }],
        rows,
        totals: { customer: "Total", ...Object.fromEntries(AGEING_BUCKETS.map((b) => [b, totalOf(rows, b)])), total: totalOf(rows, "total") },
        notes: [`Ageing as of ${f.toStr}, based on invoice balances after allocated receipts. Due date = invoice date + customer payment terms.`],
      },
    ],
  };
}

// ───────────────────────────── Audit ─────────────────────────────

async function auditTrail(f: ReportFilters): Promise<ReportResult> {
  const logs = await prisma.auditLog.findMany({
    where: { createdAt: inRange(f), ...(f.type ? { action: { startsWith: f.type } } : {}) },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  return {
    sections: [
      {
        title: "Audit trail",
        columns: [
          { key: "time", label: "Time (IST)", type: "text" },
          { key: "user", label: "User", type: "text" },
          { key: "action", label: "Action", type: "text" },
          { key: "summary", label: "Details", type: "text" },
        ],
        rows: logs.map((l) => ({
          time: new Date(l.createdAt.getTime() + 330 * 60000).toISOString().slice(0, 16).replace("T", " "),
          user: l.user ? `${l.user.name}` : "System",
          action: l.action,
          summary: l.summary,
        })),
      },
    ],
  };
}

async function monthlyAudit(f: ReportFilters): Promise<ReportResult> {
  const [sales, gst, purchases, raw, pack, fg, prod, pva, cpp, coll, out, age, trail] = await Promise.all([
    salesRegister(f), gstSummary(f), purchaseRegister(f),
    stockReport(f, "RAW_MATERIAL", "Raw-material stock"), stockReport(f, "PACKAGING_MATERIAL", "Packaging stock"), stockReport(f, "FINISHED_GOOD", "Finished-goods stock"),
    productionReport(f), plannedVsActual(f), costPerPacket(f), collections(f), outstanding(f), ageing(f), auditTrail(f),
  ]);
  const recon = await prisma.$transaction((tx) => reconcileInventory(tx));
  const mismatches = recon.filter((r) => !r.matches);
  const salesTotals = sales.sections[0].totals!;
  const runs = prod.sections[0].rows;
  const rs = (v: unknown) => `₹${formatIndian(String(v ?? 0))}`;
  const summary: Row[] = [
    { metric: "Sales – taxable value (issued invoices)", value: rs(salesTotals.taxable) },
    { metric: "Output GST (CGST + SGST + IGST)", value: rs(sum([String(salesTotals.cgst), String(salesTotals.sgst), String(salesTotals.igst)]).toFixed(2)) },
    { metric: "Purchases – taxable value", value: rs(purchases.sections[0].totals!.taxable) },
    { metric: "Production runs completed", value: String(runs.length) },
    { metric: "Good units produced", value: String(prod.sections[0].totals!.good) },
    { metric: "Runs with variance beyond tolerance", value: String(runs.filter((r) => r.alert !== "Within tolerance").length) },
    { metric: "Collections received", value: rs(coll.sections[0].totals!.amount) },
    { metric: "Outstanding receivables (as of period end)", value: rs(out.sections[0].totals!.outstanding) },
    { metric: "Closing raw-material value", value: rs(raw.sections[0].totals!.value) },
    { metric: "Closing packaging value", value: rs(pack.sections[0].totals!.value) },
    { metric: "Closing finished-goods value", value: rs(fg.sections[0].totals!.value) },
    { metric: "Stock ledger reconciliation", value: mismatches.length ? `${mismatches.length} item(s) differ` : `All ${recon.length} items reconcile` },
    { metric: "Audit-trail entries", value: String(trail.sections[0].rows.length) },
  ];
  return {
    sections: [
      { title: `Monthly audit summary (${f.fromStr} to ${f.toStr})`, columns: [{ key: "metric", label: "Metric", type: "text" }, { key: "value", label: "Value", type: "text" }], rows: summary },
      ...sales.sections, ...gst.sections, ...purchases.sections, ...raw.sections, ...pack.sections, ...fg.sections,
      ...prod.sections, ...pva.sections, ...cpp.sections, ...coll.sections, ...out.sections, ...age.sections, ...trail.sections,
    ],
  };
}

export const REPORTS: ReportDef[] = [
  { key: "sales-register", title: "Sales register", group: "Sales", description: "Every GST invoice with tax split and status.", filters: ["date", "customer", "product", "type"], typeOptions: [{ value: "ISSUED", label: "Issued" }, { value: "CANCELLED", label: "Cancelled" }], run: salesRegister },
  { key: "customer-sales", title: "Customer-wise sales", group: "Sales", description: "Invoiced quantity and value per customer.", filters: ["date", "customer", "product"], run: customerSales },
  { key: "product-sales", title: "Product-wise sales", group: "Sales", description: "Quantity, value and stock cost per product.", filters: ["date", "customer", "product"], run: productSales },
  { key: "gst-summary", title: "GST outward supply summary", group: "Sales", description: "HSN-wise taxable value with CGST, SGST and IGST.", filters: ["date", "customer", "product"], run: gstSummary },
  { key: "purchase-register", title: "Purchase register", group: "Purchases", description: "Supplier invoices and goods received.", filters: ["date"], run: purchaseRegister },
  { key: "raw-material-stock", title: "Raw-material stock", group: "Inventory", description: "Opening, in, out, closing and value.", filters: ["date"], run: (f) => stockReport(f, "RAW_MATERIAL", "Raw-material stock") },
  { key: "packaging-stock", title: "Packaging stock", group: "Inventory", description: "Pouches, cartons and other packaging.", filters: ["date"], run: (f) => stockReport(f, "PACKAGING_MATERIAL", "Packaging stock") },
  { key: "finished-goods-stock", title: "Finished-goods stock", group: "Inventory", description: "Packets by product with valuation.", filters: ["date"], run: (f) => stockReport(f, "FINISHED_GOOD", "Finished-goods stock") },
  { key: "stock-ledger", title: "Stock movement ledger", group: "Inventory", description: "Every stock movement with balances and source document.", filters: ["date", "product", "type"], typeOptions: MOVEMENT_TYPES.map((t) => ({ value: t, label: label(t) })), run: stockLedger },
  { key: "production", title: "Production report", group: "Production", description: "Completed runs, output, yield and cost.", filters: ["date", "product"], run: productionReport },
  { key: "planned-vs-actual", title: "Planned vs actual material", group: "Production", description: "BOM standard against actual issue per material.", filters: ["date", "product"], run: plannedVsActual },
  { key: "yield-wastage", title: "Yield and wastage", group: "Production", description: "Yield loss, damaged material and scrap.", filters: ["date", "product"], run: yieldWastage },
  { key: "cost-per-packet", title: "Cost per packet", group: "Production", description: "Run costing snapshot and margin.", filters: ["date", "product"], run: costPerPacket },
  { key: "collections", title: "Payment collections", group: "Receivables", description: "Receipts and how they were allocated.", filters: ["date", "customer", "type"], typeOptions: ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].map((t) => ({ value: t, label: label(t) })), run: collections },
  { key: "outstanding", title: "Outstanding receivables", group: "Receivables", description: "Customer balances and open invoices.", filters: ["date", "customer"], run: outstanding },
  { key: "receivables-ageing", title: "Receivables ageing", group: "Receivables", description: "Open balances by days past due.", filters: ["date", "customer"], run: ageing },
  { key: "audit-trail", title: "Audit trail", group: "Audit", description: "Who changed what, and when.", filters: ["date", "type"], run: auditTrail },
  { key: "monthly-audit", title: "Consolidated monthly audit report", group: "Audit", description: "All registers, stock, production, receivables, reconciliation and audit trail for the period.", filters: ["date"], run: monthlyAudit },
];

export function getReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}
