import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { D, formatINR, formatQty } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityList, SectionCard } from "@/components/app/widgets";
import { CancelPurchaseOrder } from "./cancel-po";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("purchases:view");
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, createdBy: true, items: { include: { item: true, unit: true } }, receipts: { orderBy: { receivedDate: "asc" } } },
  });
  if (!po) notFound();
  const open = po.status === "OPEN" || po.status === "PARTIALLY_RECEIVED";
  const canAct = hasPermission(user.role, "purchases:create") && open;
  const activity = await prisma.auditLog.findMany({ where: { entityId: { in: [po.id, ...po.receipts.map((r) => r.id)] } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader
        title={po.poNo}
        description={`${po.supplier.name} · ordered ${formatDate(po.orderDate)}${po.expectedDate ? ` · expected ${formatDate(po.expectedDate)}` : ""} · raised by ${po.createdBy.name}`}
        actions={
          <>
            <StatusBadge status={po.status} />
            {canAct && <CancelPurchaseOrder id={po.id} poNo={po.poNo} />}
            {canAct && <Button asChild><Link href={`/purchases/new?po=${po.id}`}><PackageCheck /> Receive goods</Link></Button>}
          </>
        }
      />
      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Material</TH><TH className="text-right">Ordered</TH><TH className="text-right">Received</TH><TH className="text-right">Balance</TH><TH className="text-right">Rate</TH><TH className="text-right">Taxable</TH><TH className="text-right">GST %</TH></TR></THead>
            <TBody>
              {po.items.map((i) => (
                <TR key={i.id}>
                  <TD className="font-medium">{i.item.name}</TD>
                  <TD className="tabular text-right">{formatQty(i.quantity)} {i.unit.code}</TD>
                  <TD className="tabular text-right">{formatQty(i.receivedQty)} {i.unit.code}</TD>
                  <TD className="tabular text-right">{formatQty(D(i.quantity).minus(D(i.receivedQty)))} {i.unit.code}</TD>
                  <TD className="tabular text-right">{formatINR(i.rate)}</TD>
                  <TD className="tabular text-right">{formatINR(i.taxableValue)}</TD>
                  <TD className="tabular text-right">{D(i.gstRate).toFixed(0)}%</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="mt-3 text-right text-sm">Taxable {formatINR(po.taxableTotal)} · GST {formatINR(po.taxTotal)} · <span className="font-semibold">Total {formatINR(po.grandTotal)}</span></div>
          {po.notes && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm"><span className="text-muted-foreground">Notes: </span>{po.notes}</p>}
          {po.cancelledReason && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive">Cancelled: {po.cancelledReason}</p>}
        </CardContent>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Goods receipts" description="Each receipt posts purchase-receipt entries to the stock ledger.">
          {po.receipts.length ? (
            <ul className="space-y-2 text-sm">
              {po.receipts.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <Link href={`/purchases/${r.id}`} className="font-medium hover:underline">{r.purchaseNo}</Link>
                  <span className="text-muted-foreground">{formatDate(r.receivedDate)} · inv {r.supplierInvoiceNo} · <span className="tabular text-foreground">{formatINR(r.grandTotal)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nothing received yet.</p>}
        </SectionCard>
        <SectionCard title="History"><ActivityList items={activity} /></SectionCard>
      </div>
    </>
  );
}
