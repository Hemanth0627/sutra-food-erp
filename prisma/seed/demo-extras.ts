import type { PrismaClient } from "@prisma/client";
import { isoDateIst } from "@/lib/dates";
import { createPurchaseOrder } from "@/server/services/purchase-orders";
import type { Actors } from "./master-data";

/**
 * Demo data that is NOT part of the mandatory benchmark: one open purchase order for packaging
 * (pouches are approaching their reorder level after the benchmark run). A purchase order never
 * moves stock, so none of the benchmark figures change. Skipped if any purchase order exists.
 */
export async function seedDemoExtras(prisma: PrismaClient, actors: Actors, log: (msg: string) => void = () => {}) {
  if (await prisma.purchaseOrder.count()) return;
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: "SUP-0003" } });
  const pouch = await prisma.item.findUniqueOrThrow({ where: { code: "PK-POUCH200" } });
  const carton = await prisma.item.findUniqueOrThrow({ where: { code: "PK-CARTON" } });
  const pcs = await prisma.unit.findUniqueOrThrow({ where: { code: "PCS" } });
  const today = new Date();
  const iso = isoDateIst;
  const po = await createPurchaseOrder(actors.admin, {
    supplierId: supplier.id,
    orderDate: iso(today),
    expectedDate: iso(new Date(today.getTime() + 4 * 86400_000)),
    notes: "Packaging top-up before the next Murukku batches (demo, not part of the benchmark)",
    items: [
      { itemId: pouch.id, unitId: pcs.id, quantity: "1000", rate: "2.5", gstRate: "18" },
      { itemId: carton.id, unitId: pcs.id, quantity: "50", rate: "15", gstRate: "12" },
    ],
  });
  log(`Demo extra: open purchase order ${po.poNo} for pouches and cartons (no stock movement)`);
}
