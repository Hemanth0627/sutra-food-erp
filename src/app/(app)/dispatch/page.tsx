import Link from "next/link";
import { formatINR, formatQty, sum } from "@/lib/decimal";
import { formatDate, formatDateTime } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { finishedGoodsAvailability } from "@/server/services/availability";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DispatchButton } from "../invoices/[id]/invoice-actions";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const user = await requirePageUser("dispatch:view");
  const canDispatch = hasPermission(user.role, "dispatch:create");
  const [queue, history] = await Promise.all([
    prisma.invoice.findMany({ where: { status: "ISSUED", dispatch: { is: null } }, include: { items: true }, orderBy: { invoiceDate: "asc" } }),
    prisma.dispatch.findMany({ include: { invoice: true, items: { include: { product: { include: { item: true } } } }, createdBy: true }, orderBy: { dispatchDate: "desc" }, take: 100 }),
  ]);
  const avail = await finishedGoodsAvailability(prisma, [...new Set(queue.flatMap((i) => i.items.map((it) => it.productId)))]);
  return (
    <>
      <PageHeader title="Dispatch" description="Invoices waiting to leave the factory, and dispatch history. Each invoice can be dispatched exactly once." />
      <Card>
        <CardHeader><CardTitle>Ready to dispatch ({queue.length})</CardTitle></CardHeader>
        <CardContent>
          {queue.length ? (
            <Table>
              <THead><TR><TH>Invoice</TH><TH>Customer</TH><TH>Items</TH><TH className="text-right">On hand</TH><TH className="text-right">Total</TH><TH /></TR></THead>
              <TBody>
                {queue.map((i) => (
                  <TR key={i.id}>
                    <TD><Link href={`/invoices/${i.id}`} className="font-medium hover:underline">{i.invoiceNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(i.invoiceDate)}</div></TD>
                    <TD>{i.customerName}</TD>
                    <TD className="text-xs">{i.items.map((it) => `${formatQty(it.quantity)} × ${it.description}`).join(", ")}</TD>
                    <TD className="tabular text-right text-xs">{i.items.map((it) => formatQty(avail.get(it.productId)?.onHand ?? 0)).join(", ")}</TD>
                    <TD className="tabular text-right">{formatINR(i.grandTotal)}</TD>
                    <TD className="text-right">{canDispatch && <DispatchButton invoiceId={i.id} invoiceNo={i.invoiceNo} size="sm" />}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState title="Nothing waiting" description="Every issued invoice has been dispatched." />}
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader><CardTitle>Dispatch history</CardTitle></CardHeader>
        <CardContent>
          {history.length ? (
            <Table>
              <THead><TR><TH>Dispatch</TH><TH>Invoice</TH><TH>Customer</TH><TH>Goods</TH><TH className="text-right">Stock cost</TH><TH>Vehicle</TH></TR></THead>
              <TBody>
                {history.map((d) => (
                  <TR key={d.id}>
                    <TD><div className="font-medium">{d.dispatchNo}</div><div className="text-[11px] text-muted-foreground">{formatDateTime(d.dispatchDate)} · {d.createdBy.name}</div></TD>
                    <TD><Link href={`/invoices/${d.invoiceId}`} className="hover:underline">{d.invoice.invoiceNo}</Link></TD>
                    <TD>{d.invoice.customerName}</TD>
                    <TD className="text-xs">{d.items.map((it) => `${formatQty(it.quantity)} × ${it.product.item.name}`).join(", ")}</TD>
                    <TD className="tabular text-right">{formatINR(sum(d.items.map((x) => x.costValue)))}</TD>
                    <TD className="text-xs">{d.vehicleNo ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState title="No dispatches yet" />}
        </CardContent>
      </Card>
    </>
  );
}
