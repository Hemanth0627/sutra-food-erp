import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { BomEditor } from "@/components/forms/bom-editor";

export const metadata = { title: "New BOM" };

export default async function NewBomPage() {
  await requirePageUser("bom:manage");
  const [products, items, units] = await Promise.all([
    prisma.product.findMany({ include: { item: true }, orderBy: { sku: "asc" } }),
    prisma.item.findMany({ where: { kind: { not: "FINISHED_GOOD" }, isActive: true }, include: { balance: true }, orderBy: { name: "asc" } }),
    prisma.unit.findMany(),
  ]);
  return (
    <>
      <PageHeader title="New bill of materials" description="Define the recipe for one batch. It is saved as draft v1; activate it to use it in production." />
      <BomEditor
        mode="create"
        products={products.map((p) => ({ id: p.id, name: p.item.name, sku: p.sku }))}
        items={items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, unitId: i.unitId, avgCost: i.balance?.avgCost.toString() ?? "0" }))}
        units={units.map((u) => ({ id: u.id, code: u.code, dimension: u.dimension, toBase: u.toBase.toString() }))}
      />
    </>
  );
}
