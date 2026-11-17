import { purchaseSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createPurchase } from "@/server/services/purchases";

export const POST = apiRoute({ permission: "purchases:create", schema: purchaseSchema }, async ({ actor, body }) => ({
  purchase: await createPurchase(actor, body),
}));
