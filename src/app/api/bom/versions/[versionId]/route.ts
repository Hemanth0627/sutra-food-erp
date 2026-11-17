import { bomVersionSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { updateDraftBomVersion } from "@/server/services/bom";

export const PATCH = apiRoute({ permission: "bom:manage", schema: bomVersionSchema }, async ({ actor, body, params }) => ({
  version: await updateDraftBomVersion(actor, params.versionId, body),
}));
