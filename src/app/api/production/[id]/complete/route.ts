import { productionCompleteSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { completeProductionRun } from "@/server/services/production";

export const POST = apiRoute({ permission: "production:manage", schema: productionCompleteSchema }, async ({ actor, body, params }) =>
  completeProductionRun(actor, params.id, body),
);
