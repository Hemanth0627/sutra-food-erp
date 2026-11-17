import { D, Dec, min, sum } from "@/lib/decimal";
import type { PaymentInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { withTransaction } from "../db";
import { badRequest, notFound } from "../errors";
import { nextDocumentNumber } from "../sequence";
import { parseDateInput } from "./common";

/**
 * Customer receipts. A payment can be allocated to one or more open invoices (manually or oldest
 * first). An allocation can never exceed the invoice's remaining balance; any unallocated part stays
 * as an on-account credit that still reduces the customer's outstanding balance.
 */
export async function recordPayment(actor: Actor, input: PaymentInput) {
  return withTransaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw notFound("Customer");
    const amount = D(input.amount);

    // Lock this customer's open invoices so concurrent receipts cannot over-allocate.
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "customerId" = ${customer.id} AND "status" = 'ISSUED' ORDER BY "id" FOR UPDATE`;
    const invoices = await tx.invoice.findMany({
      where: { customerId: customer.id, status: "ISSUED" },
      include: { allocations: true },
      orderBy: [{ invoiceDate: "asc" }, { sequence: "asc" }],
    });
    const balanceOf = (inv: (typeof invoices)[number]) => D(inv.grandTotal).minus(sum(inv.allocations.map((a) => a.amount)));

    let allocations: { invoiceId: string; amount: Dec }[] = [];
    if (input.allocations.length) {
      const seen = new Set<string>();
      for (const a of input.allocations) {
        if (seen.has(a.invoiceId)) throw badRequest("Allocate to each invoice only once per payment");
        seen.add(a.invoiceId);
        const inv = invoices.find((i) => i.id === a.invoiceId);
        if (!inv) throw badRequest("Allocation must be to an open invoice of this customer");
        const balance = balanceOf(inv);
        if (D(a.amount).gt(balance)) throw badRequest(`Allocation of ₹${D(a.amount).toFixed(2)} exceeds the balance of ${inv.invoiceNo} (₹${balance.toFixed(2)})`);
        allocations.push({ invoiceId: inv.id, amount: D(a.amount) });
      }
      if (sum(allocations.map((a) => a.amount)).gt(amount)) throw badRequest("Allocations exceed the payment amount");
    } else if (input.autoAllocate) {
      let left = amount;
      for (const inv of invoices) {
        if (left.lte(0)) break;
        const balance = balanceOf(inv);
        if (balance.lte(0)) continue;
        const take = min(left, balance);
        allocations.push({ invoiceId: inv.id, amount: take });
        left = left.minus(take);
      }
    }
    allocations = allocations.filter((a) => a.amount.gt(0));

    const paymentDate = parseDateInput(input.paymentDate, new Date());
    const { number } = await nextDocumentNumber(tx, "RCPT", paymentDate);
    const payment = await tx.payment.create({
      data: {
        receiptNo: number,
        customerId: customer.id,
        paymentDate,
        amount: amount.toFixed(2),
        mode: input.mode,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
        allocations: { create: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount.toFixed(2) })) },
      },
    });
    const allocated = sum(allocations.map((a) => a.amount));
    await audit(tx, actor, "payment.create", "Payment", payment.id, `Received ₹${payment.amount} from ${customer.name} (${number}, ${input.mode}); allocated ₹${allocated.toFixed(2)}${amount.gt(allocated) ? `, on account ₹${amount.minus(allocated).toFixed(2)}` : ""}`, {
      allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount.toFixed(2) })),
    });
    return payment;
  });
}
