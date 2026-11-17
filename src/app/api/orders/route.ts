import { orderCreateSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createOrder } from "@/server/services/orders";

/** Creates an order. Idempotent on clientRef, so the offline queue can safely retry. */
export const POST = apiRoute({ permission: "orders:create", schema: orderCreateSchema }, async ({ actor, body }) => {
  const { order, duplicate } = await createOrder(actor, body);
  return { order: { id: order.id, orderNo: order.orderNo, status: order.status, clientRef: order.clientRef }, duplicate };
});
