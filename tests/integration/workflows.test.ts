/**
 * Workflow, digital-twin and authorization tests against a real PostgreSQL test database.
 * The database is rebuilt from the migrations, seeded with the fictional masters and the mandatory
 * benchmark is replayed first, so every assertion starts from the documented benchmark state.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { D } from "@/lib/decimal";

const testUrl = process.env.TEST_DATABASE_URL ?? "";
const mainUrl = process.env.MAIN_DATABASE_URL ?? "";

let prisma: PrismaClient;
let actors: Awaited<ReturnType<typeof import("../../prisma/seed/master-data").seedMasterData>>;
let ids: Awaited<ReturnType<typeof import("../../prisma/seed/benchmark-scenario").runBenchmarkScenario>>;

const item = (code: string) => prisma.item.findUniqueOrThrow({ where: { code }, include: { balance: true, unit: true } });
const qty = async (code: string) => D((await item(code)).balance?.quantity ?? 0);
const unitId = async (code: string) => (await prisma.unit.findUniqueOrThrow({ where: { code } })).id;

beforeAll(async () => {
  if (!testUrl) throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env and start PostgreSQL (npm run db:up).");
  if (testUrl === mainUrl) throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL");
  if (!/test/i.test(new URL(testUrl).pathname)) throw new Error("Refusing to reset a database whose name does not contain 'test'");
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "pipe" });
  ({ prisma } = await import("@/server/db"));
  const { seedMasterData } = await import("../../prisma/seed/master-data");
  const { runBenchmarkScenario } = await import("../../prisma/seed/benchmark-scenario");
  actors = await seedMasterData(prisma, "Demo@1234");
  ids = await runBenchmarkScenario(prisma, actors);
});

describe("3D digital twin snapshot (real ERP data)", () => {
  it("mirrors the benchmark state department by department", async () => {
    const { getFactorySnapshot } = await import("@/server/queries/factory");
    const s = await getFactorySnapshot();
    const d = s.departments;
    expect(Object.keys(d)).toHaveLength(13);
    expect(d.flour.metrics.find((m) => m.label === "Flour")?.value).toBe("120 KG");
    expect(d.oil.metrics.find((m) => m.label === "Cooking Oil")?.value).toBe("19.5 L");
    expect(d["packaging-store"].metrics.find((m) => m.label === "200 g Pouch")?.value).toBe("306 PCS");
    // Production: idle (no run in progress) but amber because of +5% oil and −6% yield.
    expect(d.production.activity).toBe("idle");
    expect(d.production.status).toBe("warning");
    expect(d.production.statusText).toContain("yield -6.00%");
    expect(d.frying.status).toBe("warning");
    expect(d.frying.statusText).toContain("+5.00%");
    expect(d.mixing.status).toBe("ok");
    expect(d.cooling.status).toBe("idle");
    expect(d.packing.statusText).toContain("6 damaged");
    expect(d.qc.status).toBe("warning");
    // Finished goods: 88 Murukku on hand, Distributor B short by 32 → critical.
    expect(d["fg-warehouse"].status).toBe("critical");
    expect(d["fg-warehouse"].statusText).toContain("short 32");
    const murukku = d["fg-warehouse"].tables[0].rows.find((r) => r[0] === "Murukku 200 g");
    expect(murukku?.slice(1, 6)).toEqual(["88", "0", "88", "120", "32"]);
    // Dispatch: Retailer A already dispatched; Distributor B waiting for stock; no vehicle at the dock.
    expect(d.dispatch.status).toBe("warning");
    expect(d.dispatch.visual.vehicle).toBe(false);
    expect(d.dispatch.tables[2].rows).toHaveLength(1);
  });

  it("changes when new transactions are posted", async () => {
    const { getFactorySnapshot } = await import("@/server/queries/factory");
    const { adjustStock } = await import("@/server/services/stock");
    const spice = await item("RM-SPICE");
    // Spice 3.8 kg − 3 kg = 0.8 kg: below half of the 2 kg reorder level → critical.
    await adjustStock(actors.supervisor, { itemId: spice.id, type: "DAMAGED_MATERIAL", direction: "DECREASE", quantity: "3", reason: "Spice bag torn (test)" });
    const s = await getFactorySnapshot();
    expect(s.departments.spice.status).toBe("critical");
    expect(s.departments["raw-warehouse"].status).toBe("critical");
    expect(s.departments.spice.statusText).toContain("Salt & Spice Mix 0.8 KG");
  });
});

describe("purchase orders → goods receipt", () => {
  it("does not move stock until goods are received, then advances the PO", async () => {
    const { createPurchaseOrder } = await import("@/server/services/purchase-orders");
    const { createPurchase } = await import("@/server/services/purchases");
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: "SUP-0003" } });
    const pouch = await item("PK-POUCH200");
    const pcs = await unitId("PCS");
    const before = await qty("PK-POUCH200");
    const po = await createPurchaseOrder(actors.admin, { expectedDate: undefined, notes: undefined, supplierId: supplier.id, orderDate: "2026-11-17", items: [{ itemId: pouch.id, unitId: pcs, quantity: "500", rate: "2.5", gstRate: "18" }] });
    expect(po.status).toBe("OPEN");
    expect(D(po.grandTotal).toFixed(2)).toBe("1475.00");
    expect((await qty("PK-POUCH200")).eq(before)).toBe(true);

    const line = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await createPurchase(actors.admin, { notes: undefined, supplierId: supplier.id, purchaseOrderId: po.id, supplierInvoiceNo: "PW-T-1", invoiceDate: "2026-11-17", receivedDate: "2026-11-17", items: [{ itemId: pouch.id, unitId: pcs, quantity: "300", rate: "2.5", gstRate: "18", batchNo: undefined, expiryDate: undefined, purchaseOrderItemId: line.id }] });
    expect((await qty("PK-POUCH200")).minus(before).toFixed()).toBe("300");
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIALLY_RECEIVED");

    // Over-receipt is refused and nothing is posted.
    await expect(
      createPurchase(actors.admin, { notes: undefined, supplierId: supplier.id, purchaseOrderId: po.id, supplierInvoiceNo: "PW-T-2", invoiceDate: "2026-11-17", receivedDate: "2026-11-17", items: [{ itemId: pouch.id, unitId: pcs, quantity: "250", rate: "2.5", gstRate: "18", batchNo: undefined, expiryDate: undefined, purchaseOrderItemId: line.id }] }),
    ).rejects.toThrow(/exceeds the .* balance of 200/);
    expect((await qty("PK-POUCH200")).minus(before).toFixed()).toBe("300");

    await createPurchase(actors.admin, { notes: undefined, supplierId: supplier.id, purchaseOrderId: po.id, supplierInvoiceNo: "PW-T-3", invoiceDate: "2026-11-17", receivedDate: "2026-11-17", items: [{ itemId: pouch.id, unitId: pcs, quantity: "200", rate: "2.5", gstRate: "18", batchNo: undefined, expiryDate: undefined, purchaseOrderItemId: line.id }] });
    const done = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { receipts: true } });
    expect(done.status).toBe("RECEIVED");
    expect(done.receipts).toHaveLength(2);
    const { cancelPurchaseOrder } = await import("@/server/services/purchase-orders");
    await expect(cancelPurchaseOrder(actors.admin, po.id, "test")).rejects.toThrow(/received/);
  });

  it("rejects receipts from a different supplier", async () => {
    const { createPurchaseOrder } = await import("@/server/services/purchase-orders");
    const { createPurchase } = await import("@/server/services/purchases");
    const flourMill = await prisma.supplier.findUniqueOrThrow({ where: { code: "SUP-0001" } });
    const oilTrader = await prisma.supplier.findUniqueOrThrow({ where: { code: "SUP-0002" } });
    const flour = await item("RM-FLOUR");
    const kg = await unitId("KG");
    const po = await createPurchaseOrder(actors.admin, { expectedDate: undefined, notes: undefined, supplierId: flourMill.id, orderDate: "2026-11-17", items: [{ itemId: flour.id, unitId: kg, quantity: "100", rate: "45", gstRate: "0" }] });
    await expect(
      createPurchase(actors.admin, { notes: undefined, supplierId: oilTrader.id, purchaseOrderId: po.id, supplierInvoiceNo: "X-1", invoiceDate: "2026-11-17", receivedDate: "2026-11-17", items: [{ itemId: flour.id, unitId: kg, quantity: "10", rate: "45", gstRate: "0", batchNo: undefined, expiryDate: undefined, purchaseOrderItemId: undefined }] }),
    ).rejects.toThrow(/different supplier/);
  });
});

describe("order amendment by the admin", () => {
  it("records before/after values and blocks changes once invoiced", async () => {
    const { createOrder, amendOrder, decideOrder } = await import("@/server/services/orders");
    const { createInvoice } = await import("@/server/services/invoices");
    const retailerA = await prisma.customer.findFirstOrThrow({ where: { name: "Retailer A" } });
    const murukku = await prisma.product.findUniqueOrThrow({ where: { sku: "FG-MURUKKU-200" } });
    const { order } = await createOrder(actors.salesmanA, { notes: undefined, clientRef: randomUUID(), customerId: retailerA.id, capturedOffline: false, items: [{ productId: murukku.id, quantity: "10" }] });
    const line = await prisma.salesOrderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const res = await amendOrder(actors.admin, order.id, { reason: "Customer revised by phone", lines: [{ orderItemId: line.id, quantity: "12", rate: "48" }] });
    expect(res.subtotal).toBe("576.00");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: order.id, action: "order.amend" } });
    expect(log.userId).toBe(actors.admin.id);
    expect(log.data).toMatchObject({ reason: "Customer revised by phone", subtotalBefore: "500.00", subtotalAfter: "576.00", changes: [{ before: { quantity: "10", rate: "50.00" }, after: { quantity: "12", rate: "48.00" } }] });

    await decideOrder(actors.admin, order.id, "APPROVE");
    await createInvoice(actors.admin, { orderId: order.id, lines: [{ orderItemId: line.id, quantity: "12" }] });
    await expect(amendOrder(actors.admin, order.id, { reason: "Too late", lines: [{ orderItemId: line.id, quantity: "5", rate: "48" }] })).rejects.toThrow(/can no longer be changed|Invoiced orders/);
  });
});

describe("inventory and payment rules", () => {
  it("adjusts stock only through an audited ledger movement and never below zero", async () => {
    const { adjustStock } = await import("@/server/services/stock");
    const carton = await item("PK-CARTON");
    const before = await qty("PK-CARTON");
    const adj = await adjustStock(actors.admin, { itemId: carton.id, type: "STOCK_ADJUSTMENT", direction: "INCREASE", quantity: "4", unitCost: "15", reason: "Physical count found 4 extra" });
    const row = await prisma.inventoryTransaction.findFirstOrThrow({ where: { sourceType: "ADJUSTMENT", sourceId: adj.id } });
    expect(D(row.balanceBefore).eq(before)).toBe(true);
    expect(D(row.balanceAfter).minus(before).toFixed()).toBe("4");
    expect(await prisma.auditLog.count({ where: { action: "stock.adjust", entityId: carton.id } })).toBeGreaterThan(0);
    await expect(adjustStock(actors.admin, { itemId: carton.id, type: "STOCK_ADJUSTMENT", direction: "DECREASE", quantity: "100000", reason: "Wrong count" })).rejects.toThrow(/Insufficient stock/);
  });

  it("supports partial payments, blocks over-allocation and keeps outstanding = invoices − payments", async () => {
    const { recordPayment } = await import("@/server/services/payments");
    const { customerBalances } = await import("@/server/queries/receivables");
    const retailerA = await prisma.customer.findFirstOrThrow({ where: { name: "Retailer A" } });
    const invoiceA = await prisma.invoice.findUniqueOrThrow({ where: { id: ids.invoiceAId } });
    const before = (await customerBalances(retailerA.id)).get(retailerA.id)!.outstanding;
    await recordPayment(actors.admin, { reference: undefined, notes: undefined, customerId: retailerA.id, paymentDate: "2026-11-17", amount: "875", mode: "CASH", autoAllocate: false, allocations: [{ invoiceId: invoiceA.id, amount: "875" }] });
    const after = (await customerBalances(retailerA.id)).get(retailerA.id)!.outstanding;
    expect(D(before).minus(D(after)).toFixed(2)).toBe("875.00");
    const allocated = await prisma.paymentAllocation.aggregate({ where: { invoiceId: invoiceA.id }, _sum: { amount: true } });
    expect(D(allocated._sum.amount ?? 0).toFixed(2)).toBe("4875.00"); // ₹4,000 benchmark + ₹875
    await expect(
      recordPayment(actors.admin, { reference: undefined, notes: undefined, customerId: retailerA.id, paymentDate: "2026-11-17", amount: "9000", mode: "UPI", autoAllocate: false, allocations: [{ invoiceId: invoiceA.id, amount: "9000" }] }),
    ).rejects.toThrow(/exceeds the balance/);
  });
});

describe("server-side authorization on real API routes", () => {
  const sessions: Record<string, string> = {};
  const req = (url: string, role: string | null, init: { method?: string; body?: unknown } = {}) =>
    new NextRequest(`http://localhost${url}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { ...(role ? { cookie: `sutra_session=${sessions[role]}` } : {}), "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

  beforeAll(async () => {
    const { createSession } = await import("@/server/auth/session");
    for (const [key, actor] of Object.entries(actors)) sessions[key] = (await createSession(actor.id, {})).token;
  });

  it("rejects requests without a session", async () => {
    const { GET } = await import("@/app/api/factory/route");
    expect((await GET(req("/api/factory", null), ctx())).status).toBe(401);
  });

  it("stops a salesman from approving orders or opening the twin", async () => {
    const { POST } = await import("@/app/api/orders/[id]/decision/route");
    expect((await POST(req(`/api/orders/${ids.orderBId}/decision`, "salesmanA", { body: { decision: "APPROVE" } }), ctx({ id: ids.orderBId }))).status).toBe(403);
    const { GET } = await import("@/app/api/factory/route");
    expect((await GET(req("/api/factory", "salesmanA"), ctx())).status).toBe(403);
  });

  it("keeps the accountant read-only", async () => {
    const retailerA = await prisma.customer.findFirstOrThrow({ where: { name: "Retailer A" } });
    const payments = await import("@/app/api/payments/route");
    const res = await payments.POST(req("/api/payments", "accountant", { body: { customerId: retailerA.id, paymentDate: "2026-11-17", amount: "1", mode: "CASH" } }), ctx());
    expect(res.status).toBe(403);
    const { GET } = await import("@/app/api/factory/route");
    expect((await GET(req("/api/factory", "accountant"), ctx())).status).toBe(200);
  });

  it("stops production from invoicing and the owner from posting purchases", async () => {
    const invoices = await import("@/app/api/invoices/route");
    expect((await invoices.POST(req("/api/invoices", "supervisor", { body: { orderId: ids.orderBId, lines: [{ orderItemId: "x", quantity: "1" }] } }), ctx())).status).toBe(403);
    const purchases = await import("@/app/api/purchases/route");
    expect((await purchases.POST(req("/api/purchases", "owner", { body: {} }), ctx())).status).toBe(403);
  });

  it("lets the admin amend an order and validates the body", async () => {
    const route = await import("@/app/api/orders/[id]/route");
    const line = await prisma.salesOrderItem.findFirstOrThrow({ where: { orderId: ids.orderBId } });
    const bad = await route.PATCH(req(`/api/orders/${ids.orderBId}`, "admin", { method: "PATCH", body: { reason: "x", lines: [] } }), ctx({ id: ids.orderBId }));
    expect(bad.status).toBe(400);
    // Distributor B agrees to take what is available now (88 less anything reserved by later invoices).
    const { orderAvailability } = await import("@/server/services/availability");
    const available = (await orderAvailability(prisma, ids.orderBId))[0].available;
    const ok = await route.PATCH(req(`/api/orders/${ids.orderBId}`, "admin", { method: "PATCH", body: { reason: "Distributor accepts available stock", lines: [{ orderItemId: line.id, quantity: available, rate: "50" }] } }), ctx({ id: ids.orderBId }));
    expect(ok.status).toBe(200);
    const a = await orderAvailability(prisma, ids.orderBId);
    expect(a[0].ordered).toBe(available);
    expect(a[0].shortage).toBe("0");
  });
});
