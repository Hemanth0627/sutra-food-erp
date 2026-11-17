import Link from "next/link";
import { Plus } from "lucide-react";
import { formatINR, formatQty } from "@/lib/decimal";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { bomVersionCosting } from "@/server/queries/bom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";

export const metadata = { title: "Bill of materials" };

export default async function BomListPage() {
  const user = await requirePageUser("bom:view");
  const boms = await prisma.bom.findMany({ include: { product: { include: { item: true } }, versions: { orderBy: { versionNo: "desc" } } }, orderBy: { code: "asc" } });
  const rows = await Promise.all(
    boms.map(async (b) => {
      const active = b.versions.find((v) => v.status === "ACTIVE");
      return { b, active, costing: active ? await bomVersionCosting(active.id) : null, draft: b.versions.find((v) => v.status === "DRAFT") };
    }),
  );
  return (
    <>
      <PageHeader
        title="Bill of materials"
        description="Versioned recipes. Production runs keep the exact version they used, so editing a recipe never changes history."
        actions={hasPermission(user.role, "bom:manage") && <Button asChild><Link href="/bom/new"><Plus /> New BOM</Link></Button>}
      />
      <Card>
        <Table>
          <THead><TR><TH>BOM</TH><TH>Product</TH><TH>Active version</TH><TH className="text-right">Batch output</TH><TH className="text-right">Materials</TH><TH className="text-right">Std cost / batch</TH><TH className="text-right">Std material cost / unit</TH></TR></THead>
          <TBody>
            {rows.map(({ b, active, costing, draft }) => (
              <TR key={b.id}>
                <TD><Link href={`/bom/${b.id}`} className="font-medium hover:underline">{b.name}</Link><div className="text-[11px] text-muted-foreground">{b.code} · {b.versions.length} version(s)</div></TD>
                <TD>{b.product.item.name}</TD>
                <TD className="space-x-1">{active ? <StatusBadge status="ACTIVE" label={`v${active.versionNo} active`} /> : <StatusBadge status="DRAFT" label="No active version" />}{draft && <StatusBadge status="DRAFT" label={`v${draft.versionNo} draft`} />}</TD>
                <TD className="tabular text-right">{active ? `${formatQty(active.batchSize)} pkts` : "—"}</TD>
                <TD className="tabular text-right">{costing?.lines.length ?? "—"}</TD>
                <TD className="tabular text-right">{costing ? formatINR(costing.currentTotal) : "—"}</TD>
                <TD className="tabular text-right">{costing ? formatINR(costing.perUnitCurrent.toDecimalPlaces(2).toFixed(2)) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Standard cost uses current weighted-average rates. Each version also stores the rates captured when it was activated.</p>
    </>
  );
}
