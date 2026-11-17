import { apiRoute } from "@/server/api";
import { renderInvoicePdf } from "@/server/pdf/invoice-pdf";

export const runtime = "nodejs";

export const GET = apiRoute({ permission: "invoices:view" }, async ({ params }) => {
  const { buffer, filename } = await renderInvoicePdf(params.id);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
