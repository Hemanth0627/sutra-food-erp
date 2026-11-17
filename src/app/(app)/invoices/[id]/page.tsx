import Link from "next/link";
import { notFound } from "next/navigation";
import { D, formatINR, formatQty, sum } from "@/lib/decimal";
import { formatDate, formatDateTime } from "@/lib/dates";
import { amountInWords } from "@/lib/gst";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityList, SectionCard } from "@/components/app/widgets";
import { InvoiceActions } from "./invoice-actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("invoices:view");
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { items: true, order: true, dispatch: { include: { items: true, createdBy: true } }, allocations: { include: { payment: true } }, creditNote: true, createdBy: true },
  });
  if (!inv) notFound();
  const paid = sum(inv.allocations.map((a) => a.amount));
  const balance = inv.status === "ISSUED" ? D(inv.grandTotal).minus(paid) : D(0);
  const intra = inv.supplyType === "INTRA_STATE";
  const activity = await prisma.auditLog.findMany({ where: { entityId: { in: [inv.id, ...(inv.dispatch ? [inv.dispatch.id] : [])] } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageHeader
        title={inv.invoiceNo}
        description={<span>Tax invoice to {inv.customerName} · {formatDate(inv.invoiceDate)} · due {formatDate(inv.dueDate)}</span>}
        actions={
          <>
            <StatusBadge status={inv.status} />
            <InvoiceActions
              invoiceId={inv.id}
              invoiceNo={inv.invoiceNo}
              canDispatch={hasPermission(user.role, "dispatch:create") && inv.status === "ISSUED" && !inv.dispatch}
              canCancel={hasPermission(user.role, "invoices:cancel") && inv.status === "ISSUED" && inv.allocations.length === 0}
              dispatched={!!inv.dispatch}
            />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Seller</div>
                <div className="mt-1 text-sm font-medium">{inv.sellerName}</div>
                <div className="text-xs text-muted-foreground">{inv.sellerAddress}</div>
                <div className="text-xs">GSTIN {inv.sellerGstin} · State {inv.sellerStateCode}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bill to</div>
                <div className="mt-1 text-sm font-medium">{inv.customerName}</div>
                <div className="text-xs text-muted-foreground">{inv.customerAddress}</div>
                <div className="text-xs">GSTIN {inv.customerGstin ?? "Unregistered"} · Place of supply {inv.placeOfSupply}</div>
              </div>
            </div>
            <Table className="mt-5">
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH>HSN</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Taxable</TH>
                  {intra ? <><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH></> : <TH className="text-right">IGST</TH>}
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {inv.items.map((it) => (
                  <TR key={it.id}>
                    <TD className="font-medium">{it.description}</TD>
                    <TD>{it.hsnCode}</TD>
                    <TD className="tabular text-right">{formatQty(it.quantity)} {it.unit}</TD>
                    <TD className="tabular text-right">{formatINR(it.rate)}</TD>
                    <TD className="tabular text-right">{formatINR(it.taxableValue)}</TD>
                    {intra ? (
                      <>
                        <TD className="tabular text-right">{formatINR(it.cgstAmount)}<div className="text-[10px] text-muted-foreground">@{D(it.cgstRate).toFixed(2)}%</div></TD>
                        <TD className="tabular text-right">{formatINR(it.sgstAmount)}<div className="text-[10px] text-muted-foreground">@{D(it.sgstRate).toFixed(2)}%</div></TD>
                      </>
                    ) : (
                      <TD className="tabular text-right">{formatINR(it.igstAmount)}<div className="text-[10px] text-muted-foreground">@{D(it.igstRate).toFixed(2)}%</div></TD>
                    )}
                    <TD className="tabular text-right">{formatINR(it.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
              <p className="max-w-xs text-xs text-muted-foreground"><span className="font-medium text-foreground">In words:</span> {amountInWords(inv.grandTotal)}</p>
              <dl className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Taxable value</dt><dd className="tabular">{formatINR(inv.taxableTotal)}</dd></div>
                {intra ? (
                  <>
                    <div className="flex justify-between"><dt className="text-muted-foreground">CGST</dt><dd className="tabular">{formatINR(inv.cgstTotal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">SGST</dt><dd className="tabular">{formatINR(inv.sgstTotal)}</dd></div>
                  </>
                ) : (
                  <div className="flex justify-between"><dt className="text-muted-foreground">IGST</dt><dd className="tabular">{formatINR(inv.igstTotal)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-muted-foreground">Round off</dt><dd className="tabular">{formatINR(inv.roundOff)}</dd></div>
                <div className="flex justify-between border-t pt-1.5 text-base font-semibold"><dt>Grand total</dt><dd className="tabular">{formatINR(inv.grandTotal)}</dd></div>
              </dl>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <SectionCard title="Receivable">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Invoice total</dt><dd className="tabular">{formatINR(inv.grandTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Received</dt><dd className="tabular">{formatINR(paid)}</dd></div>
              <div className="flex justify-between border-t pt-1.5 font-semibold"><dt>Balance</dt><dd className="tabular">{formatINR(balance)}</dd></div>
            </dl>
            {inv.allocations.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {inv.allocations.map((a) => <li key={a.id}>{a.payment.receiptNo} · {formatDate(a.payment.paymentDate)} · {formatINR(a.amount)} ({a.payment.mode.replace("_", " ").toLowerCase()})</li>)}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Dispatch">
            {inv.dispatch ? (
              <div className="text-sm">
                <div className="font-medium">{inv.dispatch.dispatchNo}</div>
                <div className="text-xs text-muted-foreground">{formatDateTime(inv.dispatch.dispatchDate)} · {inv.dispatch.vehicleNo ?? "—"} · by {inv.dispatch.createdBy.name}</div>
                <div className="mt-2 text-xs">Finished goods released at stock cost {formatINR(sum(inv.dispatch.items.map((d) => d.costValue)))}</div>
              </div>
            ) : <p className="text-sm text-muted-foreground">{inv.status === "ISSUED" ? "Not dispatched yet. Stock is reserved for this invoice." : "Cancelled before dispatch."}</p>}
          </SectionCard>
          {inv.creditNote && (
            <SectionCard title="Credit note">
              <div className="text-sm font-medium">{inv.creditNote.creditNoteNo}</div>
              <div className="text-xs text-muted-foreground">{formatDate(inv.creditNote.noteDate)} · {formatINR(inv.creditNote.grandTotal)} · {inv.creditNote.stockReturned ? "goods returned to stock" : "no stock movement"}</div>
              <p className="mt-1 text-xs">{inv.creditNote.reason}</p>
            </SectionCard>
          )}
          <SectionCard title="References">
            <div className="space-y-1 text-sm">
              {inv.order && <div>Order <Link href={`/orders/${inv.order.id}`} className="font-medium hover:underline">{inv.order.orderNo}</Link></div>}
              <div className="text-xs text-muted-foreground">Issued by {inv.createdBy.name} · FY {inv.financialYear}</div>
            </div>
          </SectionCard>
        </div>
      </div>
      <SectionCard title="History" className="mt-4">
        <ActivityList items={activity} />
      </SectionCard>
    </>
  );
}
