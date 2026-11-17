import { customerSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createCustomer } from "@/server/services/masters";

export const POST = apiRoute({ permission: "customers:manage", schema: customerSchema }, async ({ actor, body }) => ({
  customer: await createCustomer(actor, body),
}));
