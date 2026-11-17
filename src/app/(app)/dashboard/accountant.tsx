import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { formatINR } from "@/lib/decimal";
import { plural } from "@/lib/utils";
import { REPORTS } from "@/server/reports/definitions";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard, ViewAll } from "@/components/app/widgets";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { startOfIstMonth } from "@/lib/dates";
import { receivablesKpis, salesKpis } from "@/server/queries/dashboard";

export async function AccountantDashboard() {
  const month = startOfIstMonth(new Date());
  const [sales, recv, purchases, cn] = await Promise.all([
    salesKpis(),
    receivablesKpis(),
    prisma.purchase.aggregate({ where: { receivedDate: { gte: month } }, _sum: { taxableTotal: true, taxTotal: true }, _count: true }),
    prisma.creditNote.aggregate({ where: { noteDate: { gte: month } }, _sum: { grandTotal: true }, _count: true }),
  ]);
  return (
    <>
      <PageHeader title="Accounts" description="Read-only financial view. Every figure comes from posted transactions; exports are logged in the audit trail." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Taxable sales (month)" value={formatINR(sales.monthRevenue)} hint={plural(sales.monthInvoices, "invoice")} href="/reports/sales-register" />
        <StatCard label="Output GST (month)" value={formatINR(sales.monthGst)} hint="CGST + SGST + IGST" href="/reports/gst-summary" />
        <StatCard label="Purchases (month)" value={formatINR(purchases._sum.taxableTotal ?? 0)} hint={`${plural(purchases._count, "bill")} · input GST ${formatINR(purchases._sum.taxTotal ?? 0)}`} href="/reports/purchase-register" />
        <StatCard label="Outstanding receivables" value={formatINR(recv.outstanding)} hint={`Collected ${formatINR(recv.collectedThisMonth)} this month`} tone={recv.overdueCount ? "critical" : "neutral"} href="/reports/outstanding" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Open invoices" description={`${recv.openInvoices.length} with a balance · credit notes this month: ${cn._count}`} action={<ViewAll href="/reports/receivables-ageing" label="Ageing" />}>
          <Table>
            <THead><TR><TH>Invoice</TH><TH>Customer</TH><TH>Due</TH><TH className="text-right">Balance</TH></TR></THead>
            <TBody>
              {recv.openInvoices.slice(0, 6).map((i) => (
                <TR key={i.id}>
                  <TD><Link href={`/invoices/${i.id}`} className="font-medium hover:underline">{i.invoiceNo}</Link></TD>
                  <TD>{i.customerName}</TD>
                  <TD className={i.daysPastDue > 0 ? "text-destructive" : ""}>{formatDate(i.dueDate)}</TD>
                  <TD className="tabular text-right">{formatINR(i.balance)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!recv.openInvoices.length && <p className="py-6 text-center text-sm text-muted-foreground">No open invoices.</p>}
        </SectionCard>
        <SectionCard title="Reports" description="Filter by date, customer, product or type; export CSV, Excel or PDF" action={<ViewAll href="/reports" />}>
          <ul className="grid gap-1 sm:grid-cols-2">
            {REPORTS.map((r) => (
              <li key={r.key}>
                <Link href={`/reports/${r.key}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <FileBarChart className="size-4 text-muted-foreground" /> {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
