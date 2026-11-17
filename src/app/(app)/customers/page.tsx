import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { formatINR } from "@/lib/decimal";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { customerBalances } from "@/server/queries/receivables";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { CustomerFormDialog } from "@/components/forms/master-forms";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePageUser("customers:view");
  const { q, status } = await searchParams;
  const canManage = hasPermission(user.role, "customers:manage");
  const isSalesman = user.role === "SALESMAN";
  const where: Prisma.CustomerWhereInput = {
    ...(status === "RETAILER" || status === "DISTRIBUTOR" ? { type: status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { gstin: { contains: q, mode: "insensitive" } }] } : {}),
    ...(isSalesman ? { isActive: true } : {}),
  };
  const [customers, salesmen, balances] = await Promise.all([
    prisma.customer.findMany({ where, include: { salesman: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "SALESMAN", isActive: true }, select: { id: true, name: true } }),
    isSalesman ? Promise.resolve(new Map()) : customerBalances(),
  ]);
  return (
    <>
      <PageHeader title="Customers" description="Retailers and distributors with GST registration, place of supply, credit terms and live balances." actions={canManage && <CustomerFormDialog salesmen={salesmen} />} />
      <ListToolbar placeholder="Name, city or GSTIN" statuses={[{ value: "RETAILER", label: "Retailers" }, { value: "DISTRIBUTOR", label: "Distributors" }]} />
      <Card>
        {customers.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH className="hidden md:table-cell">GSTIN</TH>
                <TH>Place of supply</TH>
                {!isSalesman && <TH className="text-right">Credit limit</TH>}
                {!isSalesman && <TH className="text-right">Outstanding</TH>}
                <TH className="hidden lg:table-cell">Salesman</TH>
              </TR>
            </THead>
            <TBody>
              {customers.map((c) => (
                <TR key={c.id}>
                  <TD>
                    {isSalesman ? <span className="font-medium">{c.name}</span> : <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{c.code} · <Badge variant={c.type === "DISTRIBUTOR" ? "info" : "neutral"}>{c.type === "DISTRIBUTOR" ? "Distributor" : "Retailer"}</Badge>{!c.isActive && <Badge variant="danger">Inactive</Badge>}</div>
                  </TD>
                  <TD className="hidden font-mono text-xs md:table-cell">{c.gstin ?? "—"}</TD>
                  <TD className="text-sm">{c.placeOfSupply}<div className="text-[11px] text-muted-foreground">{c.city}</div></TD>
                  {!isSalesman && <TD className="tabular text-right">{formatINR(c.creditLimit)}<div className="text-[11px] text-muted-foreground">{c.paymentTermsDays} days</div></TD>}
                  {!isSalesman && <TD className="tabular text-right font-medium">{formatINR(balances.get(c.id)?.outstanding ?? 0)}</TD>}
                  <TD className="hidden text-sm lg:table-cell">{c.salesman?.name ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState title="No customers found" />}
      </Card>
    </>
  );
}
