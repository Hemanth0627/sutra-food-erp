import { D, Dec, max, pctOf, round2, sum } from "@/lib/decimal";
import { addDays, addIstMonths, formatMonthKey, isoDateIst, monthKey, startOfIstDay, startOfIstMonth } from "@/lib/dates";
import { prisma } from "../db";
import { orderAvailability } from "../services/availability";
import { customerBalances, openInvoices } from "./receivables";

export async function salesKpis(now = new Date(), from?: Date) {
  const today = startOfIstDay(now);
  const month = from ?? startOfIstMonth(now);
  const [todaySales, monthSales, totalOrders, pendingOrders, monthInvoices] = await Promise.all([
    prisma.invoice.aggregate({ where: { status: "ISSUED", invoiceDate: { gte: today } }, _sum: { taxableTotal: true, grandTotal: true } }),
    prisma.invoice.aggregate({ where: { status: "ISSUED", invoiceDate: { gte: month } }, _sum: { taxableTotal: true, grandTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true } }),
    prisma.salesOrder.count(),
    prisma.salesOrder.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({ where: { status: "ISSUED", invoiceDate: { gte: month } } }),
  ]);
  return {
    todaySales: D(todaySales._sum.taxableTotal ?? 0),
    monthRevenue: D(monthSales._sum.taxableTotal ?? 0),
    monthGross: D(monthSales._sum.grandTotal ?? 0),
    monthGst: D(monthSales._sum.cgstTotal ?? 0).plus(D(monthSales._sum.sgstTotal ?? 0)).plus(D(monthSales._sum.igstTotal ?? 0)),
    totalOrders,
    pendingOrders,
    monthInvoices,
  };
}

export async function stockSummary() {
  const balances = await prisma.inventoryBalance.findMany({ include: { item: { include: { unit: true } } } });
  const byKind = (k: string) => balances.filter((b) => b.item.kind === k);
  const lowStock = balances
    .filter((b) => b.item.isActive && D(b.quantity).lte(D(b.item.reorderLevel)))
    .map((b) => ({ itemId: b.itemId, code: b.item.code, name: b.item.name, kind: b.item.kind, unit: b.item.unit.code, quantity: D(b.quantity), reorderLevel: D(b.item.reorderLevel) }));
  return {
    rawValue: sum(byKind("RAW_MATERIAL").map((b) => b.value)),
    packagingValue: sum(byKind("PACKAGING_MATERIAL").map((b) => b.value)),
    fgValue: sum(byKind("FINISHED_GOOD").map((b) => b.value)),
    fgQty: sum(byKind("FINISHED_GOOD").map((b) => b.quantity)),
    lowStock,
  };
}

export async function productionKpis(now = new Date(), from?: Date) {
  const month = from ?? startOfIstMonth(now);
  const [completed, active, flagged] = await Promise.all([
    prisma.productionRun.findMany({ where: { status: "COMPLETED", completedAt: { gte: month } }, select: { actualGoodOutput: true, plannedOutput: true, totalCost: true } }),
    prisma.productionRun.count({ where: { status: { in: ["PLANNED", "IN_PROGRESS"] } } }),
    prisma.productionRun.findMany({
      where: { status: "COMPLETED", hasVarianceAlert: true },
      include: { product: { include: { item: true } }, materials: { where: { isFlagged: true }, include: { item: true } } },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
  ]);
  const good = sum(completed.map((r) => r.actualGoodOutput ?? 0));
  const planned = sum(completed.map((r) => r.plannedOutput));
  return { monthOutput: good, monthPlanned: planned, monthYieldPct: pctOf(good, planned, 2), runsCompleted: completed.length, activeRuns: active, flaggedRuns: flagged };
}

export async function receivablesKpis(now = new Date(), from?: Date) {
  const month = from ?? startOfIstMonth(now);
  const [balances, collected, open] = await Promise.all([
    customerBalances(),
    prisma.payment.aggregate({ where: { paymentDate: { gte: month } }, _sum: { amount: true }, _count: true }),
    openInvoices({ asOf: now }),
  ]);
  const outstanding = sum([...balances.values()].map((b) => b.outstanding));
  const overdue = open.filter((i) => i.daysPastDue > 0);
  return {
    outstanding,
    collectedThisMonth: D(collected._sum.amount ?? 0),
    receiptsThisMonth: collected._count,
    overdueAmount: sum(overdue.map((i) => i.balance)),
    overdueCount: overdue.length,
    openInvoices: open,
  };
}

/** Taxable sales per month for the last `months` months (IST), from issued invoices. */
export async function monthlySales(months = 6, now = new Date()) {
  const start = addIstMonths(startOfIstMonth(now), -(months - 1));
  const invoices = await prisma.invoice.findMany({ where: { status: "ISSUED", invoiceDate: { gte: start } }, select: { invoiceDate: true, taxableTotal: true } });
  const keys = Array.from({ length: months }, (_, i) => monthKey(addIstMonths(start, i)));
  return keys.map((k) => ({
    month: formatMonthKey(k),
    sales: Number(sum(invoices.filter((i) => monthKey(i.invoiceDate) === k).map((i) => i.taxableTotal)).toFixed(2)),
  }));
}

/**
 * Stock value moved in and out of the ledger per day (or per month for periods over 45 days),
 * across raw materials, packaging and finished goods. Values, not quantities, so units can be mixed.
 */
export async function inventoryMovement(from: Date, now = new Date()) {
  const rows = await prisma.inventoryTransaction.findMany({
    where: { txnDate: { gte: from, lte: now }, movementType: { not: "OPENING_STOCK" } },
    select: { txnDate: true, value: true },
  });
  const monthly = now.getTime() - from.getTime() > 45 * 86400000;
  const keyOf = (d: Date) => (monthly ? monthKey(d) : isoDateIst(d));
  const keys: string[] = [];
  if (monthly) for (let m = startOfIstMonth(from); m <= now; m = addIstMonths(m, 1)) keys.push(monthKey(m));
  else for (let d = startOfIstDay(from); d <= now; d = addDays(d, 1)) keys.push(isoDateIst(d));
  return keys.map((k) => {
    const inPeriod = rows.filter((r) => keyOf(r.txnDate) === k);
    return {
      label: monthly ? formatMonthKey(k) : k.slice(8, 10) + " " + new Date(k + "T00:00:00Z").toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
      inward: Number(sum(inPeriod.filter((r) => D(r.value).gt(0)).map((r) => r.value)).toFixed(2)),
      outward: Number(sum(inPeriod.filter((r) => D(r.value).lt(0)).map((r) => D(r.value).abs())).toFixed(2)),
    };
  });
}

/** Planned vs good output for recent completed runs. */
export async function productionPerformance(limit = 8) {
  const runs = await prisma.productionRun.findMany({
    where: { status: "COMPLETED" },
    include: { product: { include: { item: true } } },
    orderBy: { completedAt: "desc" },
    take: limit,
  });
  return runs.reverse().map((r) => ({
    run: `${r.runNo.split("/").pop()} ${r.product.item.name.replace(" 200 g", "")}`,
    expected: Number(D(r.expectedOutput).toFixed(3)),
    good: Number(D(r.actualGoodOutput ?? 0).toFixed(3)),
  }));
}

/**
 * Product profitability: revenue from issued invoices vs. cost at the latest production costing
 * snapshot (full absorbed cost per packet). Falls back to the weighted-average stock cost when a
 * product has never been produced in the system.
 */
export async function productProfitability(from?: Date) {
  const lines = await prisma.invoiceItem.findMany({
    where: { invoice: { status: "ISSUED", ...(from ? { invoiceDate: { gte: from } } : {}) } },
    include: { product: { include: { item: { include: { balance: true } } } } },
  });
  const byProduct = new Map<string, typeof lines>();
  for (const l of lines) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l]);
  const rows = [];
  for (const [productId, ls] of byProduct) {
    const latest = await prisma.productionRun.findFirst({ where: { productId, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { costPerUnit: true, runNo: true } });
    const unitCost = latest?.costPerUnit ? D(latest.costPerUnit) : D(ls[0].product.item.balance?.avgCost ?? 0);
    const qty = sum(ls.map((l) => l.quantity));
    const revenue = sum(ls.map((l) => l.taxableValue));
    const cost = round2(qty.times(unitCost));
    const margin = revenue.minus(cost);
    rows.push({
      productId,
      name: ls[0].product.item.name,
      qty,
      revenue,
      unitCost,
      costBasis: latest ? `Run ${latest.runNo}` : "Stock average",
      cost,
      margin,
      marginPct: pctOf(margin, revenue, 2),
    });
  }
  return rows.sort((a, b) => b.revenue.comparedTo(a.revenue));
}

export async function recentActivity(limit = 10) {
  return prisma.auditLog.findMany({
    where: { NOT: { action: { startsWith: "auth." } } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export type AlertSeverity = "critical" | "warning" | "info";
export interface ErpAlert {
  id: string;
  severity: AlertSeverity;
  category: "Stock" | "Production" | "Sales" | "Receivables" | "Expiry";
  title: string;
  detail: string;
  href: string;
}

/** All operational alerts, computed live from posted data. */
export async function collectAlerts(now = new Date()): Promise<ErpAlert[]> {
  const alerts: ErpAlert[] = [];
  const stock = await stockSummary();
  for (const s of stock.lowStock) {
    alerts.push({
      id: `low-${s.itemId}`,
      severity: s.quantity.lte(0) ? "critical" : "warning",
      category: "Stock",
      title: `${s.name} at or below reorder level`,
      detail: `On hand ${s.quantity.toFixed()} ${s.unit}; reorder level ${s.reorderLevel.toFixed()} ${s.unit}.`,
      href: s.kind === "FINISHED_GOOD" ? "/inventory?tab=FINISHED_GOOD" : `/inventory?tab=${s.kind}`,
    });
  }
  const flaggedRuns = await prisma.productionRun.findMany({
    where: { status: "COMPLETED", hasVarianceAlert: true, completedAt: { gte: addDays(now, -60) } },
    include: { product: { include: { item: true } }, materials: { where: { isFlagged: true }, include: { item: true } } },
    orderBy: { completedAt: "desc" },
  });
  for (const r of flaggedRuns) {
    const parts = [];
    if (r.yieldVariancePct && D(r.yieldVariancePct).abs().gt(D(r.varianceTolerancePct ?? 3))) parts.push(`yield ${D(r.yieldVariancePct).toFixed(2)}%`);
    for (const m of r.materials) parts.push(`${m.item.name} ${D(m.variancePct ?? 0).gt(0) ? "+" : ""}${D(m.variancePct ?? 0).toFixed(2)}%`);
    alerts.push({
      id: `var-${r.id}`,
      severity: "warning",
      category: "Production",
      title: `${r.runNo} (${r.product.item.name}) outside ±${D(r.varianceTolerancePct ?? 3).toFixed(0)}% tolerance`,
      detail: parts.join(" · "),
      href: `/production/${r.id}`,
    });
  }
  const openOrders = await prisma.salesOrder.findMany({ where: { status: { in: ["PENDING", "APPROVED", "PARTIALLY_FULFILLED"] } }, include: { customer: true } });
  for (const o of openOrders) {
    const lines = await orderAvailability(prisma, o.id);
    const short = lines.filter((l) => D(l.shortage).gt(0));
    if (short.length) {
      alerts.push({
        id: `short-${o.id}`,
        severity: "critical",
        category: "Sales",
        title: `${o.orderNo} for ${o.customer.name}: stock shortage`,
        detail: short.map((l) => `${l.productName}: needs ${l.remaining}, available ${l.available}, short ${l.shortage}`).join(" · "),
        href: `/orders/${o.id}`,
      });
    }
  }
  const pending = await prisma.salesOrder.count({ where: { status: "PENDING" } });
  if (pending) alerts.push({ id: "pending-orders", severity: "info", category: "Sales", title: `${pending} order(s) awaiting approval`, detail: "Verify and approve or reject salesman orders.", href: "/orders?status=PENDING" });
  const undispatched = await prisma.invoice.findMany({ where: { status: "ISSUED", dispatch: { is: null } } });
  if (undispatched.length) alerts.push({ id: "undispatched", severity: "info", category: "Sales", title: `${undispatched.length} invoice(s) not yet dispatched`, detail: undispatched.map((i) => i.invoiceNo).join(", "), href: "/dispatch" });

  const open = await openInvoices({ asOf: now });
  for (const i of open.filter((x) => x.daysPastDue > 0)) {
    alerts.push({ id: `overdue-${i.id}`, severity: i.daysPastDue > 30 ? "critical" : "warning", category: "Receivables", title: `${i.invoiceNo} overdue by ${i.daysPastDue} days`, detail: `${i.customerName} owes ${i.balance.toFixed(2)}.`, href: `/invoices/${i.id}` });
  }
  const balances = await customerBalances();
  const customers = await prisma.customer.findMany({ where: { id: { in: [...balances.keys()] } } });
  for (const c of customers) {
    const b = balances.get(c.id)!;
    if (D(c.creditLimit).gt(0) && b.outstanding.gt(D(c.creditLimit))) {
      alerts.push({ id: `credit-${c.id}`, severity: "warning", category: "Receivables", title: `${c.name} above credit limit`, detail: `Outstanding ${b.outstanding.toFixed(2)} vs limit ${D(c.creditLimit).toFixed(2)}.`, href: `/customers/${c.id}` });
    }
  }
  const expiring = await prisma.inventoryTransaction.findMany({
    where: { quantity: { gt: 0 }, expiryDate: { gte: now, lte: addDays(now, 30) } },
    include: { item: true },
  });
  for (const e of expiring) {
    alerts.push({ id: `exp-${e.id}`, severity: "info", category: "Expiry", title: `${e.item.name} batch ${e.batchNo ?? ""} expires soon`, detail: `Received ${e.quantity.toString()} on ${e.txnDate.toISOString().slice(0, 10)}; expiry ${e.expiryDate!.toISOString().slice(0, 10)}.`, href: "/reports/stock-ledger" });
  }
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function zeroIfNegative(d: Dec) {
  return max(0, d);
}
