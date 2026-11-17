import type { PrismaClient } from "@prisma/client";
import { D, Dec, round2 } from "@/lib/decimal";
import { computeInvoice } from "@/lib/gst";
import { orderAvailability } from "./services/availability";

/**
 * Reads the benchmark results back from the posted database records (ledger rows, invoice, run
 * costing snapshot) and compares them with the expected values from the assignment (section 6.3/6.4).
 * Used by `npm run benchmark:verify`, the automated tests and the in-app Benchmark page.
 */
export interface BenchmarkCheck {
  group: "Inventory" | "Production" | "Sales & GST" | "Receivables" | "Costing";
  check: string;
  expected: string;
  actual: string;
  pass: boolean;
  source: string;
}

function cmp(expected: string, actual: Dec | null | undefined, dp: number): { actual: string; pass: boolean } {
  if (actual === null || actual === undefined) return { actual: "missing", pass: false };
  const a = actual.toDecimalPlaces(dp);
  return { actual: a.toFixed(dp), pass: a.eq(D(expected)) };
}

export async function collectBenchmarkChecks(prisma: PrismaClient): Promise<{ ready: boolean; checks: BenchmarkCheck[] }> {
  const murukku = await prisma.product.findUnique({ where: { sku: "FG-MURUKKU-200" } });
  const run = murukku
    ? await prisma.productionRun.findFirst({
        where: { productId: murukku.id, status: "COMPLETED" },
        orderBy: { completedAt: "asc" },
        include: { materials: { include: { item: true } } },
      })
    : null;
  const retailerA = await prisma.customer.findFirst({ where: { name: "Retailer A" } });
  const distributorB = await prisma.customer.findFirst({ where: { name: "Distributor B" } });
  const invoiceA = retailerA
    ? await prisma.invoice.findFirst({ where: { customerId: retailerA.id }, orderBy: { sequence: "asc" }, include: { dispatch: true } })
    : null;
  // Distributor B's first order (works for the seeded scenario and for a live demo entered in the UI).
  const orderB = distributorB ? await prisma.salesOrder.findFirst({ where: { customerId: distributorB.id }, orderBy: { createdAt: "asc" } }) : null;
  if (!murukku || !run || !retailerA || !distributorB || !invoiceA || !orderB) return { ready: false, checks: [] };

  const ledger = await prisma.inventoryTransaction.findMany({
    where: { sourceType: "PRODUCTION_RUN", sourceId: run.id },
    include: { item: true },
    orderBy: { createdAt: "asc" },
  });
  const lastBalance = (code: string) => {
    const rows = ledger.filter((l) => l.item.code === code);
    return rows.length ? D(rows[rows.length - 1].balanceAfter) : null;
  };
  const dispatchRow = invoiceA.dispatch
    ? await prisma.inventoryTransaction.findFirst({ where: { sourceType: "DISPATCH", sourceId: invoiceA.dispatch.id } })
    : null;
  const mat = (code: string) => run.materials.find((m) => m.item.code === code);

  const invoices = await prisma.invoice.aggregate({ where: { customerId: retailerA.id, status: "ISSUED" }, _sum: { grandTotal: true } });
  const payments = await prisma.payment.aggregate({ where: { customerId: retailerA.id }, _sum: { amount: true } });
  const outstanding = D(invoices._sum.grandTotal ?? 0).minus(D(payments._sum.amount ?? 0));

  const availability = await orderAvailability(prisma, orderB.id);
  const settings = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  const orderBItem = await prisma.salesOrderItem.findFirstOrThrow({ where: { orderId: orderB.id }, include: { product: true } });
  const igstPreview = computeInvoice(
    [{ quantity: orderBItem.quantity, rate: orderBItem.rate, gstRate: orderBItem.product.gstRate }],
    settings.stateCode,
    distributorB.stateCode,
  );

  const flour = mat("RM-FLOUR");
  const overheads = D(run.labourCost).plus(D(run.energyCost));
  const checks: BenchmarkCheck[] = [];
  const add = (group: BenchmarkCheck["group"], check: string, expected: string, actual: Dec | null | undefined, dp: number, source: string) =>
    checks.push({ group, check, expected: D(expected).toFixed(dp), ...cmp(expected, actual, dp), source });

  add("Inventory", "Flour closing stock (kg)", "120", lastBalance("RM-FLOUR"), 3, "Ledger balance after production issue");
  add("Inventory", "Oil closing stock (litres)", "19.5", lastBalance("RM-OIL"), 3, "Ledger balance after production issue");
  add("Inventory", "Spice mix closing stock (kg)", "3.8", lastBalance("RM-SPICE"), 3, "Ledger balance after production issue");
  add("Inventory", "Pouches closing stock", "306", lastBalance("PK-POUCH200"), 0, "Ledger balance after packaging + damage");
  add("Inventory", "Cartons closing stock", "21", lastBalance("PK-CARTON"), 0, "Ledger balance after packaging");
  add("Inventory", "Finished goods after production (packets)", "238", lastBalance(murukku.sku), 0, "Ledger balance after production output");
  add("Inventory", "Finished goods after dispatch (packets)", "88", dispatchRow ? D(dispatchRow.balanceAfter) : null, 0, "Ledger balance after sales dispatch");
  add("Production", "Yield variance", "-6", run.yieldVariancePct ? D(run.yieldVariancePct) : null, 2, "Run variance snapshot (%)");
  add("Production", "Oil consumption variance", "5", mat("RM-OIL")?.variancePct ? D(mat("RM-OIL")!.variancePct!) : null, 2, "Run material variance (%)");
  add("Production", "Weighted-average flour rate (₹/kg)", "43.125", flour?.unitCost ? D(flour.unitCost) : null, 3, "(100×42 + 60×45) / 160");
  add("Sales & GST", "Retailer A taxable amount (₹)", "7500", D(invoiceA.taxableTotal), 2, invoiceA.invoiceNo);
  add("Sales & GST", "CGST 2.5% (₹)", "187.50", D(invoiceA.cgstTotal), 2, invoiceA.invoiceNo);
  add("Sales & GST", "SGST 2.5% (₹)", "187.50", D(invoiceA.sgstTotal), 2, invoiceA.invoiceNo);
  add("Sales & GST", "Invoice total (₹)", "7875", D(invoiceA.grandTotal), 2, invoiceA.invoiceNo);
  add("Sales & GST", "Distributor B shortage (packets)", "32", availability[0] ? D(availability[0].shortage) : null, 0, `${orderB.orderNo} stock check (current)`);
  add("Sales & GST", "Distributor B IGST 5% if invoiced in full (₹)", "300", igstPreview.totals.igstTotal, 2, "Inter-state tax preview (KA)");
  add("Receivables", "Retailer A outstanding (₹)", "3875", outstanding, 2, "Invoices − receipts (current)");
  add("Costing", "Flour cost (₹)", "1725", mat("RM-FLOUR")?.totalCost ? D(mat("RM-FLOUR")!.totalCost!) : null, 2, "40 kg × ₹43.125");
  add("Costing", "Oil cost (₹)", "1470", mat("RM-OIL")?.totalCost ? D(mat("RM-OIL")!.totalCost!) : null, 2, "10.5 L × ₹140");
  add("Costing", "Spice mix cost (₹)", "240", mat("RM-SPICE")?.totalCost ? D(mat("RM-SPICE")!.totalCost!) : null, 2, "1.2 kg × ₹200");
  add("Costing", "Pouch cost (₹)", "485", mat("PK-POUCH200")?.totalCost ? D(mat("PK-POUCH200")!.totalCost!) : null, 2, "194 × ₹2.50 (188 used + 6 damaged)");
  add("Costing", "Carton cost (₹)", "135", mat("PK-CARTON")?.totalCost ? D(mat("PK-CARTON")!.totalCost!) : null, 2, "9 × ₹15");
  add("Costing", "Labour + gas & power (₹)", "1800", overheads, 2, "Direct expenses on the run");
  add("Costing", "Total production cost (₹)", "5855", run.totalCost ? D(run.totalCost) : null, 2, `${run.runNo} costing snapshot`);
  add("Costing", "Cost per good packet (₹)", "31.14", run.costPerUnit ? round2(run.costPerUnit) : null, 2, "₹5,855 / 188");

  return { ready: true, checks };
}

export function summarize(checks: BenchmarkCheck[]) {
  const passed = checks.filter((c) => c.pass).length;
  return { passed, total: checks.length, allPass: passed === checks.length && checks.length > 0 };
}
