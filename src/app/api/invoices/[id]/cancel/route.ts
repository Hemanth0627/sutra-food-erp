import { invoiceCancelSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { cancelInvoice } from "@/server/services/invoices";

export const POST = apiRoute({ permission: "invoices:cancel", schema: invoiceCancelSchema }, async ({ actor, body, params }) => {
  const cn = await cancelInvoice(actor, params.id, body);
  return { creditNote: { id: cn.id, creditNoteNo: cn.creditNoteNo } };
});
