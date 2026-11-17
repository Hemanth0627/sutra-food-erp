import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { D, formatINR, formatPct, formatQty } from "@/lib/decimal";
import { formatDate, formatDateTime } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCompanySettings } from "@/server/services/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityList, SectionCard } from "@/components/app/widgets";
import { HBarsChart } from "@/components/charts/charts";
import { RunWorkflow } from "./run-workflow";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("production:view");
  const { id } = await params;
  const run = await prisma.productionRun.findUnique({
    where: { id },
    include: {
      product: { include: { item: true } },
      bomVersion: { include: { bom: true } },
      createdBy: true,
      materials: { include: { item: { include: { unit: true, balance: true } } } },
      outputs: true,
      allocations: { include: { expense: true } },
    },
  });
  if (!run) notFound();
  const settings = await getCompanySettings();
  const tolerance = D(run.varianceTolerancePct ?? settings.varianceTolerancePct);
  const ledger = await prisma.inventoryTransaction.findMany({ where: { sourceType: "PRODUCTION_RUN", sourceId: run.id }, include: { item: { include: { unit: true } } }, orderBy: { createdAt: "asc" } });
  const activity = await prisma.auditLog.findMany({ where: { entityId: run.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  const completed = run.status === "COMPLETED";
  const canManage = hasPermission(user.role, "production:manage");
  const sorted = [...run.materials].sort((a, b) => a.item.kind.localeCompare(b.item.kind) * -1 || a.item.name.localeCompare(b.item.name));
  const varianceData = completed ? [...sorted.map((m) => ({ name: m.item.name, variance: Number(D(m.variancePct ?? 0).toFixed(2)) })), { name: "Yield (good output)", variance: Number(D(run.yieldVariancePct ?? 0).toFixed(2)) }] : [];
  const yieldFlag = completed && D(run.yieldVariancePct ?? 0).abs().gt(tolerance);

  return (
    <>
      <PageHeader
        title={`${run.runNo} · ${run.product.item.name}`}
        description={`BOM ${run.bomVersion.bom.code} v${run.bomVersion.versionNo} · ${formatQty(run.plannedBatches)} batch(es) · planned ${formatDate(run.plannedDate)} by ${run.createdBy.name}${run.batchNo ? ` · batch ${run.batchNo}` : ""}${run.expiryDate ? ` · best before ${formatDate(run.expiryDate)}` : ""}`}
        actions={<><StatusBadge status={run.status} />{run.hasVarianceAlert && <Badge variant="danger">Variance above ±{tolerance.toFixed(0)}%</Badge>}</>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Planned output" value={`${formatQty(run.plannedOutput)} pkts`} hint={`Expected good ${formatQty(run.expectedOutput)}`} />
        <StatCard label="Good output" value={run.actualGoodOutput ? `${formatQty(run.actualGoodOutput)} pkts` : "—"} hint={run.actualYieldPct ? `Actual yield ${D(run.actualYieldPct).toFixed(2)}%` : "Pending"} />
        <StatCard label="Yield variance" value={run.yieldVariancePct ? formatPct(run.yieldVariancePct) : "—"} tone={yieldFlag ? "critical" : completed ? "good" : "neutral"} hint={`Tolerance ±${tolerance.toFixed(2)}%`} />
        <StatCard label="Total production cost" value={run.totalCost ? formatINR(run.totalCost) : "—"} hint={run.totalCost ? `Material ${formatINR(D(run.materialCost ?? 0).plus(D(run.packagingCost ?? 0)))} + overheads ${formatINR(D(run.labourCost).plus(run.energyCost).plus(run.overheadCost))}` : "Frozen at completion"} />
        <StatCard label="Cost per good packet" value={run.costPerUnit ? formatINR(D(run.costPerUnit).toDecimalPlaces(2).toFixed(2)) : "—"} hint={run.marginPct ? `Margin ${D(run.marginPct).toFixed(2)}% at ${formatINR(run.sellingPrice ?? 0)}` : undefined} tone="neutral" />
      </div>

      {canManage && (run.status === "PLANNED" || run.status === "IN_PROGRESS") && (
        <div className="mt-4">
          <RunWorkflow
            key={run.status /* remount after "start" so completion defaults to the issued quantities */}
            runId={run.id}
            runNo={run.runNo}
            status={run.status}
            plannedOutput={run.plannedOutput.toString()}
            expectedOutput={run.expectedOutput.toString()}
            tolerance={tolerance.toString()}
            materials={sorted.map((m) => ({ itemId: m.itemId, name: m.item.name, kind: m.item.kind, unit: m.item.unit.code, plannedQty: m.plannedQty.toString(), issuedQty: m.actualQty?.toString() ?? null, onHand: m.item.balance?.quantity.toString() ?? "0" }))}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Planned vs actual consumption</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Material</TH><TH className="text-right">Planned (BOM)</TH><TH className="text-right">Used</TH><TH className="text-right">Damaged</TH><TH className="text-right">Variance</TH><TH className="text-right">Rate (WAC)</TH><TH className="text-right">Cost</TH></TR></THead>
              <TBody>
                {sorted.map((m) => (
                  <TR key={m.id}>
                    <TD><div className="font-medium">{m.item.name}</div><div className="text-[11px] text-muted-foreground">{m.item.kind === "RAW_MATERIAL" ? "Raw material" : "Packaging"}</div></TD>
                    <TD className="tabular text-right">{formatQty(m.plannedQty)} {m.item.unit.code}</TD>
                    <TD className="tabular text-right">{m.actualQty ? `${formatQty(m.actualQty)} ${m.item.unit.code}` : "—"}</TD>
                    <TD className="tabular text-right">{D(m.damagedQty).gt(0) ? `${formatQty(m.damagedQty)} ${m.item.unit.code}` : "—"}</TD>
                    <TD className={cn("tabular text-right", m.isFlagged && "font-semibold text-destructive")}>{m.variancePct ? formatPct(m.variancePct) : "—"}{m.isFlagged && " ⚑"}</TD>
                    <TD className="tabular text-right">{m.unitCost ? formatINR(D(m.unitCost).toDecimalPlaces(3).toFixed(3), 3) : "—"}</TD>
                    <TD className="tabular text-right">{m.totalCost ? formatINR(m.totalCost) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
              {completed && <TFoot><TR><TD colSpan={6}>Material + packaging cost</TD><TD className="tabular text-right">{formatINR(D(run.materialCost ?? 0).plus(D(run.packagingCost ?? 0)))}</TD></TR></TFoot>}
            </Table>
            {completed && (
              <div className="mt-5">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Variance against BOM standard (%) · tolerance ±{tolerance.toFixed(0)}%</div>
                <HBarsChart data={varianceData} labelKey="name" valueKey="variance" valueLabel="Variance" format="pct" ariaLabel="Horizontal bar chart of consumption and yield variance per material" />
              </div>
            )}
            {run.scrapNotes && <p className="mt-3 text-xs text-muted-foreground">Scrap / yield note: {run.scrapQty ? `${formatQty(run.scrapQty)} kg · ` : ""}{run.scrapNotes}</p>}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <SectionCard title="Costing snapshot" description={completed ? "Materials frozen at completion at weighted-average cost" : "Calculated at completion"}>
            <dl className="space-y-1.5 text-sm">
              {[
                ["Raw materials", run.materialCost],
                ["Packaging (incl. damaged)", run.packagingCost],
                ["Labour", run.labourCost],
                ["Gas & power", run.energyCost],
                ["Other overheads", run.overheadCost],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between"><dt className="text-muted-foreground">{String(k)}</dt><dd className="tabular">{v !== null && v !== undefined ? formatINR(String(v)) : "—"}</dd></div>
              ))}
              <div className="flex justify-between border-t pt-1.5 font-semibold"><dt>Total production cost</dt><dd className="tabular">{run.totalCost ? formatINR(run.totalCost) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">÷ good packets</dt><dd className="tabular">{run.actualGoodOutput ? formatQty(run.actualGoodOutput) : "—"}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Cost per good packet</dt><dd className="tabular">{run.costPerUnit ? formatINR(D(run.costPerUnit).toDecimalPlaces(2).toFixed(2)) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Selling price</dt><dd className="tabular">{run.sellingPrice ? formatINR(run.sellingPrice) : formatINR(run.product.sellingPrice)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Gross margin / packet</dt><dd className="tabular">{run.grossMarginPerUnit ? `${formatINR(D(run.grossMarginPerUnit).toDecimalPlaces(2).toFixed(2))} (${D(run.marginPct ?? 0).toFixed(2)}%)` : "—"}</dd></div>
            </dl>
          </SectionCard>
          <SectionCard title="Expenses charged" action={hasPermission(user.role, "expenses:manage") && run.status !== "CANCELLED" && <Button asChild size="sm" variant="outline"><Link href={`/expenses?run=${run.id}`}><Plus /> Add</Link></Button>}>
            {run.allocations.length ? (
              <ul className="space-y-1.5 text-sm">
                {run.allocations.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2"><span>{a.expense.expenseNo} · {a.expense.category.replace(/_/g, " ").toLowerCase()}</span><span className="tabular">{formatINR(a.amount)}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No labour or energy charged yet.</p>}
          </SectionCard>
        </div>
      </div>
      <SectionCard title="Stock ledger entries posted by this run" className="mt-4">
        {ledger.length ? (
          <Table>
            <THead><TR><TH>When</TH><TH>Item</TH><TH>Movement</TH><TH className="text-right">Qty</TH><TH className="text-right">Balance before → after</TH><TH className="text-right">Value</TH></TR></THead>
            <TBody>
              {ledger.map((l) => (
                <TR key={l.id}>
                  <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                  <TD>{l.item.name}{l.batchNo && <div className="text-[11px] text-muted-foreground">Batch {l.batchNo}</div>}</TD>
                  <TD className="text-xs capitalize">{l.movementType.replace(/_/g, " ").toLowerCase()}</TD>
                  <TD className={cn("tabular text-right font-medium", D(l.quantity).isNegative() ? "text-destructive" : "text-success")}>{D(l.quantity).gt(0) ? "+" : ""}{formatQty(l.quantity)} {l.item.unit.code}</TD>
                  <TD className="tabular text-right">{formatQty(l.balanceBefore)} → {formatQty(l.balanceAfter)}</TD>
                  <TD className="tabular text-right">{formatINR(l.value)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">Nothing is posted until the run is completed.</p>}
      </SectionCard>
      <SectionCard title="History" className="mt-4"><ActivityList items={activity} /></SectionCard>
    </>
  );
}
