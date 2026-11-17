import { z } from "zod";
import { customerSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { updateCustomer } from "@/server/services/masters";

const schema = customerSchema.and(z.object({ isActive: z.boolean().optional() }));

export const PATCH = apiRoute({ permission: "customers:manage", schema }, async ({ actor, body, params }) => ({
  customer: await updateCustomer(actor, params.id, body),
}));
