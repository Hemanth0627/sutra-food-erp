/**
 * End-to-end benchmark test against a real PostgreSQL database (TEST_DATABASE_URL).
 * The test database is reset with the project's migrations, seeded with the fictional master data and
 * the mandatory scenario is replayed through the service layer. Every expected number from the
 * assignment (sections 6.3–6.5) is then asserted against the posted records.
 */
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { D } from "@/lib/decimal";
import { explodeBomLine } from "@/lib/production";

const testUrl = process.env.TEST_DATABASE_URL ?? "";
const mainUrl = process.env.MAIN_DATABASE_URL ?? "";

let prisma: PrismaClient;
let actors: Awaited<ReturnType<typeof import("../../prisma/seed/master-data").seedMasterData>>;
let ids: Awaited<ReturnType<typeof import("../../prisma/seed/benchmark-scenario").runBenchmarkScenario>>;

const balance = async (code: string) => {
  const item = await prisma.item.findUniqueOrThrow({ where: { code }, include: { balance: true } });
  return D(item.balance?.quantity ?? 0);
};

beforeAll(async () => {
  if (!testUrl) throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env and start PostgreSQL (npm run db:up).");
  if (testUrl === mainUrl) throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL");
  if (!/test/i.test(new URL(testUrl).pathname)) throw new Error("Refusing to reset a database whose name does not contain 'test'");
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/server/db"));
  const { seedMasterData } = await import("../../prisma/seed/master-data");
  const { runBenchmarkScenario } = await import("../../prisma/seed/benchmark-scenario");
  actors = await seedMasterData(prisma, "Demo@1234");
  ids = await runBenchmarkScenario(prisma, actors);
});

describe("benchmark scenario (posted records)", () => {
  it("purchase receipt: 60 kg flour at ₹45 = ₹2,700, posted to the ledger", async () => {
    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: ids.purchaseId }, include: { items: true } });
    expect(purchase.grandTotal.toFixed(2)).toBe("2700.00");
    const txn = await prisma.inventoryTransaction.findFirstOrThrow({ where: { sourceType: "PURCHASE", sourceId: purchase.id } });
    expect(txn.movementType).toBe("PURCHASE_RECEIPT");
    expect(txn.quantity.toString()).toBe("60");
    expect(txn.balanceBefore.toString()).toBe("100");
    expect(txn.balanceAfter.toString()).toBe("160");
  });

  it("weighted-average flour valuation is ₹43.125/kg", async () => {
    const txn = await prisma.inventoryTransaction.findFirstOrThrow({ where: { sourceType: "PURCHASE", sourceId: ids.purchaseId } });
    expect(D(txn.valueAfter).div(D(txn.balanceAfter)).toString()).toBe("43.125");
    const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: ids.runId }, include: { materials: { include: { item: true } } } });
    expect(run.materials.find((m) => m.item.code === "RM-FLOUR")!.unitCost!.toString()).toBe("43.125");
  });

  it("BOM consumption: run requirements equal the BOM for one batch", async () => {
    const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: ids.runId }, include: { materials: { include: { item: true } } } });
    const planned = Object.fromEntries(run.materials.map((m) => [m.item.code, m.plannedQty.toString()]));
    expect(planned).toEqual({ "RM-FLOUR": "40", "RM-OIL": "10", "RM-SPICE": "1.2", "PK-POUCH200": "200", "PK-CARTON": "10" });
    expect(run.plannedOutput.toString()).toBe("200");
  });

  it("unit conversion: the Mixture BOM's 1500 g of spice explodes to 1.5 kg", async () => {
    const line = await prisma.bomItem.findFirstOrThrow({
      where: { bomVersion: { bom: { code: "BOM-MIXTURE" } }, item: { code: "RM-SPICE" } },
      include: { unit: true, item: { include: { unit: true } } },
    });
    expect(line.unit.code).toBe("G");
    expect(explodeBomLine({ itemId: line.itemId, quantity: line.quantity, unit: line.unit, stockUnit: line.item.unit }, "1").toString()).toBe("1.5");
  });

  it("raw-material closing stock: flour 120 kg, oil 19.5 L, spice 3.8 kg", async () => {
    expect((await balance("RM-FLOUR")).toString()).toBe("120");
    expect((await balance("RM-OIL")).toString()).toBe("19.5");
    expect((await balance("RM-SPICE")).toString()).toBe("3.8");
  });

  it("packaging closing stock: pouches 306 (194 used incl. 6 damaged), cartons 21", async () => {
    expect((await balance("PK-POUCH200")).toString()).toBe("306");
    expect((await balance("PK-CARTON")).toString()).toBe("21");
    const damaged = await prisma.inventoryTransaction.findFirstOrThrow({ where: { sourceId: ids.runId, movementType: "DAMAGED_MATERIAL" }, include: { item: true } });
    expect(damaged.item.code).toBe("PK-POUCH200");
    expect(damaged.quantity.toString()).toBe("-6");
  });

  it("finished goods: 238 after production, 88 after dispatch", async () => {
    const output = await prisma.inventoryTransaction.findFirstOrThrow({ where: { sourceId: ids.runId, movementType: "PRODUCTION_OUTPUT" } });
    expect(output.quantity.toString()).toBe("188");
    expect(output.balanceAfter.toString()).toBe("238");
    const dispatch = await prisma.inventoryTransaction.findFirstOrThrow({ where: { sourceType: "DISPATCH", sourceId: ids.dispatchAId } });
    expect(dispatch.movementType).toBe("SALES_DISPATCH");
    expect(dispatch.quantity.toString()).toBe("-150");
    expect(dispatch.balanceAfter.toString()).toBe("88");
    expect((await balance("FG-MURUKKU-200")).toString()).toBe("88");
  });

  it("yield variance −6% and oil consumption variance +5% are flagged against the 3% tolerance", async () => {
    const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: ids.runId }, include: { materials: { include: { item: true } } } });
    expect(run.yieldVariancePct!.toString()).toBe("-6");
    expect(run.actualYieldPct!.toString()).toBe("94");
    const oil = run.materials.find((m) => m.item.code === "RM-OIL")!;
    expect(oil.variancePct!.toString()).toBe("5");
    expect(oil.isFlagged).toBe(true);
    expect(run.hasVarianceAlert).toBe(true);
    expect(run.materials.find((m) => m.item.code === "RM-FLOUR")!.isFlagged).toBe(false);
  });

  it("GST invoice for Retailer A: ₹7,500 + CGST ₹187.50 + SGST ₹187.50 = ₹7,875", async () => {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: ids.invoiceAId }, include: { items: true } });
    expect(inv.supplyType).toBe("INTRA_STATE");
    expect(inv.taxableTotal.toFixed(2)).toBe("7500.00");
    expect(inv.cgstTotal.toFixed(2)).toBe("187.50");
    expect(inv.sgstTotal.toFixed(2)).toBe("187.50");
    expect(inv.igstTotal.toFixed(2)).toBe("0.00");
    expect(inv.grandTotal.toFixed(2)).toBe("7875.00");
    expect(inv.invoiceNo).toMatch(/^INV\/\d{4}-\d{2}\/0001$/);
    expect(inv.items[0].hsnCode).toBe("2106");
  });

  it("Retailer A outstanding is ₹3,875 after the ₹4,000 receipt", async () => {
    const alloc = await prisma.paymentAllocation.findFirstOrThrow({ where: { paymentId: ids.paymentId } });
    expect(alloc.invoiceId).toBe(ids.invoiceAId);
    expect(alloc.amount.toFixed(2)).toBe("4000.00");
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: ids.invoiceAId } });
    expect(D(inv.grandTotal).minus(alloc.amount).toFixed(2)).toBe("3875.00");
  });

  it("Distributor B: 32-packet shortage, order not invoiced or dispatched", async () => {
    const { orderAvailability } = await import("@/server/services/availability");
    const avail = await orderAvailability(prisma, ids.orderBId);
    expect(avail[0].available).toBe("88");
    expect(avail[0].shortage).toBe("32");
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: ids.orderBId }, include: { invoices: true } });
    expect(order.status).toBe("PENDING");
    expect(order.invoices).toHaveLength(0);
  });

  it("cost per packet: ₹5,855 / 188 = ₹31.14", async () => {
    const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: ids.runId }, include: { materials: { include: { item: true } } } });
    const cost = Object.fromEntries(run.materials.map((m) => [m.item.code, m.totalCost!.toFixed(2)]));
    expect(cost).toEqual({ "RM-FLOUR": "1725.00", "RM-OIL": "1470.00", "RM-SPICE": "240.00", "PK-POUCH200": "485.00", "PK-CARTON": "135.00" });
    expect(run.labourCost.toFixed(2)).toBe("1200.00");
    expect(run.energyCost.toFixed(2)).toBe("600.00");
    expect(run.totalCost!.toFixed(2)).toBe("5855.00");
    expect(run.costPerUnit!.toFixed(2)).toBe("31.14");
  });

  it("all benchmark checks pass and the balance cache reconciles with the ledger", async () => {
    const { collectBenchmarkChecks } = await import("@/server/benchmark");
    const { checks, ready } = await collectBenchmarkChecks(prisma);
    expect(ready).toBe(true);
    expect(checks.filter((c) => !c.pass)).toEqual([]);
    const { reconcileInventory } = await import("@/server/inventory");
    const rows = await prisma.$transaction((tx) => reconcileInventory(tx));
    expect(rows.filter((r) => !r.matches)).toEqual([]);
  });
});

describe("integrity guards", () => {
  it("historical run cost does not change when flour is bought at a new price", async () => {
    const { createPurchase } = await import("@/server/services/purchases");
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: "SUP-0001" } });
    const kg = await prisma.unit.findUniqueOrThrow({ where: { code: "KG" } });
    const flour = await prisma.item.findUniqueOrThrow({ where: { code: "RM-FLOUR" } });
    await createPurchase(actors.admin, {
      supplierId: supplier.id,
      supplierInvoiceNo: "TEST-PRICE-CHANGE",
      invoiceDate: "2026-11-18",
      receivedDate: "2026-11-18",
      notes: undefined,
      items: [{ itemId: flour.id, unitId: kg.id, quantity: "10", rate: "60", gstRate: "0", batchNo: undefined, expiryDate: undefined }],
    });
    const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: ids.runId } });
    expect(run.totalCost!.toFixed(2)).toBe("5855.00");
  });

  it("a production run cannot be completed twice", async () => {
    const { completeProductionRun } = await import("@/server/services/production");
    await expect(
      completeProductionRun(actors.supervisor, ids.runId, { actualGoodOutput: "188", scrapQty: undefined, scrapNotes: undefined, materials: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("an invoice cannot be dispatched twice", async () => {
    const { dispatchInvoice } = await import("@/server/services/dispatch");
    await expect(dispatchInvoice(actors.admin, { invoiceId: ids.invoiceAId })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await balance("FG-MURUKKU-200")).toString()).toBe("88");
  });

  it("re-syncing an offline order with the same clientRef does not duplicate it", async () => {
    const { createOrder } = await import("@/server/services/orders");
    const { ORDER_A_REF } = await import("../../prisma/seed/benchmark-scenario");
    const before = await prisma.salesOrder.count();
    const murukku = await prisma.product.findUniqueOrThrow({ where: { sku: "FG-MURUKKU-200" } });
    const retailerA = await prisma.customer.findFirstOrThrow({ where: { name: "Retailer A" } });
    const res = await createOrder(actors.salesmanA, {
      clientRef: ORDER_A_REF,
      customerId: retailerA.id,
      notes: undefined,
      capturedOffline: true,
      items: [{ productId: murukku.id, quantity: "150" }],
    });
    expect(res.duplicate).toBe(true);
    expect(res.order.id).toBe(ids.orderAId);
    expect(await prisma.salesOrder.count()).toBe(before);
  });

  it("payment allocations cannot exceed the invoice balance", async () => {
    const { recordPayment } = await import("@/server/services/payments");
    const retailerA = await prisma.customer.findFirstOrThrow({ where: { name: "Retailer A" } });
    await expect(
      recordPayment(actors.admin, {
        customerId: retailerA.id,
        paymentDate: "2026-11-18",
        amount: "5000",
        mode: "CASH",
        reference: undefined,
        notes: undefined,
        autoAllocate: false,
        allocations: [{ invoiceId: ids.invoiceAId, amount: "3875.01" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("stock can never go negative", async () => {
    const { adjustStock } = await import("@/server/services/stock");
    const flour = await prisma.item.findUniqueOrThrow({ where: { code: "RM-FLOUR" } });
    await expect(
      adjustStock(actors.admin, { itemId: flour.id, type: "DAMAGED_MATERIAL", direction: "DECREASE", quantity: "1000", reason: "Test over-issue" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("posted invoices and ledger rows are immutable at the database level", async () => {
    await expect(prisma.invoice.update({ where: { id: ids.invoiceAId }, data: { grandTotal: "1.00" } })).rejects.toThrow(/cannot be edited/);
    await expect(prisma.invoice.delete({ where: { id: ids.invoiceAId } })).rejects.toThrow();
    const txn = await prisma.inventoryTransaction.findFirstOrThrow();
    await expect(prisma.inventoryTransaction.update({ where: { id: txn.id }, data: { notes: "tamper" } })).rejects.toThrow(/append-only/);
  });

  it("Distributor B cannot be invoiced for unavailable stock; a partial invoice uses IGST", async () => {
    const { decideOrder } = await import("@/server/services/orders");
    const { createInvoice } = await import("@/server/services/invoices");
    await decideOrder(actors.admin, ids.orderBId, "APPROVE");
    const line = await prisma.salesOrderItem.findFirstOrThrow({ where: { orderId: ids.orderBId } });
    await expect(createInvoice(actors.admin, { orderId: ids.orderBId, lines: [{ orderItemId: line.id, quantity: "120" }] })).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
      details: { shortages: [expect.objectContaining({ shortage: "32", available: "88" })] },
    });
    const partial = await createInvoice(actors.admin, { orderId: ids.orderBId, lines: [{ orderItemId: line.id, quantity: "88" }] });
    expect(partial.supplyType).toBe("INTER_STATE");
    expect(partial.igstTotal.toFixed(2)).toBe("220.00");
    expect(partial.cgstTotal.toFixed(2)).toBe("0.00");
    expect(partial.grandTotal.toFixed(2)).toBe("4620.00");
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: ids.orderBId } });
    expect(order.status).toBe("PARTIALLY_FULFILLED");
  });

  it("cancelling an invoice posts a credit note and releases the reservation", async () => {
    const { cancelInvoice } = await import("@/server/services/invoices");
    const inv = await prisma.invoice.findFirstOrThrow({ where: { orderId: ids.orderBId, status: "ISSUED" } });
    const cn = await cancelInvoice(actors.admin, inv.id, { reason: "Customer asked to wait for the full quantity", returnStock: false });
    expect(cn.grandTotal.toFixed(2)).toBe("4620.00");
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("CANCELLED");
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: ids.orderBId } });
    expect(order.status).toBe("APPROVED");
    const audits = await prisma.auditLog.count({ where: { action: "invoice.cancel", entityId: inv.id } });
    expect(audits).toBe(1);
  });
});
