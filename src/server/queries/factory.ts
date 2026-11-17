import { D, Dec, formatPct, formatQty, max, sum } from "@/lib/decimal";
import { addDays, formatDate, formatDateTime } from "@/lib/dates";
import {
  DEPARTMENT_IDS,
  gaugeRatio,
  stockStatus,
  storageZoneFor,
  varianceStatus,
  worstStatus,
  type DepartmentId,
  type DepartmentSnapshot,
  type DeptGauge,
  type DeptMetric,
  type DeptStatus,
  type FactorySnapshot,
  type StorageZone,
} from "@/lib/factory";
import { prisma } from "../db";
import { finishedGoodsAvailability } from "../services/availability";

/**
 * Builds the live state of every factory department for the 3D digital twin, purely from posted ERP
 * records (ledger balances, production runs, purchase orders, invoices, dispatches and open orders).
 * Nothing here is simulated: a department with no underlying activity reports "idle".
 */

const n = (v: Dec) => Number(v.toFixed(3));
const movementLabel = (t: string) => t.toLowerCase().replace(/_/g, " ");
const RECENT_DAYS = 30;

/** Number of 3D props for a quantity (rounded up), capped at the slots the model has; says so when capped. */
function countable(quantity: number, per: number, cap: number, label: string) {
  const units = Math.ceil(Math.max(0, quantity) / per);
  return { units: Math.min(cap, units), unitLabel: units > cap ? `${label} (display capped at ${cap})` : label };
}

interface StockRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  unit: string;
  dimension: string;
  quantity: Dec;
  reorder: Dec;
  status: DeptStatus;
}

function storageGauges(rows: StockRow[]): DeptGauge[] {
  return rows.map((r) => ({
    label: r.name,
    ratio: gaugeRatio(n(r.quantity), n(r.reorder)),
    text: `${formatQty(r.quantity)} ${r.unit} (reorder at ${formatQty(r.reorder)})`,
    status: r.status,
  }));
}

function storageStatusText(rows: StockRow[], emptyText: string): { status: DeptStatus; text: string } {
  if (!rows.length) return { status: "idle", text: emptyText };
  const critical = rows.filter((r) => r.status === "critical");
  const low = rows.filter((r) => r.status === "warning");
  if (critical.length) return { status: "critical", text: `Critical: ${critical.map((r) => `${r.name} ${formatQty(r.quantity)} ${r.unit}`).join(", ")} (reorder now)` };
  if (low.length) return { status: "warning", text: `Low: ${low.map((r) => `${r.name} ${formatQty(r.quantity)} ${r.unit} ≤ reorder ${formatQty(r.reorder)}`).join(", ")}` };
  return { status: "ok", text: "All items above reorder level" };
}

function stockMetrics(rows: StockRow[]): DeptMetric[] {
  return rows.map((r) => ({
    label: r.name,
    value: `${formatQty(r.quantity)} ${r.unit}`,
    hint: `Reorder level ${formatQty(r.reorder)} ${r.unit}`,
    tone: r.status === "ok" ? "ok" : r.status === "idle" ? "muted" : r.status,
  }));
}

export async function getFactorySnapshot(now = new Date()): Promise<FactorySnapshot> {
  const recentSince = addDays(now, -RECENT_DAYS);
  const [settings, items, activeRuns, recentRuns, openPos, recentLedger, pendingInvoices, recentDispatches, openOrders, recentOutputs] = await Promise.all([
    prisma.companySettings.findUnique({ where: { id: 1 }, select: { varianceTolerancePct: true } }),
    prisma.item.findMany({ where: { isActive: true }, include: { unit: true, balance: true, product: true }, orderBy: { name: "asc" } }),
    prisma.productionRun.findMany({
      where: { status: { in: ["PLANNED", "IN_PROGRESS"] } },
      include: { product: { include: { item: true } }, materials: { include: { item: { include: { unit: true } } } } },
      orderBy: { plannedDate: "asc" },
    }),
    prisma.productionRun.findMany({
      where: { status: "COMPLETED" },
      include: { product: { include: { item: true } }, materials: { include: { item: { include: { unit: true } } } } },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["OPEN", "PARTIALLY_RECEIVED"] } },
      include: { supplier: true, items: { include: { item: true, unit: true } } },
      orderBy: { orderDate: "asc" },
    }),
    prisma.inventoryTransaction.findMany({
      include: { item: { include: { unit: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.invoice.findMany({
      where: { status: "ISSUED", dispatch: { is: null } },
      include: { items: true },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.dispatch.findMany({ include: { invoice: true, items: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.salesOrder.findMany({
      where: { status: { in: ["PENDING", "APPROVED", "PARTIALLY_FULFILLED"] } },
      include: { customer: true, items: { include: { product: { include: { item: true } } } } },
      orderBy: { orderDate: "asc" },
    }),
    prisma.productionOutput.findMany({ include: { item: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const tolerance = D(settings?.varianceTolerancePct ?? 3);
  const tol = n(tolerance);

  // ── Stock rows ──
  const rows: StockRow[] = items.map((i) => {
    const quantity = D(i.balance?.quantity ?? 0);
    const reorder = D(i.reorderLevel);
    return { id: i.id, code: i.code, name: i.name, kind: i.kind, unit: i.unit.code, dimension: i.unit.dimension, quantity, reorder, status: stockStatus(n(quantity), n(reorder)) };
  });
  const raw = rows.filter((r) => r.kind === "RAW_MATERIAL");
  const zoneOf = (r: StockRow): StorageZone => storageZoneFor({ name: r.name, dimension: r.dimension });
  const zone = (z: StorageZone) => raw.filter((r) => zoneOf(r) === z);
  const packaging = rows.filter((r) => r.kind === "PACKAGING_MATERIAL");
  const finished = rows.filter((r) => r.kind === "FINISHED_GOOD");

  const recentLedgerFor = (pred: (kind: string) => boolean, limit = 6) =>
    recentLedger
      .filter((l) => pred(l.item.kind))
      .slice(0, limit)
      .map((l) => [formatDateTime(l.createdAt), l.item.name, movementLabel(l.movementType), `${D(l.quantity).gt(0) ? "+" : ""}${formatQty(l.quantity)} ${l.item.unit.code}`, `${formatQty(l.balanceAfter)} ${l.item.unit.code}`, l.sourceRef]);

  const departments = {} as Record<DepartmentId, DepartmentSnapshot>;

  // ── Storage zones ──
  const zoneDept = (id: DepartmentId, z: StorageZone, emptyText: string, unitsPer?: { per: number; label: string; cap: number }): DepartmentSnapshot => {
    const zr = zone(z);
    const s = storageStatusText(zr, emptyText);
    const total = sum(zr.map((r) => r.quantity));
    return {
      id,
      status: s.status,
      statusText: s.text,
      activity: "idle",
      metrics: stockMetrics(zr),
      tables: [{ title: "Recent movements", columns: ["When", "Item", "Movement", "Qty", "Balance after", "Document"], rows: recentLedger.filter((l) => zr.some((r) => r.id === l.itemId)).slice(0, 6).map((l) => [formatDateTime(l.createdAt), l.item.name, movementLabel(l.movementType), `${D(l.quantity).gt(0) ? "+" : ""}${formatQty(l.quantity)} ${l.item.unit.code}`, `${formatQty(l.balanceAfter)} ${l.item.unit.code}`, l.sourceRef]), empty: "No movements yet" }],
      visual: { gauges: storageGauges(zr), ...(unitsPer ? countable(n(total), unitsPer.per, unitsPer.cap, unitsPer.label) : {}) },
    };
  };
  departments.flour = zoneDept("flour", "flour", "No flour items in the material master", { per: 10, label: "1 sack = 10 kg", cap: 36 });
  departments.oil = zoneDept("oil", "oil", "No oils in the material master");
  departments.spice = zoneDept("spice", "spice", "No spice items in the material master", { per: 5, label: "1 bin = 5 kg", cap: 27 });

  // Raw-material warehouse = every raw material + inbound purchase orders.
  {
    const s = storageStatusText(raw, "No raw materials in the material master");
    const overduePos = openPos.filter((p) => p.expectedDate && p.expectedDate < now);
    const status = overduePos.length && s.status === "ok" ? "warning" : s.status;
    const general = zone("general");
    departments["raw-warehouse"] = {
      id: "raw-warehouse",
      status,
      statusText: overduePos.length && s.status === "ok" ? `${overduePos.length} purchase order(s) overdue for delivery` : s.text,
      activity: "idle",
      metrics: [
        { label: "Raw materials stocked", value: String(raw.length) },
        { label: "At or below reorder", value: String(raw.filter((r) => r.status !== "ok").length), tone: raw.some((r) => r.status === "critical") ? "critical" : raw.some((r) => r.status === "warning") ? "warning" : "ok" },
        { label: "Open purchase orders", value: String(openPos.length), hint: overduePos.length ? `${overduePos.length} overdue` : undefined, tone: overduePos.length ? "warning" : undefined },
        ...stockMetrics(general),
      ],
      tables: [
        {
          title: "Incoming purchases (open purchase orders)",
          columns: ["PO", "Supplier", "Balance to receive", "Expected"],
          rows: openPos.map((p) => [p.poNo, p.supplier.name, p.items.filter((i) => D(i.quantity).gt(D(i.receivedQty))).map((i) => `${formatQty(D(i.quantity).minus(D(i.receivedQty)))} ${i.unit.code} ${i.item.name}`).join(", "), p.expectedDate ? formatDate(p.expectedDate) : "—"]),
          empty: "No purchase orders awaiting delivery",
        },
        { title: "Low-stock warnings", columns: ["Item", "On hand", "Reorder level"], rows: raw.filter((r) => r.status !== "ok").map((r) => [r.name, `${formatQty(r.quantity)} ${r.unit}`, `${formatQty(r.reorder)} ${r.unit}`]), empty: "Every raw material is above its reorder level" },
        { title: "Recent raw-material movements", columns: ["When", "Item", "Movement", "Qty", "Balance after", "Document"], rows: recentLedgerFor((k) => k === "RAW_MATERIAL"), empty: "No movements yet" },
      ],
      visual: { gauges: storageGauges(general), units: Math.min(12, openPos.length), unitLabel: "1 pallet in the receiving bay = 1 open purchase order" },
    };
  }

  // ── Packaging-material store ──
  const lastRun = recentRuns[0];
  {
    const s = storageStatusText(packaging, "No packaging materials in the material master");
    const damagedRecent = recentRuns.filter((r) => r.completedAt && r.completedAt >= recentSince).flatMap((r) => r.materials.filter((m) => m.item.kind === "PACKAGING_MATERIAL" && D(m.damagedQty).gt(0)));
    const pouches = packaging.filter((p) => /pouch/i.test(p.name));
    departments["packaging-store"] = {
      id: "packaging-store",
      status: s.status,
      statusText: s.text,
      activity: "idle",
      metrics: [
        ...stockMetrics(packaging),
        { label: `Damaged in last ${RECENT_DAYS} days`, value: damagedRecent.length ? damagedRecent.map((m) => `${formatQty(m.damagedQty)} ${m.item.unit.code} ${m.item.name}`).join(", ") : "None", tone: damagedRecent.length ? "warning" : "ok" },
      ],
      tables: [{ title: "Recent packaging movements", columns: ["When", "Item", "Movement", "Qty", "Balance after", "Document"], rows: recentLedgerFor((k) => k === "PACKAGING_MATERIAL"), empty: "No movements yet" }],
      visual: { gauges: storageGauges(packaging), ...countable(n(sum(pouches.map((p) => p.quantity))), 50, 27, "1 box = 50 pouches") },
    };
  }

  // ── Production line ──
  const inProgress = activeRuns.filter((r) => r.status === "IN_PROGRESS");
  const planned = activeRuns.filter((r) => r.status === "PLANNED");
  const lineRunning = inProgress.length > 0;
  const lastRecent = lastRun && lastRun.completedAt && lastRun.completedAt >= recentSince ? lastRun : null;

  const materialVariance = (run: (typeof recentRuns)[number] | undefined, pred: (m: (typeof recentRuns)[number]["materials"][number]) => boolean) =>
    (run?.materials ?? []).filter(pred).map((m) => ({ name: m.item.name, unit: m.item.unit.code, planned: D(m.plannedQty), actual: D(m.actualQty ?? 0), variance: D(m.variancePct ?? 0) }));
  const runningText = lineRunning ? `Running: ${inProgress.map((r) => `${r.runNo} ${r.product.item.name}`).join(", ")}` : "Idle: no run in progress";

  {
    const yieldVar = lastRecent?.yieldVariancePct ? n(D(lastRecent.yieldVariancePct)) : null;
    const flagged = lastRecent ? materialVariance(lastRecent, (m) => m.isFlagged) : [];
    const health = lastRecent ? worstStatus([yieldVar === null ? "ok" : varianceStatus(yieldVar, tol, -1), ...flagged.map((f) => varianceStatus(n(f.variance), tol))]) : "idle";
    const issues = [
      ...(yieldVar !== null && Math.abs(yieldVar) > tol ? [`yield ${formatPct(yieldVar)}`] : []),
      ...flagged.map((f) => `${f.name} ${formatPct(f.variance)}`),
    ];
    departments.production = {
      id: "production",
      status: lineRunning && health === "idle" ? "ok" : health,
      statusText: `${runningText}. ${lastRecent ? (issues.length ? `Last run ${lastRecent.runNo}: ${issues.join(", ")} (tolerance ±${tolerance.toFixed(0)}%)` : `Last run ${lastRecent.runNo} within tolerance`) : `No completed runs in the last ${RECENT_DAYS} days`}`,
      activity: lineRunning ? "running" : "idle",
      metrics: [
        { label: "Runs in progress", value: String(inProgress.length), tone: inProgress.length ? "ok" : "muted" },
        { label: "Runs planned", value: String(planned.length) },
        ...(lastRun
          ? [
              { label: "Last run", value: `${lastRun.runNo}`, hint: `${lastRun.product.item.name}, completed ${formatDate(lastRun.completedAt)}` },
              { label: "Planned → good output", value: `${formatQty(lastRun.expectedOutput)} → ${formatQty(lastRun.actualGoodOutput ?? 0)}` },
              { label: "Yield variance", value: lastRun.yieldVariancePct ? formatPct(lastRun.yieldVariancePct) : "—", tone: lastRun.yieldVariancePct ? varianceStatus(n(D(lastRun.yieldVariancePct)), tol, -1) : undefined },
              { label: "Cost per good packet", value: lastRun.costPerUnit ? `₹${D(lastRun.costPerUnit).toFixed(2)}` : "—", hint: lastRun.totalCost ? `₹${D(lastRun.totalCost).toFixed(2)} ÷ ${formatQty(lastRun.actualGoodOutput ?? 0)} good` : undefined },
            ]
          : []),
      ] as DeptMetric[],
      tables: [
        {
          title: "Production runs",
          columns: ["Run", "Product", "Status", "Planned", "Good", "Yield var."],
          rows: [...activeRuns, ...recentRuns].map((r) => [r.runNo, r.product.item.name, r.status.toLowerCase().replace("_", " "), formatQty(r.expectedOutput), r.actualGoodOutput ? formatQty(r.actualGoodOutput) : "—", r.yieldVariancePct ? formatPct(r.yieldVariancePct) : "—"]),
          empty: "No production runs yet",
        },
        {
          title: lastRun ? `Material consumption on ${lastRun.runNo}` : "Material consumption",
          columns: ["Material", "Planned", "Actual", "Damaged", "Variance"],
          rows: (lastRun?.materials ?? []).map((m) => [m.item.name, `${formatQty(m.plannedQty)} ${m.item.unit.code}`, `${formatQty(m.actualQty ?? 0)} ${m.item.unit.code}`, D(m.damagedQty).gt(0) ? formatQty(m.damagedQty) : "—", m.variancePct ? formatPct(m.variancePct) : "—"]),
          empty: "No completed run yet",
        },
      ],
      visual: {},
    };

    // Mixing (dry ingredients) and frying (oil) look at the same latest run, split by material type.
    const sectionDept = (id: DepartmentId, label: string, pred: (m: (typeof recentRuns)[number]["materials"][number]) => boolean): DepartmentSnapshot => {
      const mats = lastRecent ? materialVariance(lastRecent, pred) : [];
      const health = lastRecent && mats.length ? worstStatus(mats.map((m) => varianceStatus(n(m.variance), tol))) : "idle";
      const over = mats.filter((m) => Math.abs(n(m.variance)) > tol);
      const issued = inProgress.flatMap((r) => r.materials.filter(pred).map((m) => ({ run: r.runNo, m })));
      return {
        id,
        status: lineRunning && health === "idle" ? "ok" : health,
        statusText: `${runningText}. ${lastRecent ? (over.length ? `${over.map((m) => `${m.name} ${formatPct(m.variance)} vs BOM`).join(", ")} on ${lastRecent.runNo}` : `${label} within ±${tolerance.toFixed(0)}% on ${lastRecent.runNo}`) : `No completed runs in the last ${RECENT_DAYS} days`}`,
        activity: lineRunning ? "running" : "idle",
        metrics: [
          ...mats.map((m) => ({
            label: m.name,
            value: `${formatQty(m.actual)} ${m.unit} used`,
            hint: `BOM ${formatQty(m.planned)} ${m.unit} · ${formatPct(m.variance)}`,
            tone: varianceStatus(n(m.variance), tol) as DeptMetric["tone"],
          })),
          ...issued.map(({ run, m }) => ({ label: `${m.item.name} issued to ${run}`, value: `${formatQty(m.actualQty ?? m.plannedQty)} ${m.item.unit.code}` })),
        ],
        tables: [],
        visual: {},
      };
    };
    departments.mixing = sectionDept("mixing", "Dry ingredients", (m) => m.item.kind === "RAW_MATERIAL" && m.item.unit.dimension !== "VOLUME");
    departments.frying = sectionDept("frying", "Oil", (m) => m.item.kind === "RAW_MATERIAL" && m.item.unit.dimension === "VOLUME");

    departments.cooling = {
      id: "cooling",
      status: lineRunning ? "ok" : "idle",
      statusText: lineRunning ? `${inProgress.length} batch(es) on the line` : "Idle: no batch on the line (cooling is not recorded separately in the ERP)",
      activity: lineRunning ? "running" : "idle",
      metrics: inProgress.map((r) => ({ label: r.runNo, value: r.product.item.name, hint: `Expected ${formatQty(r.expectedOutput)} packets` })),
      tables: [],
      visual: {},
    };

    // Packaging line: pouch/carton consumption and damage on the latest run.
    const packMats = lastRecent ? lastRecent.materials.filter((m) => m.item.kind === "PACKAGING_MATERIAL") : [];
    const damageRows = packMats.map((m) => {
      const used = D(m.actualQty ?? 0).plus(D(m.damagedQty));
      const pct = used.gt(0) ? D(m.damagedQty).div(used).times(100) : D(0);
      return { m, used, pct };
    });
    const worstDamage = damageRows.reduce((a, b) => (b.pct.gt(a) ? b.pct : a), D(0));
    const packHealth: DeptStatus = !lastRecent ? (lineRunning ? "ok" : "idle") : varianceStatus(n(worstDamage), tol);
    departments.packing = {
      id: "packing",
      status: packHealth,
      statusText: `${runningText}. ${lastRecent ? damageRows.filter((d) => D(d.m.damagedQty).gt(0)).map((d) => `${d.m.item.name}: ${formatQty(d.m.damagedQty)} damaged (${d.pct.toFixed(2)}% of ${formatQty(d.used)} used)`).join(", ") || `No damaged packaging on ${lastRecent.runNo}` : "No recent packing data"}`,
      activity: lineRunning ? "running" : "idle",
      metrics: [
        ...packaging.map((p) => ({ label: `${p.name} available`, value: `${formatQty(p.quantity)} ${p.unit}`, tone: (p.status === "ok" ? "ok" : p.status) as DeptMetric["tone"] })),
        ...damageRows.map((d) => ({ label: `${d.m.item.name} consumed on ${lastRecent!.runNo}`, value: `${formatQty(d.used)} ${d.m.item.unit.code}`, hint: D(d.m.damagedQty).gt(0) ? `incl. ${formatQty(d.m.damagedQty)} damaged` : "no damage" })),
      ],
      tables: [],
      visual: {},
    };

    // Quality control: variance flags in the last 30 days.
    const qcRuns = recentRuns.filter((r) => r.completedAt && r.completedAt >= recentSince);
    const flaggedRuns = qcRuns.filter((r) => r.hasVarianceAlert);
    const qcHealth: DeptStatus = !qcRuns.length ? "idle" : worstStatus(qcRuns.map((r) => worstStatus([varianceStatus(n(D(r.yieldVariancePct ?? 0)), tol, -1), ...r.materials.map((m) => varianceStatus(n(D(m.variancePct ?? 0)), tol))])));
    departments.qc = {
      id: "qc",
      status: qcHealth,
      statusText: qcRuns.length ? (flaggedRuns.length ? `${flaggedRuns.length} of ${qcRuns.length} recent run(s) outside ±${tolerance.toFixed(0)}% tolerance` : `All ${qcRuns.length} recent run(s) within tolerance`) : `No completed runs to check in the last ${RECENT_DAYS} days`,
      activity: "idle",
      metrics: [
        { label: "Variance tolerance", value: `±${tolerance.toFixed(2)}%` },
        { label: `Runs checked (${RECENT_DAYS} days)`, value: String(qcRuns.length) },
        { label: "Runs flagged", value: String(flaggedRuns.length), tone: flaggedRuns.length ? "warning" : "ok" },
      ],
      tables: [
        {
          title: "Quality checks",
          columns: ["Run", "Product", "Yield var.", "Flagged materials", "Result"],
          rows: qcRuns.map((r) => [r.runNo, r.product.item.name, r.yieldVariancePct ? formatPct(r.yieldVariancePct) : "—", r.materials.filter((m) => m.isFlagged).map((m) => `${m.item.name} ${formatPct(m.variancePct ?? 0)}`).join(", ") || "—", r.hasVarianceAlert ? "Flagged" : "Pass"]),
          empty: "No completed runs",
        },
      ],
      visual: {},
    };
  }

  // ── Finished goods & dispatch ──
  const productIds = items.filter((i) => i.product).map((i) => i.product!.id);
  const avail = await finishedGoodsAvailability(prisma, productIds);
  const demand = new Map<string, Dec>();
  for (const o of openOrders) for (const i of o.items) demand.set(i.productId, (demand.get(i.productId) ?? D(0)).plus(D(i.quantity).minus(D(i.invoicedQty))));
  {
    const productRows = finished.map((r) => {
      const productId = items.find((i) => i.id === r.id)!.product!.id;
      const a = avail.get(productId)!;
      const need = demand.get(productId) ?? D(0);
      const shortage = max(0, need.minus(a.available));
      const batches = recentOutputs.filter((o) => o.itemId === r.id);
      return { r, a, need, shortage, batches };
    });
    const short = productRows.filter((p) => p.shortage.gt(0));
    const low = productRows.filter((p) => p.r.status !== "ok");
    const status: DeptStatus = !finished.length ? "idle" : short.length ? "critical" : worstStatus(low.map((p) => p.r.status).concat("ok"));
    const totalPackets = sum(finished.map((r) => r.quantity));
    departments["fg-warehouse"] = {
      id: "fg-warehouse",
      status,
      statusText: short.length
        ? `Short for open orders: ${short.map((p) => `${p.r.name} needs ${formatQty(p.need)}, available ${formatQty(p.a.available)} → short ${formatQty(p.shortage)}`).join("; ")}`
        : low.length
          ? `At or below reorder level: ${low.map((p) => `${p.r.name} ${formatQty(p.r.quantity)}`).join(", ")}`
          : `${formatQty(totalPackets)} packets in stock; open orders covered`,
      activity: "idle",
      metrics: [
        { label: "Packets on hand", value: formatQty(totalPackets) },
        { label: "Reserved for invoices", value: formatQty(sum([...avail.values()].map((a) => a.reserved))) },
        { label: "Open-order demand", value: formatQty(sum([...demand.values()])) },
        { label: "Shortage", value: formatQty(sum(short.map((p) => p.shortage))), tone: short.length ? "critical" : "ok" },
      ],
      tables: [
        {
          title: "Product-wise stock",
          columns: ["Product", "On hand", "Reserved", "Available", "Open orders", "Shortage"],
          rows: productRows.map((p) => [p.r.name, formatQty(p.a.onHand), formatQty(p.a.reserved), formatQty(p.a.available), formatQty(p.need), p.shortage.gt(0) ? formatQty(p.shortage) : "—"]),
          empty: "No finished products",
        },
        {
          title: "Recent production batches",
          columns: ["Batch", "Product", "Packets", "Expiry"],
          rows: recentOutputs.slice(0, 6).map((o) => [o.batchNo, o.item.name, formatQty(o.quantity), o.expiryDate ? formatDate(o.expiryDate) : "—"]),
          empty: "No production batches yet (stock is opening balance)",
        },
      ],
      visual: countable(n(totalPackets), 20, 60, "1 carton = 20 packets"),
    };

    const pendingQty = sum(pendingInvoices.flatMap((i) => i.items.map((x) => x.quantity)));
    const waiting = openOrders
      .map((o) => {
        const lines = o.items.map((i) => {
          const remaining = D(i.quantity).minus(D(i.invoicedQty));
          const available = avail.get(i.productId)?.available ?? D(0);
          return { name: i.product.item.name, remaining, available, shortage: max(0, remaining.minus(available)) };
        });
        return { o, lines, short: lines.some((l) => l.shortage.gt(0)) };
      })
      .filter((x) => x.lines.some((l) => l.remaining.gt(0)));
    const blocked = waiting.filter((w) => w.short);
    departments.dispatch = {
      id: "dispatch",
      status: pendingInvoices.length || waiting.length ? "warning" : recentDispatches.length ? "ok" : "idle",
      statusText: pendingInvoices.length
        ? `${pendingInvoices.length} invoice(s) waiting to be loaded (${formatQty(pendingQty)} packets)`
        : blocked.length
          ? `${blocked.length} order(s) waiting for stock: ${blocked.map((b) => `${b.o.orderNo} short ${b.lines.map((l) => formatQty(l.shortage)).join("/")}`).join(", ")}`
          : waiting.length
            ? `${waiting.length} order(s) awaiting approval or invoicing`
            : recentDispatches.length
              ? "All invoices dispatched"
              : "No dispatches yet",
      activity: pendingInvoices.length ? "running" : "idle",
      metrics: [
        { label: "Invoices awaiting dispatch", value: String(pendingInvoices.length), tone: pendingInvoices.length ? "warning" : "ok" },
        { label: "Orders awaiting fulfilment", value: String(waiting.length), tone: waiting.length ? "warning" : "ok" },
        { label: "Orders blocked by stock", value: String(blocked.length), tone: blocked.length ? "critical" : "ok" },
        { label: "Dispatches recorded", value: String(recentDispatches.length ? recentDispatches.length : 0), hint: "latest 5 shown below" },
      ],
      tables: [
        { title: "Pending dispatch", columns: ["Invoice", "Customer", "Packets", "Invoiced"], rows: pendingInvoices.map((i) => [i.invoiceNo, i.customerName, formatQty(sum(i.items.map((x) => x.quantity))), formatDate(i.invoiceDate)]), empty: "Nothing waiting to be loaded" },
        {
          title: "Orders awaiting fulfilment",
          columns: ["Order", "Customer", "Status", "Remaining", "Available", "Shortage"],
          rows: waiting.map((w) => [w.o.orderNo, w.o.customer.name, w.o.status.toLowerCase().replace("_", " "), w.lines.map((l) => formatQty(l.remaining)).join(" / "), w.lines.map((l) => formatQty(l.available)).join(" / "), w.lines.map((l) => (l.shortage.gt(0) ? formatQty(l.shortage) : "—")).join(" / ")]),
          empty: "No open orders",
        },
        { title: "Completed dispatches", columns: ["Dispatch", "Invoice", "Customer", "Packets", "Vehicle"], rows: recentDispatches.map((d) => [d.dispatchNo, d.invoice.invoiceNo, d.invoice.customerName, formatQty(sum(d.items.map((x) => x.quantity))), d.vehicleNo ?? "—"]), empty: "No dispatches yet" },
      ],
      visual: { vehicle: pendingInvoices.length > 0, ...countable(n(pendingQty), 20, 24, "Staged for loading: 1 carton = 20 packets") },
    };
  }

  // Every department must be present (guards against a missed branch above).
  for (const id of DEPARTMENT_IDS) if (!departments[id]) throw new Error(`Factory snapshot missing department ${id}`);

  return {
    generatedAt: now.toISOString(),
    tolerancePct: tolerance.toFixed(2),
    activeRuns: inProgress.length,
    departments,
  };
}
