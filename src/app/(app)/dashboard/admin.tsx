import Link from "next/link";
import { formatINR, formatQty } from "@/lib/decimal";
import { plural } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { AlertList, SectionCard, ViewAll } from "@/components/app/widgets";
import { collectAlerts, receivablesKpis, salesKpis, stockSummary } from "@/server/queries/dashboard";

export async function AdminDashboard({ name }: { name: string }) {
  const [sales, stock, recv, alerts, pending, toDispatch] = await Promise.all([
    salesKpis(),
    stockSummary(),
    receivablesKpis(),
    collectAlerts(),
    prisma.salesOrder.findMany({ where: { status: "PENDING" }, include: { customer: true, salesman: true }, orderBy: { orderDate: "asc" }, take: 6 }),
    prisma.invoice.findMany({ where: { status: "ISSUED", dispatch: { is: null } }, orderBy: { invoiceDate: "asc" }, take: 6 }),
  ]);
  return (
    <>
      <PageHeader
        title={`Good day, ${name.split(" ")[0]}`}
        description="Orders to verify, invoices to dispatch and money to collect."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/purchases/new">Record purchase</Link></Button>
            <Button asChild><Link href="/payments">Record payment</Link></Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pending orders" value={sales.pendingOrders} hint="Awaiting verification" tone={sales.pendingOrders ? "warning" : "neutral"} href="/orders?status=PENDING" />
        <StatCard label="Revenue this month" value={formatINR(sales.monthRevenue)} hint={plural(sales.monthInvoices, "invoice")} href="/invoices" />
        <StatCard label="Outstanding" value={formatINR(recv.outstanding)} hint={`${plural(recv.openInvoices.length, "open invoice")}`} href="/payments" />
        <StatCard label="Finished goods" value={`${formatQty(stock.fgQty)} pkts`} hint={`${plural(stock.lowStock.length, "item")} at reorder level`} tone={stock.lowStock.length ? "warning" : "neutral"} href="/inventory" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Orders awaiting approval" action={<ViewAll href="/orders?status=PENDING" />}>
          {pending.length ? (
            <Table>
              <THead><TR><TH>Order</TH><TH>Customer</TH><TH className="text-right">Value</TH><TH /></TR></THead>
              <TBody>
                {pending.map((o) => (
                  <TR key={o.id}>
                    <TD><Link className="font-medium hover:underline" href={`/orders/${o.id}`}>{o.orderNo}</Link><div className="text-[11px] text-muted-foreground">{o.salesman.name} · {formatDate(o.orderDate)}</div></TD>
                    <TD>{o.customer.name}</TD>
                    <TD className="tabular text-right">{formatINR(o.subtotal)}</TD>
                    <TD className="text-right"><Button asChild size="sm" variant="outline"><Link href={`/orders/${o.id}`}>Review</Link></Button></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">No orders waiting.</p>}
        </SectionCard>
        <SectionCard title="Invoices to dispatch" action={<ViewAll href="/dispatch" />}>
          {toDispatch.length ? (
            <Table>
              <THead><TR><TH>Invoice</TH><TH>Customer</TH><TH className="text-right">Total</TH><TH /></TR></THead>
              <TBody>
                {toDispatch.map((i) => (
                  <TR key={i.id}>
                    <TD><Link className="font-medium hover:underline" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(i.invoiceDate)}</div></TD>
                    <TD>{i.customerName}</TD>
                    <TD className="tabular text-right">{formatINR(i.grandTotal)}</TD>
                    <TD className="text-right"><StatusBadge status="PENDING" label="To dispatch" /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">Everything invoiced has been dispatched.</p>}
        </SectionCard>
      </div>
      <SectionCard title="Alerts" className="mt-4" action={<ViewAll href="/alerts" />}>
        <AlertList alerts={alerts} limit={6} />
      </SectionCard>
    </>
  );
}
