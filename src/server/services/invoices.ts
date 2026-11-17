import { D, Dec, round3 } from "@/lib/decimal";
import { addDays } from "@/lib/dates";
import { computeInvoiceTotals, computeTaxLine, supplyTypeFor } from "@/lib/gst";
import { placeOfSupplyLabel } from "@/lib/gstin";
import { audit, type Actor } from "../audit";
import { withTransaction, type Tx } from "../db";
import { AppError, badRequest, conflict, notFound } from "../errors";
import { lockBalances, postMovement } from "../inventory";
import { nextDocumentNumber } from "../sequence";
import { finishedGoodsAvailability } from "./availability";
import { getCompanySettings, parseDateInput, sellerAddress } from "./common";

/**
 * GST tax invoice from an approved order. Invoices may cover part of an order (partial fulfilment);
 * each invoice can only include stock that is actually available, so an order can never be invoiced
 * for goods the factory does not have.
 */
export async function createInvoice(
  actor: Actor,
  input: { orderId: string; invoiceDate?: string; notes?: string; lines: { orderItemId: string; quantity: string }[] },
) {
  return withTransaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${input.orderId} FOR UPDATE`;
    const order = await tx.salesOrder.findUnique({
      where: { id: input.orderId },
      include: { customer: true, items: { include: { product: { include: { item: { include: { unit: true } } } } } } },
    });
    if (!order) throw notFound("Order");
    if (!["APPROVED", "PARTIALLY_FULFILLED"].includes(order.status)) {
      throw conflict(`Order ${order.orderNo} is ${order.status.toLowerCase().replace("_", " ")}; only approved orders can be invoiced`);
    }

    const requested = input.lines.filter((l) => D(l.quantity).gt(0));
    if (!requested.length) throw badRequest("Enter a quantity to invoice");
    const lines = requested.map((l) => {
      const oi = order.items.find((i) => i.id === l.orderItemId);
      if (!oi) throw badRequest("Invoice line does not belong to this order");
      const qty = round3(l.quantity);
      const remaining = D(oi.quantity).minus(D(oi.invoicedQty));
      if (qty.gt(remaining)) throw badRequest(`${oi.product.item.name}: only ${remaining.toFixed()} remain to be invoiced on this order`);
      return { oi, qty };
    });

    // Stock check against finished goods not already committed to other undispatched invoices.
    await lockBalances(tx, lines.map((l) => l.oi.product.itemId));
    const avail = await finishedGoodsAvailability(tx, lines.map((l) => l.oi.productId));
    const shortages = lines
      .map((l) => ({ l, a: avail.get(l.oi.productId)! }))
      .filter(({ l, a }) => l.qty.gt(a.available))
      .map(({ l, a }) => ({
        itemId: l.oi.product.itemId,
        itemName: l.oi.product.item.name,
        unit: l.oi.product.item.unit.code,
        required: l.qty.toFixed(),
        available: a.available.toFixed(),
        shortage: l.qty.minus(a.available).toFixed(),
      }));
    if (shortages.length) {
      throw new AppError(
        422,
        "INSUFFICIENT_STOCK",
        "Insufficient finished-goods stock: " + shortages.map((s) => `${s.itemName} requested ${s.required}, available ${s.available} (short ${s.shortage})`).join("; "),
        { shortages },
      );
    }

    const settings = await getCompanySettings(tx);
    const supplyType = supplyTypeFor(settings.stateCode, order.customer.stateCode);
    const taxLines = lines.map((l) => ({
      l,
      tax: computeTaxLine({ quantity: l.qty, rate: l.oi.rate, gstRate: l.oi.product.gstRate }, supplyType),
    }));
    const totals = computeInvoiceTotals(taxLines.map((t) => t.tax));

    const invoiceDate = parseDateInput(input.invoiceDate, new Date());
    const seq = await nextDocumentNumber(tx, "INV", invoiceDate);
    const c = order.customer;
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo: seq.number,
        financialYear: seq.financialYear,
        sequence: seq.sequence,
        orderId: order.id,
        customerId: c.id,
        invoiceDate,
        dueDate: addDays(invoiceDate, c.paymentTermsDays),
        status: "ISSUED",
        supplyType,
        placeOfSupply: placeOfSupplyLabel(c.stateCode),
        placeOfSupplyCode: c.stateCode,
        customerName: c.name,
        customerGstin: c.gstin,
        customerAddress: `${c.addressLine}, ${c.city}, ${c.state}${c.pincode ? " " + c.pincode : ""}`,
        sellerName: settings.legalName,
        sellerGstin: settings.gstin,
        sellerAddress: sellerAddress(settings),
        sellerStateCode: settings.stateCode,
        taxableTotal: totals.taxableTotal.toFixed(2),
        cgstTotal: totals.cgstTotal.toFixed(2),
        sgstTotal: totals.sgstTotal.toFixed(2),
        igstTotal: totals.igstTotal.toFixed(2),
        taxTotal: totals.taxTotal.toFixed(2),
        roundOff: totals.roundOff.toFixed(2),
        grandTotal: totals.grandTotal.toFixed(2),
        notes: input.notes ?? null,
        createdById: actor.id,
        items: {
          create: taxLines.map(({ l, tax }) => ({
            productId: l.oi.productId,
            orderItemId: l.oi.id,
            description: l.oi.product.item.name.includes(l.oi.product.packSize) ? l.oi.product.item.name : `${l.oi.product.item.name} (${l.oi.product.packSize})`,
            hsnCode: l.oi.product.hsnCode,
            unit: l.oi.product.item.unit.code,
            quantity: tax.quantity.toFixed(),
            rate: tax.rate.toFixed(2),
            taxableValue: tax.taxableValue.toFixed(2),
            gstRate: tax.gstRate.toFixed(2),
            cgstRate: tax.cgstRate.toFixed(3),
            sgstRate: tax.sgstRate.toFixed(3),
            igstRate: tax.igstRate.toFixed(2),
            cgstAmount: tax.cgstAmount.toFixed(2),
            sgstAmount: tax.sgstAmount.toFixed(2),
            igstAmount: tax.igstAmount.toFixed(2),
            lineTotal: tax.lineTotal.toFixed(2),
          })),
        },
      },
    });

    for (const { oi, qty } of lines) {
      await tx.salesOrderItem.update({ where: { id: oi.id }, data: { invoicedQty: D(oi.invoicedQty).plus(qty).toFixed() } });
    }
    await refreshOrderStatus(tx, order.id);

    await audit(tx, actor, "invoice.create", "Invoice", invoice.id, `Issued ${invoice.invoiceNo} to ${c.name}: taxable ₹${invoice.taxableTotal}, ${supplyType === "INTRA_STATE" ? `CGST ₹${invoice.cgstTotal} + SGST ₹${invoice.sgstTotal}` : `IGST ₹${invoice.igstTotal}`}, total ₹${invoice.grandTotal}`);
    return invoice;
  });
}

async function refreshOrderStatus(tx: Tx, orderId: string) {
  const items = await tx.salesOrderItem.findMany({ where: { orderId } });
  const invoiced = items.reduce((acc, i) => acc.plus(D(i.invoicedQty)), new Dec(0));
  const fully = items.every((i) => D(i.invoicedQty).gte(D(i.quantity)));
  const status = fully ? "FULFILLED" : invoiced.gt(0) ? "PARTIALLY_FULFILLED" : "APPROVED";
  await tx.salesOrder.update({ where: { id: orderId }, data: { status } });
}

/**
 * Cancels an invoice through a credit note (the invoice row itself is never deleted or edited; the
 * database trigger enforces this). Dispatched goods can be taken back into stock (CUSTOMER_RETURN).
 */
export async function cancelInvoice(actor: Actor, invoiceId: string, input: { reason: string; returnStock: boolean }) {
  return withTransaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, allocations: true, dispatch: { include: { items: true } }, customer: true },
    });
    if (!invoice) throw notFound("Invoice");
    if (invoice.status !== "ISSUED") throw conflict(`Invoice ${invoice.invoiceNo} is already cancelled`);
    if (invoice.allocations.length) throw conflict("Payments are allocated to this invoice. Record a credit note only after the payment allocation is reversed (not supported in this prototype).");

    const noteDate = new Date();
    const { number } = await nextDocumentNumber(tx, "CN", noteDate);
    const cn = await tx.creditNote.create({
      data: {
        creditNoteNo: number,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        noteDate,
        reason: input.reason,
        taxableTotal: invoice.taxableTotal,
        cgstTotal: invoice.cgstTotal,
        sgstTotal: invoice.sgstTotal,
        igstTotal: invoice.igstTotal,
        grandTotal: invoice.grandTotal,
        stockReturned: Boolean(invoice.dispatch && input.returnStock),
        createdById: actor.id,
      },
    });

    if (invoice.dispatch && input.returnStock) {
      for (const di of invoice.dispatch.items) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: di.productId } });
        await postMovement(tx, {
          itemId: product.itemId,
          movementType: "CUSTOMER_RETURN",
          quantity: D(di.quantity),
          unitCost: D(di.unitCost),
          sourceType: "CREDIT_NOTE",
          sourceId: cn.id,
          sourceLineId: di.id,
          sourceRef: number,
          txnDate: noteDate,
          userId: actor.id,
          notes: `Return against ${invoice.invoiceNo}`,
        });
      }
    }

    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", cancelledAt: noteDate } });
    for (const it of invoice.items) {
      if (!it.orderItemId) continue;
      const oi = await tx.salesOrderItem.findUniqueOrThrow({ where: { id: it.orderItemId } });
      await tx.salesOrderItem.update({ where: { id: oi.id }, data: { invoicedQty: D(oi.invoicedQty).minus(D(it.quantity)).toFixed() } });
    }
    if (invoice.orderId) await refreshOrderStatus(tx, invoice.orderId);

    await audit(tx, actor, "invoice.cancel", "Invoice", invoice.id, `Cancelled ${invoice.invoiceNo} with credit note ${number} (₹${invoice.grandTotal})${cn.stockReturned ? "; goods returned to stock" : ""}: ${input.reason}`);
    return cn;
  });
}
