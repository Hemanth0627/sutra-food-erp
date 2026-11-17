import Link from "next/link";
import { Plus } from "lucide-react";
import { formatINR, formatQty } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const user = await requirePageUser("purchases:view");
  const purchases = await prisma.purchase.findMany({ include: { supplier: true, items: { include: { item: true, unit: true } }, createdBy: true }, orderBy: { receivedDate: "desc" }, take: 200 });
  return (
    <>
      <PageHeader
        title="Purchases & material receipts"
        description="Each posted purchase adds stock through a purchase-receipt ledger entry and updates the weighted-average cost."
        actions={hasPermission(user.role, "purchases:create") && <Button asChild><Link href="/purchases/new"><Plus /> Record purchase</Link></Button>}
      />
      <Card>
        {purchases.length ? (
          <Table>
            <THead><TR><TH>Purchase</TH><TH>Supplier</TH><TH>Items</TH><TH className="text-right">Taxable</TH><TH className="text-right">GST</TH><TH className="text-right">Total</TH></TR></THead>
            <TBody>
              {purchases.map((p) => (
                <TR key={p.id}>
                  <TD><Link href={`/purchases/${p.id}`} className="font-medium hover:underline">{p.purchaseNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(p.receivedDate)} · {p.createdBy.name}</div></TD>
                  <TD>{p.supplier.name}<div className="text-[11px] text-muted-foreground">Inv {p.supplierInvoiceNo}</div></TD>
                  <TD className="text-xs">{p.items.map((i) => `${formatQty(i.quantity)} ${i.unit.code} ${i.item.name} @ ${formatINR(i.rate)}`).join(", ")}</TD>
                  <TD className="tabular text-right">{formatINR(p.taxableTotal)}</TD>
                  <TD className="tabular text-right">{formatINR(p.taxTotal)}</TD>
                  <TD className="tabular text-right font-medium">{formatINR(p.grandTotal)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState title="No purchases yet" />}
      </Card>
    </>
  );
}
