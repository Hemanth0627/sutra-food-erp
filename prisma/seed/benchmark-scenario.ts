/**
 * Mandatory benchmark scenario (assignment section 6.2), executed through the same service layer
 * the API uses, so the seeded numbers prove the real business logic rather than inserted values.
 */
import type { PrismaClient } from "@prisma/client";
import { isoDateIst } from "../../src/lib/dates";
import { finishedGoodsAvailability, orderAvailability } from "../../src/server/services/availability";
import { dispatchInvoice } from "../../src/server/services/dispatch";
import { createExpense } from "../../src/server/services/expenses";
import { createInvoice } from "../../src/server/services/invoices";
import { createOrder, decideOrder } from "../../src/server/services/orders";
import { recordPayment } from "../../src/server/services/payments";
import { completeProductionRun, createProductionRun, startProductionRun } from "../../src/server/services/production";
import { createPurchase } from "../../src/server/services/purchases";
import type { Actors } from "./master-data";

export interface BenchmarkIds {
  purchaseId: string;
  runId: string;
  orderAId: string;
  invoiceAId: string;
  dispatchAId: string;
  orderBId: string;
  paymentId: string;
}

// Fixed client references keep the scenario idempotent (re-running does not duplicate orders).
export const ORDER_A_REF = "6f0c2d1e-1a2b-4c3d-8e4f-5a6b7c8d9e01";
export const ORDER_B_REF = "6f0c2d1e-1a2b-4c3d-8e4f-5a6b7c8d9e02";

export async function runBenchmarkScenario(prisma: PrismaClient, actors: Actors, log: (msg: string) => void = () => {}): Promise<BenchmarkIds> {
  const today = isoDateIst(new Date());
  const item = async (code: string) => (await prisma.item.findUniqueOrThrow({ where: { code } })).id;
  const kg = await prisma.unit.findUniqueOrThrow({ where: { code: "KG" } });
  const flourSupplier = await prisma.supplier.findUniqueOrThrow({ where: { code: "SUP-0001" } });
  const murukku = await prisma.product.findUniqueOrThrow({ where: { sku: "FG-MURUKKU-200" } });
  const retailerA = await prisma.customer.findFirstOrThrow({ where: { name: "Retailer A" } });
  const distributorB = await prisma.customer.findFirstOrThrow({ where: { name: "Distributor B" } });

  // 1. Purchase 60 kg flour at ₹45/kg (flour is GST-exempt: 0%).
  const purchase = await createPurchase(actors.admin, {
    supplierId: flourSupplier.id,
    supplierInvoiceNo: "SLFM/26-27/0412",
    invoiceDate: today,
    receivedDate: today,
    notes: "Benchmark step 1",
    items: [{ itemId: await item("RM-FLOUR"), unitId: kg.id, quantity: "60", rate: "45", gstRate: "0", batchNo: "FL-0412", expiryDate: undefined }],
  });
  log(`1. Purchase ${purchase.purchaseNo}: 60 kg flour @ ₹45`);

  // 2. One Murukku production run from the active BOM (1 batch = 200 packets).
  const bomVersion = await prisma.bomVersion.findFirstOrThrow({ where: { bom: { productId: murukku.id }, status: "ACTIVE" } });
  const run = await createProductionRun(actors.supervisor, {
    productId: murukku.id,
    bomVersionId: bomVersion.id,
    plannedBatches: "1",
    plannedDate: today,
    notes: "Benchmark production run",
  });
  // Issue to the line: actual raw-material quantities + the standard packaging quantities.
  await startProductionRun(actors.supervisor, run.id, {
    materials: [
      { itemId: await item("RM-FLOUR"), actualQty: "40" },
      { itemId: await item("RM-OIL"), actualQty: "10.5" },
      { itemId: await item("RM-SPICE"), actualQty: "1.2" },
      { itemId: await item("PK-POUCH200"), actualQty: "200" },
      { itemId: await item("PK-CARTON"), actualQty: "10" },
    ],
  });
  // 3 + 4. Actual consumption and output: 188 good packets, 6 damaged pouches, 9 cartons.
  // Pouches: 188 filled + 6 damaged = 194 deducted; the 6 unused pouches go back to stores (never deducted).
  await completeProductionRun(actors.supervisor, run.id, {
    actualGoodOutput: "188",
    scrapQty: undefined,
    scrapNotes: "Yield loss of 12 packets (broken/undersized pieces)",
    materials: [
      { itemId: await item("RM-FLOUR"), actualQty: "40", damagedQty: "0" },
      { itemId: await item("RM-OIL"), actualQty: "10.5", damagedQty: "0" },
      { itemId: await item("RM-SPICE"), actualQty: "1.2", damagedQty: "0" },
      { itemId: await item("PK-POUCH200"), actualQty: "188", damagedQty: "6" },
      { itemId: await item("PK-CARTON"), actualQty: "9", damagedQty: "0" },
    ],
  });
  log(`2-4. Production ${run.runNo}: 188 good, 6 damaged pouches, 9 cartons`);

  // 5. Salesman A orders 150 packets for Retailer A.
  const { order: orderA } = await createOrder(actors.salesmanA, {
    clientRef: ORDER_A_REF,
    customerId: retailerA.id,
    notes: "Benchmark order (Retailer A)",
    capturedOffline: false,
    items: [{ productId: murukku.id, quantity: "150" }],
  });
  // 6. Admin approves, invoices (intra-state: CGST + SGST) and dispatches.
  await decideOrder(actors.admin, orderA.id, "APPROVE");
  const lineA = await prisma.salesOrderItem.findFirstOrThrow({ where: { orderId: orderA.id } });
  const invoiceA = await createInvoice(actors.admin, { orderId: orderA.id, invoiceDate: today, lines: [{ orderItemId: lineA.id, quantity: "150" }] });
  const dispatchA = await dispatchInvoice(actors.admin, { invoiceId: invoiceA.id, dispatchDate: today, vehicleNo: "TN 37 AB 1234", transporter: "Own vehicle" });
  log(`5-6. ${orderA.orderNo} → ${invoiceA.invoiceNo} (₹${invoiceA.grandTotal}) → ${dispatchA.dispatchNo}`);

  // 7. Salesman B orders 120 packets for Distributor B (Karnataka).
  const { order: orderB } = await createOrder(actors.salesmanB, {
    clientRef: ORDER_B_REF,
    customerId: distributorB.id,
    notes: "Benchmark order (Distributor B)",
    capturedOffline: false,
    items: [{ productId: murukku.id, quantity: "120" }],
  });
  // 8. Stock check: 88 available vs 120 ordered → shortage of 32. The order stays PENDING (not invoiced/dispatched).
  const availability = await orderAvailability(prisma, orderB.id);
  const fg = (await finishedGoodsAvailability(prisma, [murukku.id])).get(murukku.id)!;
  log(`7-8. ${orderB.orderNo}: available ${fg.available.toFixed()} → shortage ${availability[0].shortage} packets`);
  await prisma.auditLog.create({
    data: {
      userId: actors.admin.id,
      action: "order.stock-check",
      entityType: "SalesOrder",
      entityId: orderB.id,
      summary: `Stock check for ${orderB.orderNo}: ordered 120, available ${fg.available.toFixed()}, shortage ${availability[0].shortage} packets. Order held pending.`,
    },
  });

  // 9. ₹4,000 received from Retailer A (allocated to the oldest open invoice).
  const payment = await recordPayment(actors.admin, {
    customerId: retailerA.id,
    paymentDate: today,
    amount: "4000",
    mode: "UPI",
    reference: "UPI-DEMO-0001",
    notes: "Benchmark step 9",
    autoAllocate: true,
    allocations: [],
  });
  log(`9. Payment ${payment.receiptNo}: ₹4,000 from Retailer A`);

  // 10. Production expenses charged directly to the run.
  await createExpense(actors.supervisor, {
    expenseDate: today,
    category: "LABOUR",
    amount: "1200",
    description: "Labour for Murukku batch",
    allocationMethod: "DIRECT",
    productionRunId: run.id,
  });
  await createExpense(actors.supervisor, {
    expenseDate: today,
    category: "GAS_AND_POWER",
    amount: "600",
    description: "Gas and power for Murukku batch",
    allocationMethod: "DIRECT",
    productionRunId: run.id,
  });
  log("10. Expenses: labour ₹1,200, gas & power ₹600");

  return {
    purchaseId: purchase.id,
    runId: run.id,
    orderAId: orderA.id,
    invoiceAId: invoiceA.id,
    dispatchAId: dispatchA.id,
    orderBId: orderB.id,
    paymentId: payment.id,
  };
}
