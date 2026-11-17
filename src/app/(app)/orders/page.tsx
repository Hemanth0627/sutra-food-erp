import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { formatINR, formatQty, sum } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";

export const metadata = { title: "Orders" };
const STATUSES = ["PENDING", "APPROVED", "PARTIALLY_FULFILLED", "FULFILLED", "REJECTED", "CANCELLED"] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePageUser(["orders:view-all", "orders:view-own"]);
  const { q, status } = await searchParams;
  const own = !hasPermission(user.role, "orders:view-all");
  const where: Prisma.SalesOrderWhereInput = {
    ...(own ? { salesmanId: user.id } : {}),
    ...(status && (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
    ...(q ? { OR: [{ orderNo: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const orders = await prisma.salesOrder.findMany({
    where,
    include: { customer: true, salesman: true, items: { include: { product: { include: { item: true } } } }, invoices: { include: { dispatch: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader
        title={own ? "My orders" : "Sales orders"}
        description={own ? "Orders you have placed and their status." : "Verify salesman orders, check stock and raise GST invoices."}
        actions={hasPermission(user.role, "orders:create") && <Button asChild variant="brand"><Link href="/orders/new"><Plus /> New order</Link></Button>}
      />
      <ListToolbar placeholder="Order no. or customer" statuses={STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }))} />
      <Card>
        {orders.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Customer</TH>
                {!own && <TH className="hidden md:table-cell">Salesman</TH>}
                <TH className="hidden sm:table-cell">Items</TH>
                <TH className="text-right">Value (pre-tax)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {orders.map((o) => {
                const dispatched = o.invoices.length > 0 && o.invoices.filter((i) => i.status === "ISSUED").every((i) => i.dispatch);
                return (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:underline">{o.orderNo}</Link>
                      <div className="text-[11px] text-muted-foreground">{formatDate(o.orderDate)}{o.capturedOffline ? " · synced offline" : ""}</div>
                    </TD>
                    <TD>{o.customer.name}</TD>
                    {!own && <TD className="hidden md:table-cell">{o.salesman.name}</TD>}
                    <TD className="hidden text-xs text-muted-foreground sm:table-cell">{o.items.map((i) => `${formatQty(i.quantity)} × ${i.product.item.name}`).join(", ")}</TD>
                    <TD className="tabular text-right">{formatINR(sum(o.items.map((i) => i.lineAmount)))}</TD>
                    <TD className="space-x-1">
                      <StatusBadge status={o.status} />
                      {dispatched && <StatusBadge status="DISPATCHED" label="Dispatched" />}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No orders found" description={q || status ? "Try clearing the filters." : "Orders placed by salesmen appear here."} />
        )}
      </Card>
    </>
  );
}
