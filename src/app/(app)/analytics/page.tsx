import { formatINR, formatQty, sum } from "@/lib/decimal";
import { addIstMonths, startOfIstMonth } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { monthlySales, productionPerformance, productProfitability } from "@/server/queries/dashboard";
import { PageHeader } from "@/components/app/page-header";
import { ProfitabilityTable, SectionCard } from "@/components/app/widgets";
import { BarsChart, HBarsChart } from "@/components/charts/charts";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  await requirePageUser("analytics:view");
  const since = addIstMonths(startOfIstMonth(new Date()), -11);
  const [monthly, perf, profit, lines, byCustomer] = await Promise.all([
    monthlySales(12),
    productionPerformance(12),
    productProfitability(since),
    prisma.invoiceItem.findMany({ where: { invoice: { status: "ISSUED", invoiceDate: { gte: since } } }, include: { product: { include: { item: true } } } }),
    prisma.invoice.groupBy({ by: ["customerName"], where: { status: "ISSUED", invoiceDate: { gte: since } }, _sum: { taxableTotal: true } }),
  ]);
  const productQty = new Map<string, number>();
  for (const l of lines) productQty.set(l.product.item.name, (productQty.get(l.product.item.name) ?? 0) + Number(l.quantity.toString()));
  return (
    <>
      <PageHeader title="Analytics" description="Trends over the last 12 months, from posted invoices and completed production runs." />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Sales by month" description="Taxable value of issued invoices">
          <BarsChart data={monthly} xKey="month" series={[{ key: "sales", label: "Sales" }]} format="money" ariaLabel="Monthly sales over twelve months" />
        </SectionCard>
        <SectionCard title="Production: expected vs good output" description="Last 12 completed runs">
          <BarsChart data={perf} xKey="run" series={[{ key: "expected", label: "Expected" }, { key: "good", label: "Good output" }]} format="qty" ariaLabel="Expected versus good output per run" />
        </SectionCard>
        <SectionCard title="Sales by customer" description="Taxable value, 12 months">
          <HBarsChart data={byCustomer.map((c) => ({ customer: c.customerName, value: Number(c._sum.taxableTotal?.toString() ?? 0) })).sort((a, b) => b.value - a.value)} labelKey="customer" valueKey="value" valueLabel="Sales" ariaLabel="Sales by customer" />
        </SectionCard>
        <SectionCard title="Packets sold by product" description="Invoiced quantity, 12 months">
          <HBarsChart data={[...productQty.entries()].map(([product, qty]) => ({ product, qty })).sort((a, b) => b.qty - a.qty)} labelKey="product" valueKey="qty" valueLabel="Packets" format="qty" ariaLabel="Packets sold by product" />
        </SectionCard>
      </div>
      <SectionCard title="Product profitability (12 months)" description="Revenue vs full production cost per packet (latest costing snapshot)" className="mt-4">
        <ProfitabilityTable rows={profit} />
        <p className="mt-2 text-xs text-muted-foreground">Total revenue {formatINR(sum(profit.map((r) => r.revenue)))} · {formatQty(sum(profit.map((r) => r.qty)))} packets</p>
      </SectionCard>
    </>
  );
}
