import { z } from "zod";
import { apiRoute } from "@/server/api";
import { cancelProductionRun } from "@/server/services/production";

export const POST = apiRoute({ permission: "production:manage", schema: z.object({ reason: z.string().trim().min(3).max(300) }) }, async ({ actor, body, params }) =>
  cancelProductionRun(actor, params.id, body.reason),
);
