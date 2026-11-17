import { D, Dec, sum } from "@/lib/decimal";
import { daysBetween } from "@/lib/dates";
import { prisma } from "../db";

export const AGEING_BUCKETS = ["Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function ageingBucket(daysPastDue: number): AgeingBucket {
  if (daysPastDue <= 0) return "Not due";
  if (daysPastDue <= 30) return "1–30 days";
  if (daysPastDue <= 60) return "31–60 days";
  if (daysPastDue <= 90) return "61–90 days";
  return "90+ days";
}

export interface OpenInvoice {
  id: string;
  invoiceNo: string;
  invoiceDate: Date;
  dueDate: Date;
  customerId: string;
  customerName: string;
  grandTotal: Dec;
  paid: Dec;
  balance: Dec;
  daysPastDue: number;
  bucket: AgeingBucket;
}

/** Issued invoices with their allocated receipts and remaining balance (as of `asOf`). */
export async function openInvoices(opts: { customerId?: string; asOf?: Date; includeSettled?: boolean } = {}): Promise<OpenInvoice[]> {
  const asOf = opts.asOf ?? new Date();
  const invoices = await prisma.invoice.findMany({
    where: { status: "ISSUED", ...(opts.customerId ? { customerId: opts.customerId } : {}), invoiceDate: { lt: asOf } },
    include: { allocations: { include: { payment: { select: { paymentDate: true } } } } },
    orderBy: [{ invoiceDate: "asc" }, { sequence: "asc" }],
  });
  return invoices
    .map((inv) => {
      const paid = sum(inv.allocations.filter((a) => a.payment.paymentDate < asOf).map((a) => a.amount));
      const balance = D(inv.grandTotal).minus(paid);
      const daysPastDue = daysBetween(inv.dueDate, asOf);
      return {
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        customerId: inv.customerId,
        customerName: inv.customerName,
        grandTotal: D(inv.grandTotal),
        paid,
        balance,
        daysPastDue,
        bucket: ageingBucket(daysPastDue),
      };
    })
    .filter((i) => opts.includeSettled || i.balance.gt(0));
}

export interface CustomerBalance {
  customerId: string;
  invoiced: Dec;
  received: Dec;
  allocated: Dec;
  onAccount: Dec;
  outstanding: Dec;
}

/** Outstanding = issued invoices − all receipts (unallocated receipts are on-account credit). */
export async function customerBalances(customerId?: string): Promise<Map<string, CustomerBalance>> {
  const where = customerId ? { customerId } : {};
  const [inv, pay, alloc] = await Promise.all([
    prisma.invoice.groupBy({ by: ["customerId"], where: { ...where, status: "ISSUED" }, _sum: { grandTotal: true } }),
    prisma.payment.groupBy({ by: ["customerId"], where, _sum: { amount: true } }),
    prisma.paymentAllocation.findMany({ where: customerId ? { payment: { customerId } } : {}, include: { payment: { select: { customerId: true } } } }),
  ]);
  const ids = new Set([...inv.map((i) => i.customerId), ...pay.map((p) => p.customerId)]);
  const map = new Map<string, CustomerBalance>();
  for (const id of ids) {
    const invoiced = D(inv.find((i) => i.customerId === id)?._sum.grandTotal ?? 0);
    const received = D(pay.find((p) => p.customerId === id)?._sum.amount ?? 0);
    const allocated = sum(alloc.filter((a) => a.payment.customerId === id).map((a) => a.amount));
    map.set(id, { customerId: id, invoiced, received, allocated, onAccount: received.minus(allocated), outstanding: invoiced.minus(received) });
  }
  return map;
}

export function emptyBalance(customerId: string): CustomerBalance {
  const z = new Dec(0);
  return { customerId, invoiced: z, received: z, allocated: z, onAccount: z, outstanding: z };
}
