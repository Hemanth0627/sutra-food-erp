import Link from "next/link";
import { D, formatINR, sum } from "@/lib/decimal";
import { formatDate, isoDateIst } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { customerBalances, openInvoices } from "@/server/queries/receivables";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { RecordPaymentButton } from "@/components/forms/payment-form";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const user = await requirePageUser("payments:view");
  const [payments, customers, open, balances] = await Promise.all([
    prisma.payment.findMany({ include: { customer: true, allocations: { include: { invoice: true } }, createdBy: true }, orderBy: { paymentDate: "desc" }, take: 200 }),
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    openInvoices(),
    customerBalances(),
  ]);
  return (
    <>
      <PageHeader
        title="Payments & receivables"
        description="Receipts, invoice allocation and customer balances."
        actions={hasPermission(user.role, "payments:create") && (
          <RecordPaymentButton customers={customers.map((c) => ({ id: c.id, name: c.name }))} openInvoices={open.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, customerId: i.customerId, invoiceDate: isoDateIst(i.invoiceDate), balance: i.balance.toFixed(2) }))} />
        )}
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Customer balances</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Customer</TH><TH className="text-right">Invoiced</TH><TH className="text-right">Received</TH><TH className="text-right">Outstanding</TH></TR></THead>
              <TBody>
                {customers.map((c) => {
                  const b = balances.get(c.id);
                  return (
                    <TR key={c.id}>
                      <TD><Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link></TD>
                      <TD className="tabular text-right">{formatINR(b?.invoiced ?? 0)}</TD>
                      <TD className="tabular text-right">{formatINR(b?.received ?? 0)}</TD>
                      <TD className="tabular text-right font-medium">{formatINR(b?.outstanding ?? 0)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Open invoices</CardTitle></CardHeader>
          <CardContent>
            {open.length ? (
              <Table>
                <THead><TR><TH>Invoice</TH><TH>Customer</TH><TH>Due</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH>Ageing</TH></TR></THead>
                <TBody>
                  {open.map((i) => (
                    <TR key={i.id}>
                      <TD><Link href={`/invoices/${i.id}`} className="font-medium hover:underline">{i.invoiceNo}</Link></TD>
                      <TD>{i.customerName}</TD>
                      <TD>{formatDate(i.dueDate)}</TD>
                      <TD className="tabular text-right">{formatINR(i.grandTotal)}</TD>
                      <TD className="tabular text-right font-medium">{formatINR(i.balance)}</TD>
                      <TD><StatusBadge status={i.daysPastDue > 0 ? "OVERDUE" : "ACTIVE"} label={i.bucket} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <EmptyState title="No open invoices" />}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Receipts</CardTitle></CardHeader>
        <CardContent>
          {payments.length ? (
            <Table>
              <THead><TR><TH>Receipt</TH><TH>Customer</TH><TH>Mode</TH><TH>Allocated to</TH><TH className="text-right">Amount</TH><TH className="text-right">On account</TH></TR></THead>
              <TBody>
                {payments.map((p) => {
                  const allocated = sum(p.allocations.map((a) => a.amount));
                  return (
                    <TR key={p.id}>
                      <TD><div className="font-medium">{p.receiptNo}</div><div className="text-[11px] text-muted-foreground">{formatDate(p.paymentDate)} · {p.createdBy.name}</div></TD>
                      <TD>{p.customer.name}</TD>
                      <TD className="text-xs">{p.mode.replace("_", " ")}{p.reference ? ` · ${p.reference}` : ""}</TD>
                      <TD className="text-xs">{p.allocations.map((a) => `${a.invoice.invoiceNo} (${formatINR(a.amount)})`).join(", ") || "—"}</TD>
                      <TD className="tabular text-right font-medium">{formatINR(p.amount)}</TD>
                      <TD className="tabular text-right">{formatINR(D(p.amount).minus(allocated))}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : <EmptyState title="No receipts yet" />}
        </CardContent>
      </Card>
    </>
  );
}
