import { requirePageUser } from "@/server/auth/session";
import { AccountantDashboard } from "./accountant";
import { AdminDashboard } from "./admin";
import { OwnerDashboard } from "./owner";
import { ProductionDashboard } from "./production";
import { SalesmanHome } from "./salesman";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requirePageUser();
  const { period } = await searchParams;
  switch (user.role) {
    case "OWNER":
      return <OwnerDashboard period={period} />;
    case "ADMIN":
      return <AdminDashboard name={user.name} />;
    case "SALESMAN":
      return <SalesmanHome userId={user.id} name={user.name} />;
    case "PRODUCTION_SUPERVISOR":
      return <ProductionDashboard />;
    case "ACCOUNTANT":
      return <AccountantDashboard />;
  }
}
