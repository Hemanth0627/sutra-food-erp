import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCompanySettings } from "@/server/services/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { ROLE_LABELS, ROLE_PERMISSIONS, type Role } from "@/lib/permissions";
import { formatDateTime } from "@/lib/dates";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePageUser("settings:manage");
  const s = await getCompanySettings();
  const users = await prisma.user.findMany({ orderBy: { role: "asc" } });
  return (
    <>
      <PageHeader title="Settings" description="Seller GST details printed on invoices and the production variance tolerance. Changes are audited and never alter posted documents." />
      <SettingsForm
        initial={{
          legalName: s.legalName, tradeName: s.tradeName, gstin: s.gstin, addressLine1: s.addressLine1, addressLine2: s.addressLine2 ?? "", city: s.city, stateCode: s.stateCode,
          pincode: s.pincode, phone: s.phone ?? "", email: s.email ?? "", bankDetails: s.bankDetails ?? "", varianceTolerancePct: s.varianceTolerancePct.toString(),
        }}
      />
      <Card className="mt-4">
        <CardHeader><CardTitle>Users & roles</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>User</TH><TH>Role</TH><TH>Permissions (server-enforced)</TH><TH>Last sign-in</TH></TR></THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD><div className="font-medium">{u.name}</div><div className="text-[11px] text-muted-foreground">{u.email}</div></TD>
                  <TD>{ROLE_LABELS[u.role as Role]}</TD>
                  <TD className="max-w-xl text-[11px] text-muted-foreground">{ROLE_PERMISSIONS[u.role as Role].join(", ")}</TD>
                  <TD className="text-xs">{formatDateTime(u.lastLoginAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
