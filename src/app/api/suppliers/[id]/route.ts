import { z } from "zod";
import { supplierSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { updateSupplier } from "@/server/services/masters";

const schema = supplierSchema.extend({ isActive: z.boolean().optional() });

export const PATCH = apiRoute({ permission: "suppliers:manage", schema }, async ({ actor, body, params }) => ({
  supplier: await updateSupplier(actor, params.id, body),
}));
