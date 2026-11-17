import { D, round2 } from "@/lib/decimal";
import { audit, type Actor } from "../audit";
import { withTransaction } from "../db";
import { conflict, notFound } from "../errors";
import { postMovement } from "../inventory";
import { nextDocumentNumber } from "../sequence";
import { parseDateInput } from "./common";

/**
 * Dispatches the goods on an invoice and reduces finished-goods stock (SALES_DISPATCH).
 * Exactly-once: the invoice row is locked, Dispatch.invoiceId is unique and every ledger line is
 * keyed by (DISPATCH, dispatchId, invoiceItemId), so a retry or double click cannot deduct twice.
 */
export async function dispatchInvoice(
  actor: Actor,
  input: { invoiceId: string; dispatchDate?: string; vehicleNo?: string; transporter?: string; notes?: string },
) {
  return withTransaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { dispatch: true, items: { include: { product: true } } },
    });
    if (!invoice) throw notFound("Invoice");
    if (invoice.status !== "ISSUED") throw conflict(`Invoice ${invoice.invoiceNo} is cancelled and cannot be dispatched`);
    if (invoice.dispatch) throw conflict(`Invoice ${invoice.invoiceNo} was already dispatched as ${invoice.dispatch.dispatchNo}`);

    const dispatchDate = parseDateInput(input.dispatchDate, new Date());
    const { number } = await nextDocumentNumber(tx, "DSP", dispatchDate);
    const dispatch = await tx.dispatch.create({
      data: {
        dispatchNo: number,
        invoiceId: invoice.id,
        orderId: invoice.orderId,
        customerId: invoice.customerId,
        dispatchDate,
        vehicleNo: input.vehicleNo ?? null,
        transporter: input.transporter ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
      },
    });

    for (const line of invoice.items) {
      const mv = await postMovement(tx, {
        itemId: line.product.itemId,
        movementType: "SALES_DISPATCH",
        quantity: D(line.quantity).negated(),
        sourceType: "DISPATCH",
        sourceId: dispatch.id,
        sourceLineId: line.id,
        sourceRef: number,
        txnDate: dispatchDate,
        userId: actor.id,
        notes: `${invoice.invoiceNo} to ${invoice.customerName}`,
      });
      await tx.dispatchItem.create({
        data: {
          dispatchId: dispatch.id,
          productId: line.productId,
          quantity: D(line.quantity).toFixed(),
          unitCost: mv.unitCost.toFixed(),
          costValue: round2(mv.valueChange.abs()).toFixed(2),
        },
      });
    }

    await audit(tx, actor, "dispatch.create", "Dispatch", dispatch.id, `Dispatched ${invoice.invoiceNo} as ${number} to ${invoice.customerName}`, {
      lines: invoice.items.map((i) => ({ product: i.description, qty: i.quantity.toString() })),
    });
    return dispatch;
  });
}
