import Link from "next/link";
import { formatINR, sum } from "@/lib/decimal";
import { formatDate, startOfIstMonth } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { receivablesKpis, salesKpis, stockSummary } from "@/server/queries/dashboard";
import { AGEING_BUCKETS } from "@/server/queries/receivables";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard, ViewAll } from "@/components/app/widgets";
import { BarsChart } from "@/components/charts/charts";

export const metadata = { title: "Financial overview" };

export default async function FinancePage() {
  await requirePageUser(["dashboard:owner", "reports:view"]);
  const month = startOfIstMonth(new Date());
  const [sales, recv, stock, purchases, expenses, cogs] = await Promise.all([
    salesKpis(),
    receivablesKpis(),
    stockSummary(),
    prisma.purchase.aggregate({ where: { receivedDate: { gte: month } }, _sum: { taxableTotal: true, taxTotal: true } }),
    prisma.expense.aggregate({ where: { expenseDate: { gte: month } }, _sum: { amount: true } }),
    prisma.dispatchItem.aggregate({ where: { dispatch: { dispatchDate: { gte: month } } }, _sum: { costValue: true } }),
  ]);
  const buckets = AGEING_BUCKETS.map((b) => ({ bucket: b, amount: Number(sum(recv.openInvoices.filter((i) => i.bucket === b).map((i) => i.balance)).toFixed(2)) }));
  return (
    <>
      <PageHeader title="Financial overview" description="Month-to-date sales, GST, purchases, receivables and stock values from posted records." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales (taxable, month)" value={formatINR(sales.monthRevenue)} hint={`Invoice value ${formatINR(sales.monthGross)}`} href="/reports/sales-register" />
        <StatCard label="Output GST (month)" value={formatINR(sales.monthGst)} href="/reports/gst-summary" />
        <StatCard label="Purchases (month)" value={formatINR(purchases._sum.taxableTotal ?? 0)} hint={`Input GST ${formatINR(purchases._sum.taxTotal ?? 0)}`} href="/reports/purchase-register" />
        <StatCard label="Production overheads (month)" value={formatINR(expenses._sum.amount ?? 0)} href="/expenses" />
        <StatCard label="Stock cost of goods dispatched" value={formatINR(cogs._sum.costValue ?? 0)} hint="Weighted-average value released" href="/reports/product-sales" />
        <StatCard label="Outstanding receivables" value={formatINR(recv.outstanding)} tone={recv.overdueCount ? "critical" : "neutral"} href="/reports/outstanding" />
        <StatCard label="Collections (month)" value={formatINR(recv.collectedThisMonth)} tone="good" href="/reports/collections" />
        <StatCard label="Inventory value" value={formatINR(stock.rawValue.plus(stock.packagingValue).plus(stock.fgValue))} hint="Raw + packaging + finished goods" href="/inventory" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Receivables ageing" description="Open balances by days past due" action={<ViewAll href="/reports/receivables-ageing" />}>
          <BarsChart data={buckets} xKey="bucket" series={[{ key: "amount", label: "Balance" }]} format="money" ariaLabel="Receivables by ageing bucket" />
        </SectionCard>
        <SectionCard title="Open invoices" action={<ViewAll href="/payments" />}>
          <Table>
            <THead><TR><TH>Invoice</TH><TH>Customer</TH><TH>Due</TH><TH className="text-right">Balance</TH></TR></THead>
            <TBody>
              {recv.openInvoices.map((i) => (
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
      </div>
    </>
  );
}
