import { orderAmendSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { amendOrder } from "@/server/services/orders";

/** Admin amendment of quantities / rates on a not-yet-invoiced order (audited with before/after values). */
export const PATCH = apiRoute({ permission: "orders:approve", schema: orderAmendSchema }, async ({ actor, body, params }) => amendOrder(actor, params.id, body));
