import { apiRoute } from "@/server/api";
import { badRequest } from "@/server/errors";
import { exportReport } from "@/server/reports/export";
import { parseReportFilters } from "@/server/reports/filters";

export const runtime = "nodejs";

export const GET = apiRoute({ permission: "reports:export" }, async ({ req, params, actor }) => {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!["csv", "xlsx", "pdf"].includes(format)) throw badRequest("format must be csv, xlsx or pdf");
  const filters = parseReportFilters(Object.fromEntries(url.searchParams));
  const file = await exportReport(params.key, filters, format as "csv" | "xlsx" | "pdf", actor);
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
