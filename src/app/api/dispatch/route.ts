import { dispatchSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { dispatchInvoice } from "@/server/services/dispatch";

export const POST = apiRoute({ permission: "dispatch:create", schema: dispatchSchema }, async ({ actor, body }) => {
  const d = await dispatchInvoice(actor, body);
  return { dispatch: { id: d.id, dispatchNo: d.dispatchNo } };
});
