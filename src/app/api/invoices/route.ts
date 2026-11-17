import { invoiceCreateSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createInvoice } from "@/server/services/invoices";

export const POST = apiRoute({ permission: "invoices:create", schema: invoiceCreateSchema }, async ({ actor, body }) => {
  const invoice = await createInvoice(actor, body);
  return { invoice: { id: invoice.id, invoiceNo: invoice.invoiceNo, grandTotal: invoice.grandTotal.toFixed(2) } };
});
