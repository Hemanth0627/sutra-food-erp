import { purchaseReturnSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { returnToSupplier } from "@/server/services/purchases";

export const POST = apiRoute({ permission: "purchases:create", schema: purchaseReturnSchema }, async ({ actor, body, params }) => ({
  purchaseReturn: await returnToSupplier(actor, params.id, body),
}));
