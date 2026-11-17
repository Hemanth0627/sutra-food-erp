import { formatINR, formatQty } from "@/lib/decimal";
import { plural } from "@/lib/utils";
import { resolvePeriod } from "@/lib/dates";
import { PeriodFilter } from "@/components/app/period-filter";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ActivityList, AlertList, ProfitabilityTable, SectionCard, ViewAll } from "@/components/app/widgets";
import { BarsChart } from "@/components/charts/charts";
import { collectAlerts, inventoryMovement, monthlySales, productionKpis, productionPerformance, productProfitability, receivablesKpis, recentActivity, salesKpis, stockSummary } from "@/server/queries/dashboard";

export async function OwnerDashboard({ period: periodKey }: { period?: string }) {
  const now = new Date();
  const period = resolvePeriod(periodKey, now);
  const p = period.label.toLowerCase();
  const [sales, stock, prod, recv, monthly, perf, profit, alerts, activity, movement] = await Promise.all([
    salesKpis(now, period.from), stockSummary(), productionKpis(now, period.from), receivablesKpis(now, period.from), monthlySales(6), productionPerformance(8), productProfitability(period.from), collectAlerts(), recentActivity(8), inventoryMovement(period.from, now),
  ]);
  const varianceAlerts = alerts.filter((a) => a.category === "Production").length;
  return (
    <>
      <PageHeader
        title="Business overview"
        description={`Live figures computed from posted invoices, the stock ledger and production records. Period figures: ${p}.`}
        actions={<PeriodFilter current={period.key} generatedAt={now.toISOString()} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today's sales (taxable)" value={formatINR(sales.todaySales)} hint={`${plural(sales.monthInvoices, "invoice")} in period`} href="/reports/sales-register" />
        <StatCard label={`Revenue (${p})`} value={formatINR(sales.monthRevenue)} hint={`GST collected ${formatINR(sales.monthGst)}`} href="/analytics" />
        <StatCard label="Orders" value={sales.totalOrders} hint={`${sales.pendingOrders} pending approval`} tone={sales.pendingOrders ? "warning" : "neutral"} href="/orders" />
        <StatCard label={`Production output (${p})`} value={`${formatQty(prod.monthOutput)} pkts`} hint={`${plural(prod.runsCompleted, "run")} · yield ${prod.monthYieldPct.toFixed(1)}%`} href="/production" />
        <StatCard label="Raw + packaging stock value" value={formatINR(stock.rawValue.plus(stock.packagingValue))} hint={`Raw ${formatINR(stock.rawValue)} · Packaging ${formatINR(stock.packagingValue)}`} href="/inventory" />
        <StatCard label="Finished-goods stock" value={`${formatQty(stock.fgQty)} pkts`} hint={`Valued at ${formatINR(stock.fgValue)}`} href="/inventory?tab=FINISHED_GOOD" />
        <StatCard label="Outstanding receivables" value={formatINR(recv.outstanding)} hint={recv.overdueCount ? `${recv.overdueCount} overdue · ${formatINR(recv.overdueAmount)}` : "Nothing overdue"} tone={recv.overdueCount ? "critical" : "neutral"} href="/finance" />
        <StatCard label={`Collected (${p})`} value={formatINR(recv.collectedThisMonth)} hint={plural(recv.receiptsThisMonth, "receipt")} tone="good" href="/reports/collections" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Monthly sales" description="Taxable value of issued invoices, last 6 months" className="lg:col-span-2" action={<ViewAll href="/analytics" />}>
          <BarsChart data={monthly} xKey="month" series={[{ key: "sales", label: "Sales" }]} format="money" ariaLabel="Bar chart of monthly sales for the last six months" />
        </SectionCard>
        <SectionCard title="Alerts" description={`${stock.lowStock.length} low stock · ${varianceAlerts} variance`} action={<ViewAll href="/alerts" />}>
          <AlertList alerts={alerts} limit={5} />
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Production performance" description="Expected vs good output, recent runs" className="lg:col-span-2" action={<ViewAll href="/production/variance" />}>
          <BarsChart data={perf} xKey="run" series={[{ key: "expected", label: "Expected" }, { key: "good", label: "Good output" }]} format="qty" ariaLabel="Grouped bar chart of expected versus good output per production run" />
        </SectionCard>
        <SectionCard title="Recent transactions" action={<ViewAll href="/audit" />}>
          <ActivityList items={activity} />
        </SectionCard>
      </div>

      <SectionCard title="Inventory movement" description={`Stock value received into and issued out of the ledger (raw, packaging and finished goods), ${p}`} className="mt-4" action={<ViewAll href="/reports/stock-ledger" />}>
        <BarsChart data={movement} xKey="label" series={[{ key: "inward", label: "Stock in" }, { key: "outward", label: "Stock out" }]} format="money" ariaLabel="Grouped bar chart of stock value received and issued per day" />
      </SectionCard>

      <SectionCard title={`Product-wise profitability (${p})`} description="Invoiced revenue against full production cost per packet from the latest costing snapshot" className="mt-4">
        <ProfitabilityTable rows={profit} />
      </SectionCard>
    </>
  );
}
