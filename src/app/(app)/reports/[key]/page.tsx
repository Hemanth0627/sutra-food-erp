import { notFound } from "next/navigation";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getReport } from "@/server/reports/definitions";
import { filtersToQuery, parseReportFilters } from "@/server/reports/filters";
import { formatCell } from "@/server/reports/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { ReportFiltersBar } from "@/components/app/report-filters";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser("reports:view");
  const { key } = await params;
  const def = getReport(key);
  if (!def) notFound();
  const filters = parseReportFilters(await searchParams);
  const [result, customers, products] = await Promise.all([
    def.run(filters),
    def.filters.includes("customer") ? prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    def.filters.includes("product") ? prisma.product.findMany({ include: { item: true }, orderBy: { sku: "asc" } }) : Promise.resolve([]),
  ]);
  const q = filtersToQuery(filters);
  const canExport = hasPermission(user.role, "reports:export");
  const numeric = (t: string) => ["money", "qty", "pct", "number"].includes(t);
  return (
    <>
      <PageHeader
        title={def.title}
        description={def.description}
        actions={canExport && (
          <>
            <Button asChild variant="outline" size="sm"><a href={`/api/reports/${key}/export?format=csv&${q}`}><FileDown /> CSV</a></Button>
            <Button asChild variant="outline" size="sm"><a href={`/api/reports/${key}/export?format=xlsx&${q}`}><FileSpreadsheet /> Excel</a></Button>
            <Button asChild variant="outline" size="sm"><a href={`/api/reports/${key}/export?format=pdf&${q}`} target="_blank" rel="noopener"><FileText /> PDF</a></Button>
          </>
        )}
      />
      <ReportFiltersBar
        filters={def.filters}
        values={{ from: filters.fromStr, to: filters.toStr, customerId: filters.customerId, productId: filters.productId, type: filters.type }}
        customers={customers}
        products={products.map((p) => ({ id: p.id, name: p.item.name }))}
        typeOptions={def.typeOptions}
      />
      <div className="space-y-4">
        {result.sections.map((s, si) => (
          <Card key={si}>
            <CardHeader><CardTitle>{s.title}</CardTitle></CardHeader>
            <CardContent>
              {s.rows.length ? (
                <Table>
                  <THead>
                    <TR>{s.columns.map((c) => <TH key={c.key} className={cn(numeric(c.type) && "text-right")}>{c.label}</TH>)}</TR>
                  </THead>
                  <TBody>
                    {s.rows.map((r, ri) => (
                      <TR key={ri}>
                        {s.columns.map((c) => <TD key={c.key} className={cn("text-[13px]", numeric(c.type) && "tabular whitespace-nowrap text-right")}>{formatCell(c, r[c.key] ?? null)}</TD>)}
                      </TR>
                    ))}
                  </TBody>
                  {s.totals && (
                    <TFoot>
                      <TR>{s.columns.map((c) => <TD key={c.key} className={cn("text-[13px] font-semibold", numeric(c.type) && "tabular whitespace-nowrap text-right")}>{formatCell(c, s.totals![c.key] ?? null)}</TD>)}</TR>
                    </TFoot>
                  )}
                </Table>
              ) : <p className="py-6 text-center text-sm text-muted-foreground">No posted transactions match these filters.</p>}
              {s.notes?.map((n) => <p key={n} className="mt-2 text-xs text-muted-foreground">{n}</p>)}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
