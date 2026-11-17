import { productSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createProduct } from "@/server/services/masters";

export const POST = apiRoute({ permission: "products:manage", schema: productSchema }, async ({ actor, body }) => ({
  product: await createProduct(actor, body),
}));
