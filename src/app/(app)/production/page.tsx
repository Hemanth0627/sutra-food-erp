import Link from "next/link";
import { Plus } from "lucide-react";
import { formatINR, formatPct, formatQty } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";

export const metadata = { title: "Production" };
const STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export default async function ProductionListPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePageUser("production:view");
  const { q, status } = await searchParams;
  const runs = await prisma.productionRun.findMany({
    where: {
      ...(status && (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
      ...(q ? { OR: [{ runNo: { contains: q, mode: "insensitive" } }, { product: { item: { name: { contains: q, mode: "insensitive" } } } }, { batchNo: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { product: { include: { item: true } }, bomVersion: { include: { bom: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader
        title="Production history"
        description="Every run with its BOM version, output, yield variance and costing snapshot."
        actions={hasPermission(user.role, "production:manage") && <Button asChild variant="brand"><Link href="/production/new"><Plus /> New production run</Link></Button>}
      />
      <ListToolbar placeholder="Run no., product or batch" statuses={STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }))} />
      <Card>
        {runs.length ? (
          <Table>
            <THead><TR><TH>Run</TH><TH>Product</TH><TH className="hidden md:table-cell">BOM</TH><TH className="text-right">Batches</TH><TH className="text-right">Expected</TH><TH className="text-right">Good</TH><TH className="text-right">Yield var</TH><TH className="text-right">Cost / pkt</TH><TH>Status</TH></TR></THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/production/${r.id}`} className="font-medium hover:underline">{r.runNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(r.completedAt ?? r.plannedDate)}{r.batchNo ? ` · ${r.batchNo}` : ""}</div></TD>
                  <TD>{r.product.item.name}</TD>
                  <TD className="hidden text-xs md:table-cell">{r.bomVersion.bom.code} v{r.bomVersion.versionNo}</TD>
                  <TD className="tabular text-right">{formatQty(r.plannedBatches)}</TD>
                  <TD className="tabular text-right">{formatQty(r.expectedOutput)}</TD>
                  <TD className="tabular text-right">{r.actualGoodOutput ? formatQty(r.actualGoodOutput) : "—"}</TD>
                  <TD className={`tabular text-right ${r.hasVarianceAlert ? "font-semibold text-destructive" : ""}`}>{r.yieldVariancePct ? formatPct(r.yieldVariancePct) : "—"}</TD>
                  <TD className="tabular text-right">{r.costPerUnit ? formatINR(r.costPerUnit) : "—"}</TD>
                  <TD className="space-x-1"><StatusBadge status={r.status} />{r.hasVarianceAlert && <Badge variant="danger">Variance</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState title="No production runs" />}
      </Card>
    </>
  );
}
