import { orderDecisionSchema } from "@/lib/validation";
import { hasPermission } from "@/lib/permissions";
import { apiRoute } from "@/server/api";
import { forbidden } from "@/server/errors";
import { decideOrder } from "@/server/services/orders";

export const POST = apiRoute({ permission: ["orders:approve", "orders:create"], schema: orderDecisionSchema }, async ({ actor, user, body, params }) => {
  // Salesmen may only cancel their own pending orders; approve/reject needs orders:approve.
  if (body.decision !== "CANCEL" && !hasPermission(user.role, "orders:approve")) throw forbidden();
  return decideOrder(actor, params.id, body.decision, body.reason);
});
