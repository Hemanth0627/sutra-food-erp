import Link from "next/link";
import { D, formatINR, formatPct, formatQty, sum } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { productProfitability } from "@/server/queries/dashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/widgets";

export const metadata = { title: "Costing" };

const EXPENSE_LABEL: Record<string, string> = { LABOUR: "Labour", GAS: "Gas", ELECTRICITY: "Electricity", GAS_AND_POWER: "Gas & power", OTHER_OVERHEAD: "Other overhead" };

/**
 * Production costing: every figure is the snapshot frozen on the completed run (materials at the
 * weighted-average rate at completion, overheads charged or allocated to the run), so a later purchase
 * at a different price never rewrites a historical cost.
 */
export default async function CostingPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  await requirePageUser("production:view");
  const { run: runParam } = await searchParams;
  const runs = await prisma.productionRun.findMany({
    where: { status: "COMPLETED" },
    include: { product: { include: { item: true } } },
    orderBy: { completedAt: "desc" },
    take: 50,
  });
  if (!runs.length) {
    return (
      <>
        <PageHeader title="Costing" description="Cost per packet is calculated when a production run is completed." />
        <Card><EmptyState title="No completed production runs yet" description="Complete a run to see its cost build-up." /></Card>
      </>
    );
  }
  const run = runs.find((r) => r.id === runParam) ?? runs[0];
  const detail = await prisma.productionRun.findUniqueOrThrow({
    where: { id: run.id },
    include: {
      materials: { include: { item: { include: { unit: true } } }, orderBy: { item: { kind: "asc" } } },
      expenses: true,
      allocations: { include: { expense: true } },
      bomVersion: { include: { bom: true } },
    },
  });
  const good = D(run.actualGoodOutput ?? 0);
  const raw = detail.materials.filter((m) => m.item.kind === "RAW_MATERIAL");
  const pack = detail.materials.filter((m) => m.item.kind === "PACKAGING_MATERIAL");
  const overheadLines = [
    ...detail.allocations.map((a) => ({ label: `${EXPENSE_LABEL[a.expense.category] ?? a.expense.category} · ${a.expense.expenseNo}`, desc: a.expense.description, amount: D(a.amount) })),
  ];
  const profitability = await productProfitability();

  return (
    <>
      <PageHeader
        title="Costing & profitability"
        description="Weighted-average valuation. Each completed run freezes its material cost at completion; labour, gas and power are added as they are charged to the run. Cost per packet = total run cost ÷ actual good packets."
        actions={<Button asChild variant="outline"><Link href="/reports/cost-per-packet">Cost-per-packet report</Link></Button>}
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/costing">
        <label className="text-xs text-muted-foreground" htmlFor="run">Production run</label>
        <NativeSelect id="run" name="run" defaultValue={run.id} className="w-auto min-w-72">
          {runs.map((r) => <option key={r.id} value={r.id}>{r.runNo} · {r.product.item.name} · {formatDate(r.completedAt)}</option>)}
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm">Show</Button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total run cost" value={formatINR(run.totalCost ?? 0)} hint={`${run.runNo} · ${run.product.item.name}`} />
        <StatCard label="Cost per good packet" value={formatINR(D(run.costPerUnit ?? 0).toDecimalPlaces(2))} hint={`${formatINR(run.totalCost ?? 0)} ÷ ${formatQty(good)} good packets`} />
        <StatCard label="Selling price (before GST)" value={formatINR(run.sellingPrice ?? 0)} hint="Price on the product master at completion" />
        <StatCard
          label="Gross margin per packet"
          value={formatINR(D(run.grossMarginPerUnit ?? 0).toDecimalPlaces(2))}
          hint={run.marginPct ? `${formatPct(run.marginPct, 2, false)} of selling price` : undefined}
          tone={D(run.grossMarginPerUnit ?? 0).gt(0) ? "good" : "critical"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard title={`Cost build-up for ${run.runNo}`} description={`${detail.bomVersion.bom.code} v${detail.bomVersion.versionNo} · expected ${formatQty(run.expectedOutput)}, good ${formatQty(good)} packets`}>
          <Table>
            <THead><TR><TH>Cost element</TH><TH className="text-right">Quantity consumed</TH><TH className="text-right">Rate</TH><TH className="text-right">Amount</TH></TR></THead>
            <TBody>
              {raw.map((m) => (
                <TR key={m.id}>
                  <TD>{m.item.name}<div className="text-[11px] text-muted-foreground">Raw material · weighted-average rate</div></TD>
                  <TD className="tabular text-right">{formatQty(D(m.actualQty ?? 0).plus(D(m.damagedQty)))} {m.item.unit.code}</TD>
                  <TD className="tabular text-right">{formatINR(D(m.unitCost ?? 0).toDecimalPlaces(3).toFixed(3), 3)}</TD>
                  <TD className="tabular text-right">{formatINR(m.totalCost ?? 0)}</TD>
                </TR>
              ))}
              {pack.map((m) => (
                <TR key={m.id}>
                  <TD>{m.item.name}<div className="text-[11px] text-muted-foreground">Packaging{D(m.damagedQty).gt(0) ? ` · includes ${formatQty(m.damagedQty)} damaged (costed to the run)` : ""}</div></TD>
                  <TD className="tabular text-right">{formatQty(D(m.actualQty ?? 0).plus(D(m.damagedQty)))} {m.item.unit.code}</TD>
                  <TD className="tabular text-right">{formatINR(D(m.unitCost ?? 0).toDecimalPlaces(2))}</TD>
                  <TD className="tabular text-right">{formatINR(m.totalCost ?? 0)}</TD>
                </TR>
              ))}
              {overheadLines.length ? overheadLines.map((o, i) => (
                <TR key={i}>
                  <TD>{o.label}<div className="text-[11px] text-muted-foreground">{o.desc}</div></TD>
                  <TD className="text-right text-muted-foreground">—</TD>
                  <TD className="text-right text-muted-foreground">—</TD>
                  <TD className="tabular text-right">{formatINR(o.amount)}</TD>
                </TR>
              )) : (
                <TR><TD colSpan={4} className="text-xs text-muted-foreground">No labour, gas or power charged to this run yet.</TD></TR>
              )}
            </TBody>
            <TFoot>
              <TR><TD colSpan={3}>Materials {formatINR(run.materialCost ?? 0)} + packaging {formatINR(run.packagingCost ?? 0)} + labour {formatINR(run.labourCost)} + energy {formatINR(run.energyCost)} + other {formatINR(run.overheadCost)}</TD><TD className="tabular text-right font-semibold">{formatINR(run.totalCost ?? 0)}</TD></TR>
              <TR><TD colSpan={3}>÷ actual good packets ({formatQty(good)}), never the expected {formatQty(run.expectedOutput)}</TD><TD className="tabular text-right font-semibold">{formatINR(D(run.costPerUnit ?? 0).toDecimalPlaces(2))}</TD></TR>
            </TFoot>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Damaged pouches are part of consumed packaging, so their cost is absorbed by the good packets. Scrap and yield loss are not costed separately; they raise the cost per good packet.
          </p>
          <div className="mt-3"><Button asChild size="sm" variant="outline"><Link href={`/production/${run.id}`}>Open production run</Link></Button></div>
        </SectionCard>

        <SectionCard title="Product profitability" description="Invoiced revenue against the latest run cost per packet (stock average if never produced).">
          {profitability.length ? (
            <Table>
              <THead><TR><TH>Product</TH><TH className="text-right">Qty</TH><TH className="text-right">Revenue</TH><TH className="text-right">Cost</TH><TH className="text-right">Margin</TH></TR></THead>
              <TBody>
                {profitability.map((p) => (
                  <TR key={p.productId}>
                    <TD>{p.name}<div className="text-[11px] text-muted-foreground">{p.costBasis} · {formatINR(p.unitCost.toDecimalPlaces(2))}/unit</div></TD>
                    <TD className="tabular text-right">{formatQty(p.qty)}</TD>
                    <TD className="tabular text-right">{formatINR(p.revenue)}</TD>
                    <TD className="tabular text-right">{formatINR(p.cost)}</TD>
                    <TD className={`tabular text-right ${p.margin.gte(0) ? "text-success" : "text-destructive"}`}>{formatINR(p.margin)}<div className="text-[11px]">{formatPct(p.marginPct, 2, false)}</div></TD>
                  </TR>
                ))}
              </TBody>
              <TFoot><TR><TD>Total</TD><TD /><TD className="tabular text-right">{formatINR(sum(profitability.map((p) => p.revenue)))}</TD><TD className="tabular text-right">{formatINR(sum(profitability.map((p) => p.cost)))}</TD><TD className="tabular text-right">{formatINR(sum(profitability.map((p) => p.margin)))}</TD></TR></TFoot>
            </Table>
          ) : <EmptyState title="No invoiced sales yet" />}
        </SectionCard>
      </div>

      <SectionCard title="All completed runs" className="mt-4">
        <Table>
          <THead><TR><TH>Run</TH><TH>Product</TH><TH className="text-right">Good</TH><TH className="text-right">Materials</TH><TH className="text-right">Packaging</TH><TH className="text-right">Labour</TH><TH className="text-right">Energy</TH><TH className="text-right">Total</TH><TH className="text-right">Per packet</TH><TH className="text-right">Margin %</TH></TR></THead>
          <TBody>
            {runs.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/costing?run=${r.id}`} className="font-medium hover:underline">{r.runNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(r.completedAt)}</div></TD>
                <TD>{r.product.item.name}</TD>
                <TD className="tabular text-right">{formatQty(r.actualGoodOutput ?? 0)}</TD>
                <TD className="tabular text-right">{formatINR(r.materialCost ?? 0)}</TD>
                <TD className="tabular text-right">{formatINR(r.packagingCost ?? 0)}</TD>
                <TD className="tabular text-right">{formatINR(r.labourCost)}</TD>
                <TD className="tabular text-right">{formatINR(r.energyCost)}</TD>
                <TD className="tabular text-right">{formatINR(r.totalCost ?? 0)}</TD>
                <TD className="tabular text-right font-medium">{formatINR(D(r.costPerUnit ?? 0).toDecimalPlaces(2))}</TD>
                <TD className="tabular text-right">{r.marginPct ? formatPct(r.marginPct, 2, false) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </SectionCard>
    </>
  );
}
