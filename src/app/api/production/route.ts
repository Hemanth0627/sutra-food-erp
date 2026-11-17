import { productionCreateSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createProductionRun } from "@/server/services/production";

export const POST = apiRoute({ permission: "production:manage", schema: productionCreateSchema }, async ({ actor, body }) => ({
  run: await createProductionRun(actor, body),
}));
