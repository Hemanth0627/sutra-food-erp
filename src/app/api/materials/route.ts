import { materialSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createMaterial } from "@/server/services/masters";

export const POST = apiRoute({ permission: ["products:manage", "bom:manage"], schema: materialSchema }, async ({ actor, body }) => ({
  material: await createMaterial(actor, body),
}));
