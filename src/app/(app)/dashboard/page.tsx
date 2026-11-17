import { requirePageUser } from "@/server/auth/session";
import { AccountantDashboard } from "./accountant";
import { AdminDashboard } from "./admin";
import { OwnerDashboard } from "./owner";
import { ProductionDashboard } from "./production";
import { SalesmanHome } from "./salesman";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  switch (user.role) {
    case "OWNER":
      return <OwnerDashboard />;
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
