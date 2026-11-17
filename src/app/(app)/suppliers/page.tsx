import { formatINR, sum } from "@/lib/decimal";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SupplierFormDialog } from "@/components/forms/master-forms";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const user = await requirePageUser("suppliers:view");
  const canManage = hasPermission(user.role, "suppliers:manage");
  const suppliers = await prisma.supplier.findMany({ include: { purchases: { select: { grandTotal: true } } }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Suppliers" description="Vendors for raw and packaging materials. All seeded suppliers are fictional." actions={canManage && <SupplierFormDialog />} />
      <Card>
        {suppliers.length ? (
          <Table>
            <THead><TR><TH>Supplier</TH><TH>GSTIN</TH><TH>Location</TH><TH className="text-right">Terms</TH><TH className="text-right">Purchases</TH>{canManage && <TH />}</TR></THead>
            <TBody>
              {suppliers.map((s) => (
                <TR key={s.id}>
                  <TD><div className="font-medium">{s.name}</div><div className="text-[11px] text-muted-foreground">{s.code} · {s.phone}</div></TD>
                  <TD className="font-mono text-xs">{s.gstin ?? "—"}</TD>
                  <TD>{s.city}, {s.state}</TD>
                  <TD className="tabular text-right">{s.paymentTermsDays} days</TD>
                  <TD className="tabular text-right">{formatINR(sum(s.purchases.map((p) => p.grandTotal)))}</TD>
                  {canManage && <TD className="text-right"><SupplierFormDialog supplier={{ id: s.id, name: s.name, gstin: s.gstin ?? "", phone: s.phone, email: s.email ?? "", addressLine: s.addressLine, city: s.city, stateCode: s.stateCode, paymentTermsDays: s.paymentTermsDays }} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState title="No suppliers" />}
      </Card>
    </>
  );
}
