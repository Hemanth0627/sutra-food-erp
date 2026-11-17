import { productSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { updateProduct } from "@/server/services/masters";

export const PATCH = apiRoute({ permission: "products:manage", schema: productSchema }, async ({ actor, body, params }) => ({
  product: await updateProduct(actor, params.id, body),
}));
