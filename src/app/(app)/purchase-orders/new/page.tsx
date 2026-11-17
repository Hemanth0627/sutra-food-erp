import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { D } from "@/lib/decimal";
import { PageHeader } from "@/components/app/page-header";
import { PurchaseOrderForm } from "./po-form";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  await requirePageUser("purchases:create");
  const [suppliers, items, units] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { kind: { not: "FINISHED_GOOD" }, isActive: true }, include: { unit: true, balance: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.unit.findMany({ orderBy: { code: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New purchase order" description="Commit to a supplier before the goods arrive. Receiving against the PO later posts the stock." />
      <PurchaseOrderForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          unitId: i.unitId,
          unitCode: i.unit.code,
          dimension: i.unit.dimension,
          onHand: D(i.balance?.quantity ?? 0).toFixed(),
          reorder: D(i.reorderLevel).toFixed(),
          lastRate: D(i.balance?.avgCost ?? 0).toDecimalPlaces(2).toFixed(),
        }))}
        units={units.map((u) => ({ id: u.id, code: u.code, dimension: u.dimension }))}
      />
    </>
  );
}
