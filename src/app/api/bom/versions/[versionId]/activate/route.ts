import { apiRoute } from "@/server/api";
import { activateBomVersion } from "@/server/services/bom";

export const POST = apiRoute({ permission: "bom:manage" }, async ({ actor, params }) => ({
  version: await activateBomVersion(actor, params.versionId),
}));
