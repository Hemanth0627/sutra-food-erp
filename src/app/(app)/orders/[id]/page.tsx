import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { D, formatINR, formatQty, sum } from "@/lib/decimal";
import { formatDate, formatDateTime } from "@/lib/dates";
import { computeInvoice } from "@/lib/gst";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { orderAvailability } from "@/server/services/availability";
import { customerBalances } from "@/server/queries/receivables";
import { Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityList, SectionCard } from "@/components/app/widgets";
import { OrderActions } from "./order-actions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["orders:view-all", "orders:view-own"]);
  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      salesman: true,
      approvedBy: true,
      items: { include: { product: { include: { item: { include: { unit: true } } } } } },
      invoices: { include: { dispatch: true }, orderBy: { sequence: "asc" } },
    },
  });
  if (!order) notFound();
  if (!hasPermission(user.role, "orders:view-all") && order.salesmanId !== user.id) notFound();

  const canApprove = hasPermission(user.role, "orders:approve");
  const canInvoice = hasPermission(user.role, "invoices:create");
  const open = ["PENDING", "APPROVED", "PARTIALLY_FULFILLED"].includes(order.status);
  const availability = canApprove ? await orderAvailability(prisma, order.id) : [];
  const shortages = availability.filter((a) => D(a.shortage).gt(0));
  const settings = await prisma.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  const remainingLines = order.items.map((i) => ({ i, remaining: D(i.quantity).minus(D(i.invoicedQty)) })).filter((x) => x.remaining.gt(0));
  const preview = computeInvoice(remainingLines.map((x) => ({ quantity: x.remaining, rate: x.i.rate, gstRate: x.i.product.gstRate })), settings.stateCode, order.customer.stateCode);
  const balance = canApprove ? (await customerBalances(order.customerId)).get(order.customerId) : undefined;
  const exposure = D(balance?.outstanding ?? 0).plus(preview.totals.grandTotal);
  const overLimit = D(order.customer.creditLimit).gt(0) && exposure.gt(D(order.customer.creditLimit));
  const activity = await prisma.auditLog.findMany({ where: { entityId: { in: [order.id, ...order.invoices.map((i) => i.id), ...order.invoices.flatMap((i) => (i.dispatch ? [i.dispatch.id] : []))] } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageHeader
        title={order.orderNo}
        description={<span>{order.customer.name} · {order.customer.placeOfSupply} · placed by {order.salesman.name} on {formatDateTime(order.orderDate)}{order.capturedOffline ? " (captured offline)" : ""}</span>}
        actions={
          <>
            <StatusBadge status={order.status} />
            <OrderActions
              orderId={order.id}
              status={order.status}
              canApprove={canApprove}
              canInvoice={canInvoice && ["APPROVED", "PARTIALLY_FULFILLED"].includes(order.status)}
              canCancelOwn={user.role === "SALESMAN" && order.status === "PENDING" && order.salesmanId === user.id}
              canAmend={canApprove && ["PENDING", "APPROVED"].includes(order.status) && order.invoices.length === 0}
              editable={order.items.map((i) => ({ orderItemId: i.id, productName: i.product.item.name, quantity: D(i.quantity).toFixed(), rate: D(i.rate).toFixed(2) }))}
              lines={availability.map((a) => ({ orderItemId: a.orderItemId, productName: a.productName, remaining: a.remaining, available: a.available, canInvoiceNow: a.canInvoiceNow }))}
            />
          </>
        }
      />

      {canApprove && open && (
        <div className="mb-4">
          {shortages.length ? (
            <Alert tone="danger">
              <AlertTriangle />
              <div>
                <div className="font-medium">Insufficient finished-goods stock</div>
                {shortages.map((s) => (
                  <div key={s.orderItemId}>{s.productName}: {s.remaining} to fulfil, {s.available} available → <strong>shortage {s.shortage} packets</strong>. The shortfall cannot be invoiced or dispatched until it is produced.</div>
                ))}
              </div>
            </Alert>
          ) : remainingLines.length ? (
            <Alert tone="success"><CheckCircle2 /><div>Stock is available for the full remaining quantity.</div></Alert>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Order lines</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">Ordered</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Invoiced</TH>
                  {canApprove && <TH className="text-right">Available</TH>}
                  {canApprove && <TH className="text-right">Shortage</TH>}
                </TR>
              </THead>
              <TBody>
                {order.items.map((i) => {
                  const a = availability.find((x) => x.orderItemId === i.id);
                  return (
                    <TR key={i.id}>
                      <TD><div className="font-medium">{i.product.item.name}</div><div className="text-[11px] text-muted-foreground">HSN {i.product.hsnCode} · GST {D(i.product.gstRate).toFixed(0)}%</div></TD>
                      <TD className="tabular text-right">{formatQty(i.quantity)}</TD>
                      <TD className="tabular text-right">{formatINR(i.rate)}</TD>
                      <TD className="tabular text-right">{formatINR(i.lineAmount)}</TD>
                      <TD className="tabular text-right">{formatQty(i.invoicedQty)}</TD>
                      {canApprove && <TD className="tabular text-right">{a ? formatQty(a.available) : "—"}</TD>}
                      {canApprove && <TD className={`tabular text-right ${a && D(a.shortage).gt(0) ? "font-semibold text-destructive" : ""}`}>{a ? formatQty(a.shortage) : "—"}</TD>}
                    </TR>
                  );
                })}
              </TBody>
              <TFoot>
                <TR><TD colSpan={3}>Subtotal before tax</TD><TD className="tabular text-right">{formatINR(sum(order.items.map((i) => i.lineAmount)))}</TD><TD colSpan={canApprove ? 3 : 1} /></TR>
              </TFoot>
            </Table>
            {order.notes && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm"><span className="text-muted-foreground">Notes: </span>{order.notes}</p>}
            {order.rejectedReason && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive">Reason: {order.rejectedReason}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {remainingLines.length > 0 && open && (
            <SectionCard title="GST preview for the remaining quantity" description={preview.supplyType === "INTRA_STATE" ? "Intra-state (Tamil Nadu): CGST + SGST" : `Inter-state (${order.customer.state}): IGST`}>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Taxable value</dt><dd className="tabular">{formatINR(preview.totals.taxableTotal)}</dd></div>
                {preview.supplyType === "INTRA_STATE" ? (
                  <>
                    <div className="flex justify-between"><dt className="text-muted-foreground">CGST</dt><dd className="tabular">{formatINR(preview.totals.cgstTotal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">SGST</dt><dd className="tabular">{formatINR(preview.totals.sgstTotal)}</dd></div>
                  </>
                ) : (
                  <div className="flex justify-between"><dt className="text-muted-foreground">IGST @ {preview.lines[0]?.igstRate.toFixed(0)}%</dt><dd className="tabular">{formatINR(preview.totals.igstTotal)}</dd></div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-semibold"><dt>Total if invoiced in full</dt><dd className="tabular">{formatINR(preview.totals.grandTotal)}</dd></div>
              </dl>
              <p className="mt-2 text-[11px] text-muted-foreground">Preview only; an invoice can only include stock that is available.</p>
            </SectionCard>
          )}
          {canApprove && (
            <SectionCard title="Credit check">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Current outstanding</dt><dd className="tabular">{formatINR(balance?.outstanding ?? 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Credit limit</dt><dd className="tabular">{formatINR(order.customer.creditLimit)}</dd></div>
                <div className={`flex justify-between font-medium ${overLimit ? "text-destructive" : ""}`}><dt>Exposure after this order</dt><dd className="tabular">{formatINR(exposure)}</dd></div>
              </dl>
              {overLimit && <p className="mt-2 text-xs text-destructive">Exceeds the credit limit. Approval is allowed but should be justified.</p>}
            </SectionCard>
          )}
          <SectionCard title="Invoices & dispatch">
            {order.invoices.length ? (
              <ul className="space-y-2 text-sm">
                {order.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2">
                    <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">{inv.invoiceNo}</Link>
                    <span className="flex items-center gap-1">
                      <span className="tabular">{formatINR(inv.grandTotal)}</span>
                      <StatusBadge status={inv.status === "CANCELLED" ? "CANCELLED" : inv.dispatch ? "DISPATCHED" : "PENDING"} label={inv.status === "CANCELLED" ? "Cancelled" : inv.dispatch ? "Dispatched" : "To dispatch"} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Not invoiced yet.</p>}
            {order.approvedBy && <p className="mt-3 text-xs text-muted-foreground">Approved by {order.approvedBy.name} on {formatDate(order.approvedAt)}</p>}
          </SectionCard>
        </div>
      </div>
      <SectionCard title="History" className="mt-4">
        <ActivityList items={activity} />
      </SectionCard>
    </>
  );
}
