import { D, round2, sum } from "@/lib/decimal";
import type { PurchaseOrderInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { withTransaction, type Tx } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { nextDocumentNumber } from "../sequence";
import { parseDateInput } from "./common";

/**
 * Purchase orders. A PO is a commitment to a supplier; it never touches stock. Stock moves only when a
 * goods receipt (purchase) is posted against the PO, which advances each line's receivedQty and the
 * PO status (OPEN → PARTIALLY_RECEIVED → RECEIVED). A CHECK constraint stops receivedQty > quantity.
 */
export async function createPurchaseOrder(actor: Actor, input: PurchaseOrderInput) {
  return withTransaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || !supplier.isActive) throw notFound("Supplier");
    const itemIds = input.items.map((l) => l.itemId);
    if (new Set(itemIds).size !== itemIds.length) throw badRequest("Each material can appear only once per purchase order");
    const items = await tx.item.findMany({ where: { id: { in: itemIds } }, include: { unit: true } });
    const units = await tx.unit.findMany({ where: { id: { in: input.items.map((l) => l.unitId) } } });
    const lines = input.items.map((line, index) => {
      const item = items.find((i) => i.id === line.itemId);
      if (!item || !item.isActive) throw notFound(`Item on line ${index + 1}`);
      if (item.kind === "FINISHED_GOOD") throw badRequest(`${item.name} is a finished good and cannot be purchased`);
      const unit = units.find((u) => u.id === line.unitId);
      if (!unit) throw notFound(`Unit on line ${index + 1}`);
      if (unit.dimension !== item.unit.dimension) throw badRequest(`${item.name} is measured in ${item.unit.code}; ${unit.code} cannot be converted`);
      const taxableValue = round2(D(line.quantity).times(D(line.rate)));
      const taxAmount = round2(taxableValue.times(D(line.gstRate)).div(100));
      return { line, item, unit, taxableValue, taxAmount };
    });
    const orderDate = parseDateInput(input.orderDate, new Date());
    const { number } = await nextDocumentNumber(tx, "PO", orderDate);
    const po = await tx.purchaseOrder.create({
      data: {
        poNo: number,
        supplierId: supplier.id,
        orderDate,
        expectedDate: input.expectedDate ? parseDateInput(input.expectedDate, orderDate) : null,
        taxableTotal: sum(lines.map((l) => l.taxableValue)).toFixed(2),
        taxTotal: sum(lines.map((l) => l.taxAmount)).toFixed(2),
        grandTotal: sum(lines.map((l) => l.taxableValue.plus(l.taxAmount))).toFixed(2),
        notes: input.notes ?? null,
        createdById: actor.id,
        items: {
          create: lines.map((l) => ({
            itemId: l.item.id,
            unitId: l.unit.id,
            quantity: D(l.line.quantity).toFixed(),
            rate: D(l.line.rate).toFixed(),
            gstRate: D(l.line.gstRate).toFixed(),
            taxableValue: l.taxableValue.toFixed(2),
          })),
        },
      },
    });
    await audit(tx, actor, "purchase_order.create", "PurchaseOrder", po.id, `Raised ${po.poNo} to ${supplier.name}: ₹${po.grandTotal}`, {
      lines: lines.map((l) => ({ item: l.item.code, qty: D(l.line.quantity).toFixed(), unit: l.unit.code, rate: D(l.line.rate).toFixed() })),
    });
    return po;
  });
}

export async function cancelPurchaseOrder(actor: Actor, poId: string, reason: string) {
  return withTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${poId} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { supplier: true } });
    if (!po) throw notFound("Purchase order");
    if (po.status !== "OPEN" && po.status !== "PARTIALLY_RECEIVED") throw conflict(`${po.poNo} is ${po.status.toLowerCase().replace(/_/g, " ")} and cannot be cancelled`);
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED", cancelledReason: reason } });
    await audit(tx, actor, "purchase_order.cancel", "PurchaseOrder", poId, `Cancelled ${po.poNo} (${po.supplier.name})${po.status === "PARTIALLY_RECEIVED" ? "; balance not to be received" : ""}: ${reason}`);
    return { status: "CANCELLED" };
  });
}

/**
 * Called inside the goods-receipt transaction: validates the receipt lines against the locked PO and
 * advances receivedQty / status. Quantities are compared in the PO line's unit.
 */
export async function receiveAgainstPurchaseOrder(
  tx: Tx,
  poId: string,
  supplierId: string,
  lines: { purchaseOrderItemId?: string; itemId: string; unitId: string; quantity: string }[],
) {
  await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${poId} FOR UPDATE`;
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { items: { include: { item: true, unit: true } } } });
  if (!po) throw notFound("Purchase order");
  if (po.supplierId !== supplierId) throw badRequest(`${po.poNo} was raised to a different supplier`);
  if (po.status !== "OPEN" && po.status !== "PARTIALLY_RECEIVED") throw conflict(`${po.poNo} is ${po.status.toLowerCase().replace(/_/g, " ")}; goods can no longer be received against it`);
  const touched = new Set<string>();
  for (const [i, l] of lines.entries()) {
    const poLine = po.items.find((x) => x.id === l.purchaseOrderItemId) ?? po.items.find((x) => x.itemId === l.itemId);
    if (!poLine) throw badRequest(`Line ${i + 1} is not on ${po.poNo}`);
    if (touched.has(poLine.id)) throw badRequest(`${poLine.item.name} appears twice in this receipt`);
    touched.add(poLine.id);
    if (l.unitId !== poLine.unitId) throw badRequest(`Receive ${poLine.item.name} in ${poLine.unit.code}, the unit it was ordered in`);
    const balance = D(poLine.quantity).minus(D(poLine.receivedQty));
    if (D(l.quantity).gt(balance)) {
      throw conflict(`${poLine.item.name}: receiving ${D(l.quantity).toFixed()} ${poLine.unit.code} exceeds the ${po.poNo} balance of ${balance.toFixed()} ${poLine.unit.code}`);
    }
    await tx.purchaseOrderItem.update({ where: { id: poLine.id }, data: { receivedQty: D(poLine.receivedQty).plus(D(l.quantity)).toFixed() } });
    l.purchaseOrderItemId = poLine.id;
  }
  const after = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: poId } });
  const complete = after.every((x) => D(x.receivedQty).gte(D(x.quantity)));
  await tx.purchaseOrder.update({ where: { id: poId }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
  return { poNo: po.poNo, status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" };
}
