import { D, round2, round3, sum } from "@/lib/decimal";
import { convertQuantity } from "@/lib/units";
import type { PurchaseInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { withTransaction } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { postMovement } from "../inventory";
import { nextDocumentNumber } from "../sequence";
import { parseDateInput } from "./common";
import { receiveAgainstPurchaseOrder } from "./purchase-orders";

/**
 * Posts a purchase invoice / goods receipt. Each line increases stock through a PURCHASE_RECEIPT
 * ledger entry valued at the line's taxable value (input GST is recoverable, so it is not inventoried).
 * The weighted-average cost of the item is updated by the ledger posting.
 */
export async function createPurchase(actor: Actor, input: PurchaseInput) {
  return withTransaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || !supplier.isActive) throw notFound("Supplier");
    const dup = await tx.purchase.findUnique({
      where: { supplierId_supplierInvoiceNo: { supplierId: supplier.id, supplierInvoiceNo: input.supplierInvoiceNo } },
    });
    if (dup) throw conflict(`Supplier invoice ${input.supplierInvoiceNo} is already recorded as ${dup.purchaseNo}`);

    const itemIds = input.items.map((l) => l.itemId);
    const items = await tx.item.findMany({ where: { id: { in: itemIds } }, include: { unit: true } });
    const units = await tx.unit.findMany({ where: { id: { in: input.items.map((l) => l.unitId) } } });

    const lines = input.items.map((line, index) => {
      const item = items.find((i) => i.id === line.itemId);
      if (!item) throw notFound(`Item on line ${index + 1}`);
      if (item.kind === "FINISHED_GOOD") throw badRequest(`${item.name} is a finished good and cannot be purchased`);
      const unit = units.find((u) => u.id === line.unitId);
      if (!unit) throw notFound(`Unit on line ${index + 1}`);
      const stockQty = round3(convertQuantity(line.quantity, unit, item.unit));
      if (stockQty.lte(0)) throw badRequest(`Quantity on line ${index + 1} is too small`);
      const taxableValue = round2(D(line.quantity).times(D(line.rate)));
      const taxAmount = round2(taxableValue.times(D(line.gstRate)).div(100));
      // Stock rate = taxable value / stock quantity, so inventory value equals the invoice value exactly.
      const stockRate = taxableValue.div(stockQty);
      return { line, item, unit, stockQty, stockRate, taxableValue, taxAmount, lineTotal: taxableValue.plus(taxAmount) };
    });

    // Receipt against a purchase order: validate against the locked PO and advance its received qty.
    const poResult = input.purchaseOrderId
      ? await receiveAgainstPurchaseOrder(tx, input.purchaseOrderId, supplier.id, input.items)
      : null;

    const invoiceDate = parseDateInput(input.invoiceDate, new Date());
    const receivedDate = parseDateInput(input.receivedDate, invoiceDate);
    const { number } = await nextDocumentNumber(tx, "PUR", receivedDate);

    const purchase = await tx.purchase.create({
      data: {
        purchaseNo: number,
        supplierId: supplier.id,
        supplierInvoiceNo: input.supplierInvoiceNo,
        purchaseOrderId: input.purchaseOrderId ?? null,
        invoiceDate,
        receivedDate,
        taxableTotal: sum(lines.map((l) => l.taxableValue)).toFixed(2),
        taxTotal: sum(lines.map((l) => l.taxAmount)).toFixed(2),
        grandTotal: sum(lines.map((l) => l.lineTotal)).toFixed(2),
        notes: input.notes ?? null,
        createdById: actor.id,
      },
    });

    for (const l of lines) {
      const pi = await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          itemId: l.item.id,
          quantity: D(l.line.quantity).toFixed(),
          unitId: l.unit.id,
          rate: D(l.line.rate).toFixed(),
          stockQty: l.stockQty.toFixed(),
          stockRate: l.stockRate.toDecimalPlaces(6).toFixed(),
          taxableValue: l.taxableValue.toFixed(2),
          gstRate: D(l.line.gstRate).toFixed(),
          taxAmount: l.taxAmount.toFixed(2),
          lineTotal: l.lineTotal.toFixed(2),
          batchNo: l.line.batchNo ?? null,
          expiryDate: l.line.expiryDate ? parseDateInput(l.line.expiryDate, receivedDate) : null,
          purchaseOrderItemId: l.line.purchaseOrderItemId ?? null,
        },
      });
      await postMovement(tx, {
        itemId: l.item.id,
        movementType: "PURCHASE_RECEIPT",
        quantity: l.stockQty,
        unitCost: l.stockRate,
        sourceType: "PURCHASE",
        sourceId: purchase.id,
        sourceLineId: pi.id,
        sourceRef: purchase.purchaseNo,
        txnDate: receivedDate,
        userId: actor.id,
        batchNo: l.line.batchNo ?? null,
        expiryDate: pi.expiryDate,
        notes: `${supplier.name} inv ${input.supplierInvoiceNo}`,
      });
    }

    await audit(tx, actor, "purchase.post", "Purchase", purchase.id, `Posted purchase ${purchase.purchaseNo} from ${supplier.name}: ₹${purchase.grandTotal}${poResult ? ` against ${poResult.poNo} (now ${poResult.status.toLowerCase().replace(/_/g, " ")})` : ""}`, {
      lines: lines.map((l) => ({ item: l.item.code, qty: l.stockQty.toFixed(), unit: l.item.unit.code, rate: l.stockRate.toDecimalPlaces(6).toFixed() })),
    });
    return purchase;
  });
}

/** Returns goods to the supplier (SUPPLIER_RETURN), valued at the current weighted-average cost. */
export async function returnToSupplier(actor: Actor, purchaseId: string, input: { purchaseItemId: string; quantity: string; reason: string }) {
  return withTransaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { supplier: true } });
    if (!purchase) throw notFound("Purchase");
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PurchaseItem" WHERE "id" = ${input.purchaseItemId} FOR UPDATE`;
    if (!rows.length) throw notFound("Purchase line");
    const line = await tx.purchaseItem.findUnique({ where: { id: input.purchaseItemId }, include: { item: { include: { unit: true } } } });
    if (!line || line.purchaseId !== purchaseId) throw notFound("Purchase line");
    const qty = round3(input.quantity);
    const returnable = D(line.stockQty).minus(D(line.returnedQty));
    if (qty.gt(returnable)) throw badRequest(`Only ${returnable.toFixed()} ${line.item.unit.code} can still be returned on this line`);

    const { number } = await nextDocumentNumber(tx, "PRET", new Date());
    const ret = await tx.purchaseReturn.create({
      data: { returnNo: number, purchaseId, purchaseItemId: line.id, quantity: qty.toFixed(), value: "0", reason: input.reason, createdById: actor.id },
    });
    const movement = await postMovement(tx, {
      itemId: line.itemId,
      movementType: "SUPPLIER_RETURN",
      quantity: qty.negated(),
      sourceType: "PURCHASE_RETURN",
      sourceId: ret.id,
      sourceLineId: line.id,
      sourceRef: number,
      txnDate: new Date(),
      userId: actor.id,
      notes: input.reason,
    });
    await tx.purchaseReturn.update({ where: { id: ret.id }, data: { value: round2(movement.valueChange.abs()).toFixed(2) } });
    await tx.purchaseItem.update({ where: { id: line.id }, data: { returnedQty: D(line.returnedQty).plus(qty).toFixed() } });
    await audit(tx, actor, "purchase.return", "Purchase", purchaseId, `Returned ${qty.toFixed()} ${line.item.unit.code} ${line.item.name} to ${purchase.supplier.name} (${number})`);
    return ret;
  });
}
