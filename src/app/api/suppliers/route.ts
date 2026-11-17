import { supplierSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createSupplier } from "@/server/services/masters";

export const POST = apiRoute({ permission: "suppliers:manage", schema: supplierSchema }, async ({ actor, body }) => ({
  supplier: await createSupplier(actor, body),
}));
