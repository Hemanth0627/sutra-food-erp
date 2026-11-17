import { purchaseOrderSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createPurchaseOrder } from "@/server/services/purchase-orders";

export const POST = apiRoute({ permission: "purchases:create", schema: purchaseOrderSchema }, async ({ actor, body }) => ({ purchaseOrder: await createPurchaseOrder(actor, body) }));
