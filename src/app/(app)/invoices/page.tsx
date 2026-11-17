import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { D, formatINR, sum } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requirePageUser("invoices:view");
  const { q, status } = await searchParams;
  const where: Prisma.InvoiceWhereInput = {
    ...(status === "ISSUED" || status === "CANCELLED" ? { status } : {}),
    ...(q ? { OR: [{ invoiceNo: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const invoices = await prisma.invoice.findMany({ where, include: { allocations: true, dispatch: true }, orderBy: [{ invoiceDate: "desc" }, { sequence: "desc" }], take: 300 });
  return (
    <>
      <PageHeader title="GST invoices" description="Posted invoices are immutable; cancellation is done through a credit note. Invoices are raised from approved orders." />
      <ListToolbar placeholder="Invoice no. or customer" statuses={[{ value: "ISSUED", label: "Issued" }, { value: "CANCELLED", label: "Cancelled" }]} />
      <Card>
        {invoices.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Customer</TH>
                <TH className="hidden md:table-cell">Supply</TH>
                <TH className="text-right">Taxable</TH>
                <TH className="hidden text-right md:table-cell">GST</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Balance</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((i) => {
                const balance = i.status === "ISSUED" ? D(i.grandTotal).minus(sum(i.allocations.map((a) => a.amount))) : D(0);
                return (
                  <TR key={i.id}>
                    <TD><Link href={`/invoices/${i.id}`} className="font-medium hover:underline">{i.invoiceNo}</Link><div className="text-[11px] text-muted-foreground">{formatDate(i.invoiceDate)}</div></TD>
                    <TD>{i.customerName}</TD>
                    <TD className="hidden text-xs md:table-cell">{i.supplyType === "INTRA_STATE" ? "CGST+SGST" : "IGST"}</TD>
                    <TD className="tabular text-right">{formatINR(i.taxableTotal)}</TD>
                    <TD className="tabular hidden text-right md:table-cell">{formatINR(i.taxTotal)}</TD>
                    <TD className="tabular text-right font-medium">{formatINR(i.grandTotal)}</TD>
                    <TD className="tabular text-right">{formatINR(balance)}</TD>
                    <TD className="space-x-1">
                      {i.status === "CANCELLED" ? <StatusBadge status="CANCELLED" /> : balance.isZero() ? <StatusBadge status="PAID" /> : balance.lt(D(i.grandTotal)) ? <StatusBadge status="PARTIAL" label="Part paid" /> : <StatusBadge status="UNPAID" />}
                      {i.status === "ISSUED" && !i.dispatch && <StatusBadge status="PENDING" label="To dispatch" />}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="No invoices" description="Approve an order and create its GST invoice from the order page." />
        )}
      </Card>
    </>
  );
}
