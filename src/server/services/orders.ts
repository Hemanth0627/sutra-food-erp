import { Prisma } from "@prisma/client";
import { D, round2, sum } from "@/lib/decimal";
import type { OrderAmendInput, OrderCreateInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { prisma, withTransaction } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { nextDocumentNumber } from "../sequence";
import { orderAvailability } from "./availability";

/**
 * Sales orders captured by salesmen (online or synced from the offline queue).
 * Idempotency: the client generates a UUID (clientRef) per order; a unique index on clientRef means
 * re-sending the same order (flaky network, offline sync retry) returns the existing order instead
 * of creating a duplicate.
 */
export async function createOrder(actor: Actor, input: OrderCreateInput) {
  const existing = await prisma.salesOrder.findUnique({ where: { clientRef: input.clientRef } });
  if (existing) {
    if (existing.salesmanId !== actor.id && actor.role === "SALESMAN") throw conflict("This order reference belongs to another user");
    return { order: existing, duplicate: true };
  }
  try {
    const order = await withTransaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer || !customer.isActive) throw notFound("Customer");
      const productIds = input.items.map((i) => i.productId);
      if (new Set(productIds).size !== productIds.length) throw badRequest("Each product can appear only once per order");
      const products = await tx.product.findMany({ where: { id: { in: productIds } }, include: { item: true } });
      const lines = input.items.map((line) => {
        const p = products.find((x) => x.id === line.productId);
        if (!p || !p.item.isActive) throw notFound("Product");
        const rate = D(p.sellingPrice);
        return { productId: p.id, quantity: D(line.quantity), rate, lineAmount: round2(D(line.quantity).times(rate)) };
      });
      const orderDate = input.orderDate ? new Date(input.orderDate) : new Date();
      const { number } = await nextDocumentNumber(tx, "SO", orderDate);
      const created = await tx.salesOrder.create({
        data: {
          orderNo: number,
          clientRef: input.clientRef,
          customerId: customer.id,
          salesmanId: actor.id,
          orderDate,
          status: "PENDING",
          notes: input.notes ?? null,
          subtotal: sum(lines.map((l) => l.lineAmount)).toFixed(2),
          capturedOffline: input.capturedOffline ?? false,
          items: {
            create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity.toFixed(), rate: l.rate.toFixed(2), lineAmount: l.lineAmount.toFixed(2) })),
          },
        },
      });
      await audit(tx, actor, "order.create", "SalesOrder", created.id, `${actor.name} placed ${number} for ${customer.name}: ₹${created.subtotal} before tax${input.capturedOffline ? " (synced from offline)" : ""}`);
      return created;
    });
    return { order, duplicate: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.salesOrder.findUnique({ where: { clientRef: input.clientRef } });
      if (again) return { order: again, duplicate: true };
    }
    throw e;
  }
}

export async function decideOrder(actor: Actor, orderId: string, decision: "APPROVE" | "REJECT" | "CANCEL", reason?: string) {
  return withTransaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { customer: true, invoices: true } });
    if (!order) throw notFound("Order");
    if (decision === "APPROVE") {
      const res = await tx.salesOrder.updateMany({
        where: { id: orderId, status: "PENDING" },
        data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() },
      });
      if (res.count !== 1) throw conflict(`Order ${order.orderNo} is ${order.status.toLowerCase()} and cannot be approved`);
      const availability = await orderAvailability(tx, orderId);
      const short = availability.filter((a) => D(a.shortage).gt(0));
      await audit(tx, actor, "order.approve", "SalesOrder", orderId, `Approved ${order.orderNo}` + (short.length ? `; stock shortage: ${short.map((s) => `${s.productName} short ${s.shortage}`).join(", ")}` : ""), {
        shortages: short.map((s) => ({ product: s.productName, shortage: s.shortage, available: s.available })),
      });
      return { status: "APPROVED", availability };
    }
    if (order.invoices.some((i) => i.status === "ISSUED")) throw conflict("Orders with active invoices cannot be rejected or cancelled; cancel the invoice first");
    if (decision === "REJECT" && !reason) throw badRequest("Give a reason for rejecting the order");
    if (decision === "CANCEL" && actor.role === "SALESMAN" && order.salesmanId !== actor.id) throw forbidden();
    const allowed = decision === "CANCEL" && actor.role === "SALESMAN" ? ["PENDING"] : ["PENDING", "APPROVED"];
    const res = await tx.salesOrder.updateMany({
      where: { id: orderId, status: { in: allowed as ("PENDING" | "APPROVED")[] } },
      data: { status: decision === "REJECT" ? "REJECTED" : "CANCELLED", rejectedReason: reason ?? null },
    });
    if (res.count !== 1) throw conflict(`Order ${order.orderNo} is ${order.status.toLowerCase()} and cannot be ${decision === "REJECT" ? "rejected" : "cancelled"}`);
    await audit(tx, actor, decision === "REJECT" ? "order.reject" : "order.cancel", "SalesOrder", orderId, `${decision === "REJECT" ? "Rejected" : "Cancelled"} ${order.orderNo}${reason ? `: ${reason}` : ""}`);
    return { status: decision === "REJECT" ? "REJECTED" : "CANCELLED" };
  });
}

/**
 * Admin correction of an order before it is invoiced (quantity or negotiated rate). The order row is
 * locked so a concurrent approval/invoice cannot interleave, and the audit row stores every line's
 * before/after values plus the reason, so the change is fully traceable.
 */
export async function amendOrder(actor: Actor, orderId: string, input: OrderAmendInput) {
  return withTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { items: { include: { product: { include: { item: true } } } }, invoices: true } });
    if (!order) throw notFound("Order");
    if (!["PENDING", "APPROVED"].includes(order.status)) throw conflict(`Order ${order.orderNo} is ${order.status.toLowerCase()} and can no longer be changed`);
    if (order.invoices.length || order.items.some((i) => D(i.invoicedQty).gt(0))) throw conflict("Invoiced orders cannot be changed; cancel the invoice with a credit note first");
    const ids = input.lines.map((l) => l.orderItemId);
    if (new Set(ids).size !== ids.length) throw badRequest("Each order line can appear only once");

    const changes: { product: string; before: { quantity: string; rate: string }; after: { quantity: string; rate: string } }[] = [];
    for (const l of input.lines) {
      const line = order.items.find((i) => i.id === l.orderItemId);
      if (!line) throw notFound("Order line");
      const qty = D(l.quantity);
      const rate = round2(D(l.rate));
      if (qty.eq(D(line.quantity)) && rate.eq(D(line.rate))) continue;
      await tx.salesOrderItem.update({
        where: { id: line.id },
        data: { quantity: qty.toFixed(), rate: rate.toFixed(2), lineAmount: round2(qty.times(rate)).toFixed(2) },
      });
      changes.push({
        product: line.product.item.name,
        before: { quantity: D(line.quantity).toFixed(), rate: D(line.rate).toFixed(2) },
        after: { quantity: qty.toFixed(), rate: rate.toFixed(2) },
      });
    }
    if (!changes.length) throw badRequest("Nothing changed");
    const items = await tx.salesOrderItem.findMany({ where: { orderId } });
    const subtotal = sum(items.map((i) => i.lineAmount));
    await tx.salesOrder.update({ where: { id: orderId }, data: { subtotal: subtotal.toFixed(2) } });
    await audit(
      tx,
      actor,
      "order.amend",
      "SalesOrder",
      orderId,
      `Amended ${order.orderNo}: ` +
        changes.map((c) => `${c.product} ${c.before.quantity} @ ₹${c.before.rate} → ${c.after.quantity} @ ₹${c.after.rate}`).join("; ") +
        ` (${input.reason})`,
      { reason: input.reason, subtotalBefore: D(order.subtotal).toFixed(2), subtotalAfter: subtotal.toFixed(2), changes },
    );
    return { subtotal: subtotal.toFixed(2), changes };
  });
}
