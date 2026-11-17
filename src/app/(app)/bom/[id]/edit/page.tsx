import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { BomEditor } from "@/components/forms/bom-editor";

export const metadata = { title: "Edit BOM" };

export default async function EditBomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  await requirePageUser("bom:manage");
  const { id } = await params;
  const { from } = await searchParams;
  const bom = await prisma.bom.findUnique({ where: { id }, include: { product: { include: { item: true } }, versions: { include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { versionNo: "desc" } } } });
  if (!bom) notFound();
  const source = bom.versions.find((v) => v.id === from) ?? bom.versions.find((v) => v.status === "ACTIVE") ?? bom.versions[0];
  if (!source) notFound();
  const isDraft = source.status === "DRAFT";
  const nextNo = Math.max(...bom.versions.map((v) => v.versionNo)) + 1;
  const [items, units] = await Promise.all([
    prisma.item.findMany({ where: { kind: { not: "FINISHED_GOOD" }, isActive: true }, include: { balance: true }, orderBy: { name: "asc" } }),
    prisma.unit.findMany(),
  ]);
  return (
    <>
      <PageHeader
        title={isDraft ? `Edit draft v${source.versionNo} · ${bom.name}` : `New version v${nextNo} · ${bom.name}`}
        description={isDraft ? "Drafts can be edited freely until they are activated." : `Starting from v${source.versionNo}. v${source.versionNo} stays unchanged; runs already made with it keep using it.`}
      />
      <BomEditor
        mode={isDraft ? "edit-draft" : "new-version"}
        bomId={bom.id}
        versionId={source.id}
        items={items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, unitId: i.unitId, avgCost: i.balance?.avgCost.toString() ?? "0" }))}
        units={units.map((u) => ({ id: u.id, code: u.code, dimension: u.dimension, toBase: u.toBase.toString() }))}
        initial={{
          batchSize: source.batchSize.toString(),
          expectedYieldPct: source.expectedYieldPct.toString(),
          notes: source.notes ?? "",
          items: source.items.map((i) => ({ itemId: i.itemId, unitId: i.unitId, quantity: i.quantity.toString(), notes: i.notes ?? "" })),
        }}
      />
    </>
  );
}
