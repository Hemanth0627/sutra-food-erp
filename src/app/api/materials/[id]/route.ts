import { materialSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { updateMaterial } from "@/server/services/masters";

export const PATCH = apiRoute({ permission: ["products:manage", "bom:manage"], schema: materialSchema }, async ({ actor, body, params }) => ({
  material: await updateMaterial(actor, params.id, body),
}));
