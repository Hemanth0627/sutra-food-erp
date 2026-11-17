import Link from "next/link";
import { D, formatPct, formatQty, sum } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCompanySettings } from "@/server/services/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/widgets";
import { BarsChart } from "@/components/charts/charts";

export const metadata = { title: "Variance analysis" };

export default async function VariancePage() {
  await requirePageUser("production:view");
  const settings = await getCompanySettings();
  const runs = await prisma.productionRun.findMany({
    where: { status: "COMPLETED" },
    include: { product: { include: { item: true } }, materials: { include: { item: { include: { unit: true } } } } },
    orderBy: { completedAt: "asc" },
  });
  const flagged = runs.filter((r) => r.hasVarianceAlert);
  const yieldData = runs.map((r) => ({ run: r.runNo.split("/").pop() ?? r.runNo, expected: Number(D(r.expectedOutput).toFixed(0)), good: Number(D(r.actualGoodOutput ?? 0).toFixed(0)) }));
  const byMaterial = new Map<string, { name: string; unit: string; planned: ReturnType<typeof D>; actual: ReturnType<typeof D>; flags: number; runs: number }>();
  for (const r of runs) for (const m of r.materials) {
    const e = byMaterial.get(m.itemId) ?? { name: m.item.name, unit: m.item.unit.code, planned: D(0), actual: D(0), flags: 0, runs: 0 };
    e.planned = e.planned.plus(D(m.plannedQty));
    e.actual = e.actual.plus(D(m.actualQty ?? 0)).plus(D(m.damagedQty));
    e.flags += m.isFlagged ? 1 : 0;
    e.runs += 1;
    byMaterial.set(m.itemId, e);
  }
  const avgYieldVar = runs.length ? sum(runs.map((r) => r.yieldVariancePct ?? 0)).div(runs.length) : D(0);
  return (
    <>
      <PageHeader title="Variance analysis" description={`Consumption and yield against the BOM standard. Deviations beyond ±${D(settings.varianceTolerancePct).toFixed(2)}% (configurable in Settings) are flagged automatically.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completed runs" value={runs.length} />
        <StatCard label="Runs flagged" value={flagged.length} tone={flagged.length ? "critical" : "good"} />
        <StatCard label="Average yield variance" value={formatPct(avgYieldVar)} tone={avgYieldVar.abs().gt(D(settings.varianceTolerancePct)) ? "warning" : "good"} />
        <StatCard label="Tolerance" value={`±${D(settings.varianceTolerancePct).toFixed(2)}%`} hint="Owner/Admin can change it in Settings" />
      </div>
      <SectionCard title="Expected vs good output by run" className="mt-4">
        <BarsChart data={yieldData} xKey="run" series={[{ key: "expected", label: "Expected" }, { key: "good", label: "Good output" }]} format="qty" ariaLabel="Expected versus good output for each completed run" />
      </SectionCard>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>By material (all completed runs)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Material</TH><TH className="text-right">Standard</TH><TH className="text-right">Actual</TH><TH className="text-right">Variance</TH><TH className="text-right">Flags</TH></TR></THead>
              <TBody>
                {[...byMaterial.values()].map((m) => {
                  const v = m.planned.gt(0) ? m.actual.minus(m.planned).div(m.planned).times(100) : D(0);
                  return (
                    <TR key={m.name}>
                      <TD className="font-medium">{m.name}</TD>
                      <TD className="tabular text-right">{formatQty(m.planned)} {m.unit}</TD>
                      <TD className="tabular text-right">{formatQty(m.actual)} {m.unit}</TD>
                      <TD className={`tabular text-right ${v.abs().gt(D(settings.varianceTolerancePct)) ? "font-semibold text-destructive" : ""}`}>{formatPct(v)}</TD>
                      <TD className="tabular text-right">{m.flags}/{m.runs}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Flagged runs</CardTitle></CardHeader>
          <CardContent>
            {flagged.length ? (
              <ul className="divide-y">
                {flagged.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <Link href={`/production/${r.id}`} className="font-medium hover:underline">{r.runNo} · {r.product.item.name}</Link>
                      <span className="text-xs text-muted-foreground">{formatDate(r.completedAt)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {D(r.yieldVariancePct ?? 0).abs().gt(D(r.varianceTolerancePct ?? 3)) && <Badge variant="danger">Yield {formatPct(r.yieldVariancePct ?? 0)}</Badge>}
                      {r.materials.filter((m) => m.isFlagged).map((m) => <Badge key={m.id} variant="warning">{m.item.name} {formatPct(m.variancePct ?? 0)}</Badge>)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="py-6 text-center text-sm text-muted-foreground">No runs outside tolerance.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
