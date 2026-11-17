import { hasPermission } from "@/lib/permissions";
import { apiRoute } from "@/server/api";
import { prisma } from "@/server/db";
import { collectAlerts } from "@/server/queries/dashboard";

export const dynamic = "force-dynamic";

/**
 * Bell-menu notifications. Office roles get the live operational alerts (stock, variance, shortages,
 * overdue invoices). Salesmen get decisions on their own orders from the last 7 days.
 */
export const GET = apiRoute({}, async ({ user }) => {
  if (hasPermission(user.role, "alerts:view")) {
    const alerts = await collectAlerts();
    return {
      count: alerts.filter((a) => a.severity !== "info").length,
      items: alerts.slice(0, 8).map((a) => ({ id: a.id, severity: a.severity, title: a.title, detail: a.detail, href: a.href })),
      moreHref: "/alerts",
    };
  }
  const since = new Date(Date.now() - 7 * 86400_000);
  const orders = await prisma.salesOrder.findMany({
    where: { salesmanId: user.id, status: { not: "PENDING" }, updatedAt: { gte: since } },
    include: { customer: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return {
    count: orders.filter((o) => o.status === "REJECTED").length,
    items: orders.map((o) => ({
      id: o.id,
      severity: o.status === "REJECTED" ? "warning" : "info",
      title: `${o.orderNo} ${o.status.toLowerCase().replace(/_/g, " ")}`,
      detail: `${o.customer.name}${o.rejectedReason ? `: ${o.rejectedReason}` : ""}`,
      href: `/orders/${o.id}`,
    })),
    moreHref: "/orders",
  };
});
