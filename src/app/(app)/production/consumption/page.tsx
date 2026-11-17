import { D, formatINR, formatPct, formatQty, round2, sum } from "@/lib/decimal";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { parseReportFilters } from "@/server/reports/filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard, ViewAll } from "@/components/app/widgets";
import { BarsChart } from "@/components/charts/charts";
import { ReportFiltersBar } from "@/components/app/report-filters";

export const metadata = { title: "Material consumption" };

export default async function ConsumptionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePageUser("production:view");
  const f = parseReportFilters(await searchParams);
  const materials = await prisma.productionMaterial.findMany({
    where: { run: { status: "COMPLETED", completedAt: { gte: f.from, lt: f.to } } },
    include: { item: { include: { unit: true } } },
  });
  const by = new Map<string, { name: string; unit: string; kind: string; planned: ReturnType<typeof D>; used: ReturnType<typeof D>; damaged: ReturnType<typeof D>; stdCost: ReturnType<typeof D>; actualCost: ReturnType<typeof D> }>();
  for (const m of materials) {
    const e = by.get(m.itemId) ?? { name: m.item.name, unit: m.item.unit.code, kind: m.item.kind, planned: D(0), used: D(0), damaged: D(0), stdCost: D(0), actualCost: D(0) };
    e.planned = e.planned.plus(D(m.plannedQty));
    e.used = e.used.plus(D(m.actualQty ?? 0));
    e.damaged = e.damaged.plus(D(m.damagedQty));
    e.stdCost = e.stdCost.plus(round2(D(m.plannedQty).times(D(m.unitCost ?? 0))));
    e.actualCost = e.actualCost.plus(D(m.totalCost ?? 0));
    by.set(m.itemId, e);
  }
  const rows = [...by.values()].sort((a, b) => a.kind.localeCompare(b.kind) * -1 || a.name.localeCompare(b.name));
  const chart = rows.map((r) => ({ material: r.name.replace(" (20 × 200 g)", ""), standard: Number(r.stdCost.toFixed(2)), actual: Number(r.actualCost.toFixed(2)) }));
  return (
    <>
      <PageHeader title="Material consumption" description="What production actually consumed against the BOM standard, valued at the weighted-average cost at issue." />
      <ReportFiltersBar filters={["date"]} values={{ from: f.fromStr, to: f.toStr }} customers={[]} products={[]} />
      <SectionCard title="Standard vs actual material cost" description="Standard = BOM quantity × issue rate; actual includes damaged material" action={<ViewAll href="/reports/planned-vs-actual" label="Run-level report" />}>
        <BarsChart data={chart} xKey="material" series={[{ key: "standard", label: "Standard cost" }, { key: "actual", label: "Actual cost" }]} format="money" ariaLabel="Grouped bar chart of standard versus actual material cost by material" />
      </SectionCard>
      <Card className="mt-4">
        <CardHeader><CardTitle>Consumption by material · {f.fromStr} to {f.toStr}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Material</TH><TH className="text-right">Standard qty</TH><TH className="text-right">Used</TH><TH className="text-right">Damaged</TH><TH className="text-right">Variance</TH><TH className="text-right">Standard cost</TH><TH className="text-right">Actual cost</TH></TR></THead>
            <TBody>
              {rows.map((r) => {
                const total = r.used.plus(r.damaged);
                const v = r.planned.gt(0) ? total.minus(r.planned).div(r.planned).times(100) : D(0);
                return (
                  <TR key={r.name}>
                    <TD className="font-medium">{r.name}<div className="text-[11px] font-normal text-muted-foreground">{r.kind === "RAW_MATERIAL" ? "Raw material" : "Packaging"}</div></TD>
                    <TD className="tabular text-right">{formatQty(r.planned)} {r.unit}</TD>
                    <TD className="tabular text-right">{formatQty(r.used)} {r.unit}</TD>
                    <TD className="tabular text-right">{formatQty(r.damaged)} {r.unit}</TD>
                    <TD className="tabular text-right">{formatPct(v)}</TD>
                    <TD className="tabular text-right">{formatINR(r.stdCost)}</TD>
                    <TD className="tabular text-right font-medium">{formatINR(r.actualCost)}</TD>
                  </TR>
                );
              })}
            </TBody>
            <TFoot><TR><TD colSpan={5}>Total</TD><TD className="tabular text-right">{formatINR(sum(rows.map((r) => r.stdCost)))}</TD><TD className="tabular text-right">{formatINR(sum(rows.map((r) => r.actualCost)))}</TD></TR></TFoot>
          </Table>
          {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No completed runs in this period.</p>}
        </CardContent>
      </Card>
    </>
  );
}
