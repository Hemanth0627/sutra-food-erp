import { bomCreateSchema, bomVersionSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createBom } from "@/server/services/bom";

const schema = bomCreateSchema.extend({ version: bomVersionSchema });

export const POST = apiRoute({ permission: "bom:manage", schema }, async ({ actor, body }) => ({
  bomId: await createBom(actor, { productId: body.productId, name: body.name, code: body.code }, body.version),
}));
