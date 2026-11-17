import { paymentSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { recordPayment } from "@/server/services/payments";

export const POST = apiRoute({ permission: "payments:create", schema: paymentSchema }, async ({ actor, body }) => {
  const p = await recordPayment(actor, body);
  return { payment: { id: p.id, receiptNo: p.receiptNo } };
});
