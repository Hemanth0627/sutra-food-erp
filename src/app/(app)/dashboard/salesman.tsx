import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { D, formatINR, sum } from "@/lib/decimal";
import { formatDate, startOfIstMonth } from "@/lib/dates";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/status-badge";
import { SectionCard, ViewAll } from "@/components/app/widgets";
import { PendingSyncBanner } from "@/app/(app)/orders/new/pending-sync-banner";

export async function SalesmanHome({ userId, name }: { userId: string; name: string }) {
  const month = startOfIstMonth(new Date());
  const [orders, monthOrders] = await Promise.all([
    prisma.salesOrder.findMany({ where: { salesmanId: userId }, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.salesOrder.findMany({ where: { salesmanId: userId, orderDate: { gte: month }, status: { notIn: ["REJECTED", "CANCELLED"] } } }),
  ]);
  const value = sum(monthOrders.map((o) => o.subtotal));
  const pending = monthOrders.filter((o) => o.status === "PENDING").length;
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">Vanakkam,</p>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      </div>
      <PendingSyncBanner userId={userId} />
      <Button asChild variant="brand" size="lg" className="h-14 w-full text-base">
        <Link href="/orders/new"><PlusCircle className="!size-5" /> New order</Link>
      </Button>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">Orders (month)</div><div className="tabular mt-1 text-lg font-semibold">{monthOrders.length}</div></div>
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">Value</div><div className="tabular mt-1 text-lg font-semibold">{formatINR(value, 0)}</div></div>
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">Pending</div><div className="tabular mt-1 text-lg font-semibold">{pending}</div></div>
      </div>
      <SectionCard title="Recent orders" className="mt-4" action={<ViewAll href="/orders" />}>
        {orders.length ? (
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{o.customer.name}</div>
                    <div className="text-xs text-muted-foreground">{o.orderNo} · {formatDate(o.orderDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-sm font-medium">{formatINR(D(o.subtotal))}</div>
                    <StatusBadge status={o.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">No orders yet. Tap New order to start.</p>}
      </SectionCard>
    </div>
  );
}
