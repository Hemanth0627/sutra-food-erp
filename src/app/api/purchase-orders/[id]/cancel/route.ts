import { purchaseOrderCancelSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { cancelPurchaseOrder } from "@/server/services/purchase-orders";

export const POST = apiRoute({ permission: "purchases:create", schema: purchaseOrderCancelSchema }, async ({ actor, body, params }) => cancelPurchaseOrder(actor, params.id, body.reason));
