import Link from "next/link";
import { notFound } from "next/navigation";
import { D, formatINR, sum } from "@/lib/decimal";
import { formatDate, isoDateIst } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { customerBalances, emptyBalance, openInvoices } from "@/server/queries/receivables";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { CustomerFormDialog } from "@/components/forms/master-forms";
import { RecordPaymentButton } from "@/components/forms/payment-form";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["customers:manage", "payments:view", "invoices:view"]);
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id }, include: { salesman: true } });
  if (!c) notFound();
  const [b, invoices, payments, orders, salesmen, open] = await Promise.all([
    customerBalances(id).then((m) => m.get(id) ?? emptyBalance(id)),
    prisma.invoice.findMany({ where: { customerId: id }, include: { allocations: true }, orderBy: { invoiceDate: "desc" } }),
    prisma.payment.findMany({ where: { customerId: id }, include: { allocations: { include: { invoice: true } } }, orderBy: { paymentDate: "desc" } }),
    prisma.salesOrder.findMany({ where: { customerId: id }, orderBy: { orderDate: "desc" }, take: 20 }),
    prisma.user.findMany({ where: { role: "SALESMAN" }, select: { id: true, name: true } }),
    openInvoices({ customerId: id }),
  ]);
  // Customer statement: invoices (debit) and receipts (credit) in date order with running balance.
  const entries = [
    ...invoices.filter((i) => i.status === "ISSUED").map((i) => ({ date: i.invoiceDate, ref: i.invoiceNo, href: `/invoices/${i.id}`, debit: D(i.grandTotal), credit: D(0), kind: "Invoice" })),
    ...payments.map((p) => ({ date: p.paymentDate, ref: p.receiptNo, href: undefined as string | undefined, debit: D(0), credit: D(p.amount), kind: `Receipt (${p.mode.replace("_", " ").toLowerCase()})` })),
  ].sort((a, x) => a.date.getTime() - x.date.getTime());
  let running = D(0);
  const statement = entries.map((e) => {
    running = running.plus(e.debit).minus(e.credit);
    return { ...e, balance: running };
  });
  return (
    <>
      <PageHeader
        title={c.name}
        description={`${c.code} · ${c.type === "DISTRIBUTOR" ? "Distributor" : "Retailer"} · ${c.addressLine}, ${c.city} · GSTIN ${c.gstin ?? "unregistered"} · place of supply ${c.placeOfSupply}`}
        actions={
          <>
            {hasPermission(user.role, "payments:create") && <RecordPaymentButton customers={[{ id: c.id, name: c.name }]} defaultCustomerId={c.id} openInvoices={open.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, customerId: i.customerId, invoiceDate: isoDateIst(i.invoiceDate), balance: i.balance.toFixed(2) }))} />}
            {hasPermission(user.role, "customers:manage") && (
              <CustomerFormDialog
                salesmen={salesmen}
                customer={{ id: c.id, name: c.name, type: c.type, gstin: c.gstin ?? "", phone: c.phone, email: c.email ?? "", addressLine: c.addressLine, city: c.city, stateCode: c.stateCode, pincode: c.pincode ?? "", creditLimit: c.creditLimit.toFixed(2), paymentTermsDays: c.paymentTermsDays, salesmanId: c.salesmanId ?? "" }}
              />
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Outstanding" value={formatINR(b.outstanding)} tone={b.outstanding.gt(D(c.creditLimit)) && D(c.creditLimit).gt(0) ? "critical" : "neutral"} hint={`Credit limit ${formatINR(c.creditLimit)}`} />
        <StatCard label="Invoiced" value={formatINR(b.invoiced)} hint={`${invoices.filter((i) => i.status === "ISSUED").length} invoices`} />
        <StatCard label="Received" value={formatINR(b.received)} hint={`${payments.length} receipts`} />
        <StatCard label="Unallocated credit" value={formatINR(b.onAccount)} hint={`Terms ${c.paymentTermsDays} days`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Account statement</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Date</TH><TH>Reference</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH></TR></THead>
              <TBody>
                {statement.map((s, i) => (
                  <TR key={i}>
                    <TD>{formatDate(s.date)}</TD>
                    <TD>{s.href ? <Link href={s.href} className="font-medium hover:underline">{s.ref}</Link> : <span className="font-medium">{s.ref}</span>}<div className="text-[11px] text-muted-foreground">{s.kind}</div></TD>
                    <TD className="tabular text-right">{s.debit.isZero() ? "" : formatINR(s.debit)}</TD>
                    <TD className="tabular text-right">{s.credit.isZero() ? "" : formatINR(s.credit)}</TD>
                    <TD className="tabular text-right font-medium">{formatINR(s.balance)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {!statement.length && <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Invoices & orders</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Invoice</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH>Status</TH></TR></THead>
              <TBody>
                {invoices.map((i) => (
                  <TR key={i.id}>
                    <TD><Link href={`/invoices/${i.id}`} className="font-medium hover:underline">{i.invoiceNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(i.invoiceDate)} · due {formatDate(i.dueDate)}</div></TD>
                    <TD className="tabular text-right">{formatINR(i.grandTotal)}</TD>
                    <TD className="tabular text-right">{i.status === "ISSUED" ? formatINR(D(i.grandTotal).minus(sum(i.allocations.map((a) => a.amount)))) : "—"}</TD>
                    <TD><StatusBadge status={i.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-4 text-xs font-medium text-muted-foreground">Recent orders</div>
            <ul className="mt-1 space-y-1 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between">
                  <Link href={`/orders/${o.id}`} className="hover:underline">{o.orderNo} · {formatDate(o.orderDate)}</Link>
                  <span className="flex items-center gap-2"><span className="tabular">{formatINR(o.subtotal)}</span><StatusBadge status={o.status} /></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
