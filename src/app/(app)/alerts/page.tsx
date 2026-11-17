import { requirePageUser } from "@/server/auth/session";
import { collectAlerts } from "@/server/queries/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { AlertList } from "@/components/app/widgets";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  await requirePageUser("alerts:view");
  const alerts = await collectAlerts();
  const count = (c: string) => alerts.filter((a) => a.category === c).length;
  return (
    <>
      <PageHeader title="Alerts" description="Computed live from stock balances, production variance, open orders, receivables and expiry dates." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Stock" value={count("Stock")} tone={count("Stock") ? "warning" : "good"} hint="At or below reorder level" />
        <StatCard label="Production" value={count("Production")} tone={count("Production") ? "warning" : "good"} hint="Variance beyond tolerance" />
        <StatCard label="Sales" value={count("Sales")} tone={alerts.some((a) => a.category === "Sales" && a.severity === "critical") ? "critical" : "neutral"} hint="Shortages, approvals, dispatch" />
        <StatCard label="Receivables" value={count("Receivables")} tone={count("Receivables") ? "critical" : "good"} hint="Overdue / over limit" />
        <StatCard label="Expiry" value={count("Expiry")} hint="Within 30 days" />
      </div>
      <Card className="mt-4"><CardContent className="pt-4"><AlertList alerts={alerts} /></CardContent></Card>
    </>
  );
}
