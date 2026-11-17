import { stockAdjustmentSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { adjustStock } from "@/server/services/stock";

export const POST = apiRoute({ permission: "inventory:adjust", schema: stockAdjustmentSchema }, async ({ actor, body }) => ({
  adjustment: await adjustStock(actor, body),
}));
