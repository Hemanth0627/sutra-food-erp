import { bomVersionSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createBomVersion } from "@/server/services/bom";

export const POST = apiRoute({ permission: "bom:manage", schema: bomVersionSchema }, async ({ actor, body, params }) => ({
  version: await createBomVersion(actor, params.id, body),
}));
