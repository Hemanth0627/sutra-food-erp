import type { Prisma } from "@prisma/client";
import { formatDateTime } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Audit log" };
const AREAS = ["order", "invoice", "dispatch", "payment", "purchase", "production", "bom", "expense", "stock", "customer", "product", "material", "supplier", "settings", "report", "auth"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requirePageUser("audit:view");
  const { q, status } = await searchParams;
  const where: Prisma.AuditLogWhereInput = {
    ...(status && AREAS.includes(status) ? { action: { startsWith: `${status}.` } } : {}),
    ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" } }, { user: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const logs = await prisma.auditLog.findMany({ where, include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageHeader title="Audit log" description="Every posting writes an audit entry inside the same database transaction: who did what, when and from where. Entries cannot be edited from the application." />
      <ListToolbar placeholder="Search details or user" statuses={AREAS.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))} />
      <Card>
        <Table>
          <THead><TR><TH>Time (IST)</TH><TH>User</TH><TH>Action</TH><TH>Details</TH></TR></THead>
          <TBody>
            {logs.map((l) => (
              <TR key={l.id}>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</TD>
                <TD className="text-sm">{l.user?.name ?? "System"}<div className="text-[11px] text-muted-foreground">{l.user?.role.replace("_", " ").toLowerCase()}{l.ipAddress ? ` · ${l.ipAddress}` : ""}</div></TD>
                <TD><Badge variant={l.action.includes("cancel") || l.action.includes("failed") || l.action.includes("reject") ? "danger" : "neutral"}>{l.action}</Badge></TD>
                <TD className="text-[13px]">{l.summary}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
