import { notFound } from "next/navigation";
import { D, formatINR, formatQty } from "@/lib/decimal";
import { formatDate, formatDateTime } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/widgets";
import { ReturnButton } from "./return-button";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("purchases:view");
  const { id } = await params;
  const p = await prisma.purchase.findUnique({ where: { id }, include: { supplier: true, createdBy: true, items: { include: { item: { include: { unit: true } }, unit: true } }, returns: { include: { purchaseItem: { include: { item: true } }, createdBy: true } } } });
  if (!p) notFound();
  const ledger = await prisma.inventoryTransaction.findMany({ where: { OR: [{ sourceType: "PURCHASE", sourceId: p.id }, { sourceType: "PURCHASE_RETURN", sourceId: { in: p.returns.map((r) => r.id) } }] }, include: { item: { include: { unit: true } } }, orderBy: { createdAt: "asc" } });
  const canReturn = hasPermission(user.role, "purchases:create");
  return (
    <>
      <PageHeader title={p.purchaseNo} description={`${p.supplier.name} · supplier invoice ${p.supplierInvoiceNo} dated ${formatDate(p.invoiceDate)} · received ${formatDate(p.receivedDate)} by ${p.createdBy.name}`} />
      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Material</TH><TH className="text-right">Invoiced qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Stock qty</TH><TH className="text-right">Stock rate</TH><TH className="text-right">Taxable</TH><TH className="text-right">GST</TH><TH className="text-right">Returned</TH>{canReturn && <TH />}</TR></THead>
            <TBody>
              {p.items.map((i) => (
                <TR key={i.id}>
                  <TD><div className="font-medium">{i.item.name}</div><div className="text-[11px] text-muted-foreground">{i.batchNo ? `Lot ${i.batchNo}` : ""}{i.expiryDate ? ` · exp ${formatDate(i.expiryDate)}` : ""}</div></TD>
                  <TD className="tabular text-right">{formatQty(i.quantity)} {i.unit.code}</TD>
                  <TD className="tabular text-right">{formatINR(i.rate)}</TD>
                  <TD className="tabular text-right">{formatQty(i.stockQty)} {i.item.unit.code}</TD>
                  <TD className="tabular text-right">{formatINR(D(i.stockRate).toDecimalPlaces(4).toFixed(4), 4)}</TD>
                  <TD className="tabular text-right">{formatINR(i.taxableValue)}</TD>
                  <TD className="tabular text-right">{formatINR(i.taxAmount)} <span className="text-[10px] text-muted-foreground">@{D(i.gstRate).toFixed(0)}%</span></TD>
                  <TD className="tabular text-right">{formatQty(i.returnedQty)}</TD>
                  {canReturn && <TD className="text-right">{D(i.stockQty).gt(D(i.returnedQty)) && <ReturnButton purchaseId={p.id} purchaseItemId={i.id} itemName={i.item.name} max={D(i.stockQty).minus(D(i.returnedQty)).toFixed()} unit={i.item.unit.code} />}</TD>}
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="mt-3 text-right text-sm">Total <span className="tabular font-semibold">{formatINR(p.grandTotal)}</span></div>
        </CardContent>
      </Card>
      <SectionCard title="Stock ledger entries" description="Posted by this purchase (append-only)" className="mt-4">
        <Table>
          <THead><TR><TH>When</TH><TH>Item</TH><TH>Movement</TH><TH className="text-right">Qty</TH><TH className="text-right">Before → after</TH><TH className="text-right">Value</TH></TR></THead>
          <TBody>
            {ledger.map((l) => (
              <TR key={l.id}>
                <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                <TD>{l.item.name}</TD>
                <TD className="text-xs">{l.movementType.replace(/_/g, " ").toLowerCase()} · {l.sourceRef}</TD>
                <TD className="tabular text-right">{formatQty(l.quantity)} {l.item.unit.code}</TD>
                <TD className="tabular text-right">{formatQty(l.balanceBefore)} → {formatQty(l.balanceAfter)}</TD>
                <TD className="tabular text-right">{formatINR(l.value)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </SectionCard>
    </>
  );
}
