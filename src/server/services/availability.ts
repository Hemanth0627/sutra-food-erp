import { D, Dec, max } from "@/lib/decimal";
import { prisma, type Tx } from "../db";

/**
 * Finished-goods availability for sales:
 *   available = on hand − quantity already invoiced but not yet dispatched (reserved).
 * Approved orders without an invoice do not reserve stock; the invoice is the commitment.
 */
export async function finishedGoodsAvailability(db: Tx | typeof prisma, productIds: string[]) {
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    include: { item: { include: { balance: true } } },
  });
  const reserved = await db.invoiceItem.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, invoice: { status: "ISSUED", dispatch: { is: null } } },
    _sum: { quantity: true },
  });
  const map = new Map<string, { onHand: Dec; reserved: Dec; available: Dec }>();
  for (const p of products) {
    const onHand = D(p.item.balance?.quantity ?? 0);
    const res = D(reserved.find((r) => r.productId === p.id)?._sum.quantity ?? 0);
    map.set(p.id, { onHand, reserved: res, available: max(0, onHand.minus(res)) });
  }
  return map;
}

export interface OrderLineAvailability {
  orderItemId: string;
  productId: string;
  productName: string;
  ordered: string;
  invoiced: string;
  remaining: string;
  onHand: string;
  reserved: string;
  available: string;
  shortage: string;
  canInvoiceNow: string;
}

export async function orderAvailability(db: Tx | typeof prisma, orderId: string): Promise<OrderLineAvailability[]> {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { include: { item: true } } } } },
  });
  if (!order) return [];
  const avail = await finishedGoodsAvailability(db, order.items.map((i) => i.productId));
  return order.items.map((i) => {
    const a = avail.get(i.productId)!;
    const remaining = D(i.quantity).minus(D(i.invoicedQty));
    const shortage = max(0, remaining.minus(a.available));
    const canInvoiceNow = Dec.min(remaining, a.available);
    return {
      orderItemId: i.id,
      productId: i.productId,
      productName: i.product.item.name,
      ordered: D(i.quantity).toFixed(),
      invoiced: D(i.invoicedQty).toFixed(),
      remaining: remaining.toFixed(),
      onHand: a.onHand.toFixed(),
      reserved: a.reserved.toFixed(),
      available: a.available.toFixed(),
      shortage: shortage.toFixed(),
      canInvoiceNow: max(0, canInvoiceNow).toFixed(),
    };
  });
}
