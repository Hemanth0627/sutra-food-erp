import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { PurchaseForm } from "./purchase-form";

export const metadata = { title: "Record purchase" };

export default async function NewPurchasePage() {
  await requirePageUser("purchases:create");
  const [suppliers, items, units] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { kind: { not: "FINISHED_GOOD" }, isActive: true }, include: { unit: true, balance: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.unit.findMany({ orderBy: { code: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Record purchase" description="Enter the supplier invoice once; stock, weighted-average cost and the purchase register update automatically." />
      <PurchaseForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        items={items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, unitId: i.unitId, unitCode: i.unit.code, dimension: i.unit.dimension, onHand: i.balance?.quantity.toString() ?? "0", avgCost: i.balance?.avgCost.toString() ?? "0" }))}
        units={units.map((u) => ({ id: u.id, code: u.code, dimension: u.dimension, toBase: u.toBase.toString() }))}
      />
    </>
  );
}
