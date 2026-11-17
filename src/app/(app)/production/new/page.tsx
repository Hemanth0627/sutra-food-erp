import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { NewRunForm } from "./new-run-form";

export const metadata = { title: "New production run" };

export default async function NewRunPage() {
  await requirePageUser("production:manage");
  const products = await prisma.product.findMany({
    where: { item: { isActive: true } },
    include: {
      item: true,
      boms: {
        include: {
          versions: {
            where: { status: "ACTIVE" },
            include: { items: { include: { item: { include: { unit: true, balance: true } }, unit: true }, orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
    orderBy: { sku: "asc" },
  });
  const options = products.map((p) => ({
    id: p.id,
    name: p.item.name,
    versions: p.boms.flatMap((b) =>
      b.versions.map((v) => ({
        id: v.id,
        label: `${b.code} v${v.versionNo}`,
        batchSize: v.batchSize.toString(),
        yieldPct: v.expectedYieldPct.toString(),
        lines: v.items.map((l) => ({
          itemId: l.itemId,
          name: l.item.name,
          kind: l.item.kind,
          quantity: l.quantity.toString(),
          unit: { code: l.unit.code, dimension: l.unit.dimension, toBase: l.unit.toBase.toString() },
          stockUnit: { code: l.item.unit.code, dimension: l.item.unit.dimension, toBase: l.item.unit.toBase.toString() },
          onHand: l.item.balance?.quantity.toString() ?? "0",
          avgCost: l.item.balance?.avgCost.toString() ?? "0",
        })),
      })),
    ),
  }));
  return (
    <>
      <PageHeader title="New production run" description="Choose the product and its active BOM, enter the batches and review the standard material requirement before planning the run." />
      <NewRunForm products={options} />
    </>
  );
}
