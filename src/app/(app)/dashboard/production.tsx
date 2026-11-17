import Link from "next/link";
import { formatINR, formatPct, formatQty } from "@/lib/decimal";
import { plural } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { AlertList, SectionCard, ViewAll } from "@/components/app/widgets";
import { BarsChart } from "@/components/charts/charts";
import { collectAlerts, productionKpis, productionPerformance, stockSummary } from "@/server/queries/dashboard";

export async function ProductionDashboard() {
  const [prod, perf, stock, alerts, runs] = await Promise.all([
    productionKpis(),
    productionPerformance(8),
    stockSummary(),
    collectAlerts(),
    prisma.productionRun.findMany({ include: { product: { include: { item: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const materialAlerts = alerts.filter((a) => a.category === "Production" || (a.category === "Stock" && !a.href.includes("FINISHED")));
  return (
    <>
      <PageHeader
        title="Production"
        description="Runs, yields and material variance against the BOM."
        actions={<Button asChild variant="brand"><Link href="/production/new">New production run</Link></Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Good output this month" value={`${formatQty(prod.monthOutput)} pkts`} hint={`Planned ${formatQty(prod.monthPlanned)}`} href="/production" />
        <StatCard label="Yield this month" value={`${prod.monthYieldPct.toFixed(2)}%`} hint="Good ÷ planned output" tone={prod.monthYieldPct.lt(97) && prod.runsCompleted ? "warning" : "good"} href="/production/variance" />
        <StatCard label="Active runs" value={prod.activeRuns} hint="Planned or in progress" href="/production?status=IN_PROGRESS" />
        <StatCard label="Raw + packaging value" value={formatINR(stock.rawValue.plus(stock.packagingValue))} hint={`${plural(stock.lowStock.filter((s) => s.kind !== "FINISHED_GOOD").length, "material")} at reorder level`} tone={stock.lowStock.some((s) => s.kind !== "FINISHED_GOOD") ? "warning" : "neutral"} href="/inventory?tab=RAW_MATERIAL" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Expected vs good output" description="Recent completed runs" className="lg:col-span-2" action={<ViewAll href="/production/variance" />}>
          <BarsChart data={perf} xKey="run" series={[{ key: "expected", label: "Expected" }, { key: "good", label: "Good output" }]} format="qty" ariaLabel="Expected versus good output per run" />
        </SectionCard>
        <SectionCard title="Variance & material alerts" action={<ViewAll href="/alerts" />}>
          <AlertList alerts={materialAlerts} limit={5} />
        </SectionCard>
      </div>
      <SectionCard title="Recent runs" className="mt-4" action={<ViewAll href="/production" />}>
        <Table>
          <THead><TR><TH>Run</TH><TH>Product</TH><TH>Status</TH><TH className="text-right">Good / expected</TH><TH className="text-right">Yield var</TH><TH className="text-right">Cost / pkt</TH></TR></THead>
          <TBody>
            {runs.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/production/${r.id}`} className="font-medium hover:underline">{r.runNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(r.plannedDate)}</div></TD>
                <TD>{r.product.item.name}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD className="tabular text-right">{r.actualGoodOutput ? formatQty(r.actualGoodOutput) : "—"} / {formatQty(r.expectedOutput)}</TD>
                <TD className={`tabular text-right ${r.hasVarianceAlert ? "font-semibold text-destructive" : ""}`}>{r.yieldVariancePct ? formatPct(r.yieldVariancePct) : "—"}</TD>
                <TD className="tabular text-right">{r.costPerUnit ? formatINR(r.costPerUnit) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </SectionCard>
    </>
  );
}
