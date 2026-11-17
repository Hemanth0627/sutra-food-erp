import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyPlus, Pencil } from "lucide-react";
import { D, formatINR, formatQty } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { bomVersionCosting } from "@/server/queries/bom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { SectionCard } from "@/components/app/widgets";
import { ActivateVersionButton } from "./activate-button";

export default async function BomDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requirePageUser("bom:view");
  const { id } = await params;
  const { v } = await searchParams;
  const bom = await prisma.bom.findUnique({ where: { id }, include: { product: { include: { item: true } }, versions: { include: { createdBy: true, _count: { select: { productionRuns: true } } }, orderBy: { versionNo: "desc" } } } });
  if (!bom) notFound();
  const selected = bom.versions.find((x) => x.id === v) ?? bom.versions.find((x) => x.status === "ACTIVE") ?? bom.versions[0];
  const costing = await bomVersionCosting(selected.id);
  const runs = await prisma.productionRun.findMany({ where: { bomVersionId: selected.id }, orderBy: { createdAt: "desc" }, take: 10 });
  const canManage = hasPermission(user.role, "bom:manage");
  const hasDraft = bom.versions.some((x) => x.status === "DRAFT");
  const expected = D(selected.batchSize).times(D(selected.expectedYieldPct)).div(100);
  return (
    <>
      <PageHeader
        title={bom.name}
        description={`${bom.code} · finished product ${bom.product.item.name} (${bom.product.sku})`}
        actions={canManage && (
          <>
            {selected.status === "DRAFT" && <Button asChild variant="outline"><Link href={`/bom/${bom.id}/edit?from=${selected.id}`}><Pencil /> Edit draft</Link></Button>}
            {selected.status === "DRAFT" && <ActivateVersionButton versionId={selected.id} versionNo={selected.versionNo} />}
            {selected.status !== "DRAFT" && !hasDraft && <Button asChild><Link href={`/bom/${bom.id}/edit?from=${selected.id}`}><CopyPlus /> New version from v{selected.versionNo}</Link></Button>}
          </>
        )}
      />
      {(() => {
        const draft = bom.versions.find((x) => x.status === "DRAFT");
        return draft && draft.id !== selected.id ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            <span>Draft v{draft.versionNo} is waiting for review. Production keeps using the active version until it is activated.</span>
            <Link href={`/bom/${bom.id}?v=${draft.id}`} className="font-medium underline underline-offset-4">Review draft v{draft.versionNo}</Link>
          </div>
        ) : null;
      })()}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {bom.versions.map((x) => (
                <li key={x.id}>
                  <Link href={`/bom/${bom.id}?v=${x.id}`} className={cn("flex items-center justify-between rounded-md px-2 py-2 text-sm", x.id === selected.id ? "bg-accent font-medium" : "hover:bg-accent/60")}>
                    <span>v{x.versionNo}<span className="block text-[11px] font-normal text-muted-foreground">{formatDate(x.activatedAt ?? x.createdAt)} · {x._count.productionRuns} run(s)</span></span>
                    <StatusBadge status={x.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Batch size</div><div className="tabular mt-1 text-xl font-semibold">{formatQty(selected.batchSize)} pkts</div></div>
            <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Expected yield</div><div className="tabular mt-1 text-xl font-semibold">{D(selected.expectedYieldPct).toFixed(0)}% · {formatQty(expected)}</div></div>
            <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Std material cost / batch</div><div className="tabular mt-1 text-xl font-semibold">{formatINR(costing.currentTotal)}</div><div className="text-[11px] text-muted-foreground">At activation: {costing.snapshotTotal ? formatINR(costing.snapshotTotal) : "—"}</div></div>
            <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Std material cost / packet</div><div className="tabular mt-1 text-xl font-semibold">{formatINR(costing.perUnitCurrent.toDecimalPlaces(2).toFixed(2))}</div><div className="text-[11px] text-muted-foreground">Raw {formatINR(costing.rawTotal)} · Pack {formatINR(costing.packTotal)}</div></div>
          </div>
          <Card>
            <CardHeader><CardTitle>Materials per batch · v{selected.versionNo}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>Material</TH><TH>Type</TH><TH className="text-right">Qty per batch</TH><TH className="text-right">In stock unit</TH><TH className="text-right">Rate at activation</TH><TH className="text-right">Current avg rate</TH><TH className="text-right">Std cost</TH><TH className="text-right">Batches in stock</TH></TR></THead>
                <TBody>
                  {costing.lines.map((l) => (
                    <TR key={l.id}>
                      <TD className="font-medium">{l.itemName}</TD>
                      <TD className="text-xs">{l.kind === "RAW_MATERIAL" ? "Raw" : "Packaging"}</TD>
                      <TD className="tabular text-right">{formatQty(l.quantity, 4)} {l.unit}</TD>
                      <TD className="tabular text-right">{formatQty(l.stockQty)} {l.stockUnit}</TD>
                      <TD className="tabular text-right">{l.snapshotRate ? formatINR(l.snapshotRate.toDecimalPlaces(3).toFixed(3), 3) : "—"}</TD>
                      <TD className="tabular text-right">{formatINR(l.currentRate.toDecimalPlaces(3).toFixed(3), 3)}</TD>
                      <TD className="tabular text-right font-medium">{formatINR(l.currentCost)}</TD>
                      <TD className="tabular text-right">{l.stockQty.gt(0) ? l.onHand.div(l.stockQty).toDecimalPlaces(1).toString() : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
                <TFoot><TR><TD colSpan={6}>Standard material cost per batch</TD><TD className="tabular text-right">{formatINR(costing.currentTotal)}</TD><TD /></TR></TFoot>
              </Table>
              {selected.notes && <p className="mt-3 text-xs text-muted-foreground">{selected.notes}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Created by {selected.createdBy.name} on {formatDate(selected.createdAt)}{selected.activatedAt ? ` · activated ${formatDate(selected.activatedAt)}` : ""}{selected.archivedAt ? ` · archived ${formatDate(selected.archivedAt)}` : ""}.</p>
            </CardContent>
          </Card>
          <SectionCard title={`Production runs using v${selected.versionNo}`} description="Historical runs reference this exact version">
            {runs.length ? (
              <ul className="divide-y text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <Link href={`/production/${r.id}`} className="font-medium hover:underline">{r.runNo}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">{formatDate(r.plannedDate)} <StatusBadge status={r.status} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No runs yet.</p>}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
