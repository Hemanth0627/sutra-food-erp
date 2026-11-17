import { D, formatINR, formatQty, sum } from "@/lib/decimal";
import { startOfIstMonth } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/widgets";

export const metadata = { title: "Sales summary" };

export default async function SalesSummaryPage() {
  const user = await requirePageUser("orders:view-own");
  const month = startOfIstMonth(new Date());
  const orders = await prisma.salesOrder.findMany({
    where: { salesmanId: user.id, status: { notIn: ["REJECTED", "CANCELLED"] } },
    include: { customer: true, items: { include: { product: { include: { item: true } } } } },
  });
  const byCustomer = new Map<string, { name: string; orders: number; qty: ReturnType<typeof D>; value: ReturnType<typeof D>; month: ReturnType<typeof D>; invoiced: ReturnType<typeof D> }>();
  for (const o of orders) {
    const row = byCustomer.get(o.customerId) ?? { name: o.customer.name, orders: 0, qty: D(0), value: D(0), month: D(0), invoiced: D(0) };
    row.orders += 1;
    row.qty = row.qty.plus(sum(o.items.map((i) => i.quantity)));
    row.value = row.value.plus(D(o.subtotal));
    if (o.orderDate >= month) row.month = row.month.plus(D(o.subtotal));
    row.invoiced = row.invoiced.plus(sum(o.items.map((i) => D(i.invoicedQty).times(D(i.rate)))));
    byCustomer.set(o.customerId, row);
  }
  const rows = [...byCustomer.values()].sort((a, b) => b.value.comparedTo(a.value));
  const products = new Map<string, { name: string; qty: ReturnType<typeof D> }>();
  for (const o of orders) for (const i of o.items) {
    const p = products.get(i.productId) ?? { name: i.product.item.name, qty: D(0) };
    p.qty = p.qty.plus(D(i.quantity));
    products.set(i.productId, p);
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Sales summary" description="Your customer-wise order value (before tax), excluding rejected and cancelled orders." />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">Total ordered</div><div className="tabular mt-1 text-lg font-semibold">{formatINR(sum(rows.map((r) => r.value)))}</div></div>
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">This month</div><div className="tabular mt-1 text-lg font-semibold">{formatINR(sum(rows.map((r) => r.month)))}</div></div>
      </div>
      <SectionCard title="By customer" className="mt-4">
        {rows.length ? (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.name} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.orders} order(s) · {formatQty(r.qty)} pkts · invoiced {formatINR(r.invoiced)}</div>
                </div>
                <div className="tabular font-semibold">{formatINR(r.value)}</div>
              </li>
            ))}
          </ul>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">No orders yet.</p>}
      </SectionCard>
      <SectionCard title="By product" className="mt-4">
        <ul className="divide-y">
          {[...products.values()].map((p) => (
            <li key={p.name} className="flex justify-between py-2 text-sm"><span>{p.name}</span><span className="tabular font-medium">{formatQty(p.qty)} pkts</span></li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
