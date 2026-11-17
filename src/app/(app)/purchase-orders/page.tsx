import Link from "next/link";
import { Plus } from "lucide-react";
import type { PurchaseOrderStatus } from "@prisma/client";
import { formatINR, formatQty } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";

export const metadata = { title: "Purchase orders" };
const STATUSES: PurchaseOrderStatus[] = ["OPEN", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePageUser("purchases:view");
  const { q, status } = await searchParams;
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      ...(status && STATUSES.includes(status as PurchaseOrderStatus) ? { status: status as PurchaseOrderStatus } : {}),
      ...(q ? { OR: [{ poNo: { contains: q, mode: "insensitive" } }, { supplier: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { supplier: true, items: { include: { item: true, unit: true } } },
    orderBy: { orderDate: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Orders placed with suppliers. Stock only changes when goods are received against a PO."
        actions={hasPermission(user.role, "purchases:create") && <Button asChild><Link href="/purchase-orders/new"><Plus /> New purchase order</Link></Button>}
      />
      <ListToolbar placeholder="PO number or supplier" statuses={STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") }))} />
      <Card>
        {pos.length ? (
          <Table>
            <THead><TR><TH>PO</TH><TH>Supplier</TH><TH>Lines (received / ordered)</TH><TH>Expected</TH><TH className="text-right">Total</TH><TH>Status</TH></TR></THead>
            <TBody>
              {pos.map((p) => (
                <TR key={p.id}>
                  <TD><Link href={`/purchase-orders/${p.id}`} className="font-medium hover:underline">{p.poNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(p.orderDate)}</div></TD>
                  <TD>{p.supplier.name}</TD>
                  <TD className="text-xs">{p.items.map((i) => `${i.item.name} ${formatQty(i.receivedQty)}/${formatQty(i.quantity)} ${i.unit.code}`).join(", ")}</TD>
                  <TD className="text-xs">{p.expectedDate ? formatDate(p.expectedDate) : "—"}</TD>
                  <TD className="tabular text-right">{formatINR(p.grandTotal)}</TD>
                  <TD><StatusBadge status={p.status} />{p.status === "OPEN" && p.expectedDate && p.expectedDate < new Date() && <div className="mt-0.5 text-[11px] text-destructive">Overdue</div>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState title="No purchase orders" description="Raise a purchase order when stock nears its reorder level." />}
      </Card>
    </>
  );
}
