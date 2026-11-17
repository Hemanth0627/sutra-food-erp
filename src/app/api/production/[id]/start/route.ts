import { productionStartSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { startProductionRun } from "@/server/services/production";

export const POST = apiRoute({ permission: "production:manage", schema: productionStartSchema }, async ({ actor, body, params }) =>
  startProductionRun(actor, params.id, body),
);
