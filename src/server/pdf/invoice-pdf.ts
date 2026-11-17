import { D, formatIndian, formatQty } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { amountInWords } from "@/lib/gst";
import { prisma } from "../db";
import { notFound } from "../errors";
import { createDoc, pdfSafe } from "./pdf-utils";

/** Renders a posted invoice (from its stored snapshot, never from current masters) as an A4 PDF. */
export async function renderInvoicePdf(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, creditNote: true, dispatch: true, order: { select: { orderNo: true } } },
  });
  if (!inv) throw notFound("Invoice");
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
  const intra = inv.supplyType === "INTRA_STATE";

  const { doc, done } = createDoc({ size: "A4", margins: { top: 40, bottom: 40, left: 40, right: 40 }, info: { Title: `Tax Invoice ${inv.invoiceNo}`, Author: inv.sellerName } });
  const L = 40;
  const W = doc.page.width - 80;
  const ink = "#18181b";
  const muted = "#71717a";
  const line = (y: number) => doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.6).strokeColor("#d4d4d8").stroke();

  // Header
  doc.rect(L, 40, 6, 46).fill("#b45309");
  doc.font("Helvetica-Bold").fontSize(15).fillColor(ink).text(pdfSafe(inv.sellerName), L + 14, 40, { width: W * 0.6 });
  doc.font("Helvetica").fontSize(8.5).fillColor(muted).text(pdfSafe(inv.sellerAddress), L + 14, doc.y + 2, { width: W * 0.6 });
  doc.text(`GSTIN: ${inv.sellerGstin}   State code: ${inv.sellerStateCode}`, L + 14, doc.y + 1, { width: W * 0.6 });
  if (settings?.phone || settings?.email) doc.text(pdfSafe([settings?.phone, settings?.email].filter(Boolean).join("  ·  ")), L + 14, doc.y + 1, { width: W * 0.6 });

  doc.font("Helvetica-Bold").fontSize(16).fillColor(ink).text("TAX INVOICE", L + W * 0.6, 40, { width: W * 0.4, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(muted).text("Original for recipient", L + W * 0.6, doc.y, { width: W * 0.4, align: "right" });
  const meta: [string, string][] = [
    ["Invoice no.", inv.invoiceNo],
    ["Invoice date", formatDate(inv.invoiceDate)],
    ["Due date", formatDate(inv.dueDate)],
    ["Order", inv.order?.orderNo ?? "-"],
  ];
  let my = doc.y + 6;
  for (const [k, v] of meta) {
    doc.font("Helvetica").fontSize(8.5).fillColor(muted).text(k, L + W * 0.6, my, { width: W * 0.18, align: "left" });
    doc.font("Helvetica-Bold").fillColor(ink).text(pdfSafe(v), L + W * 0.78, my, { width: W * 0.22, align: "right" });
    my += 12;
  }

  let y = Math.max(doc.y, my) + 10;
  line(y);
  y += 10;

  // Bill to / supply details
  const colW = W / 2 - 10;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(muted).text("BILL TO / SHIP TO", L, y);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(ink).text(pdfSafe(inv.customerName), L, y + 12, { width: colW });
  doc.font("Helvetica").fontSize(8.5).fillColor(ink).text(pdfSafe(inv.customerAddress), L, doc.y + 2, { width: colW });
  doc.text(`GSTIN: ${inv.customerGstin ?? "Unregistered"}`, L, doc.y + 2, { width: colW });
  const leftEnd = doc.y;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(muted).text("SUPPLY DETAILS", L + W / 2 + 10, y);
  const supply: [string, string][] = [
    ["Place of supply", inv.placeOfSupply],
    ["Supply type", intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"],
    ["Reverse charge", "No"],
    ["Dispatch", inv.dispatch ? `${inv.dispatch.dispatchNo} on ${formatDate(inv.dispatch.dispatchDate)}` : "Pending"],
  ];
  let sy = y + 12;
  for (const [k, v] of supply) {
    doc.font("Helvetica").fontSize(8.5).fillColor(muted).text(k, L + W / 2 + 10, sy, { width: 90 });
    doc.font("Helvetica").fillColor(ink).text(pdfSafe(v), L + W / 2 + 100, sy, { width: colW - 90 });
    sy += 12;
  }
  y = Math.max(leftEnd, sy) + 12;

  // Line items
  const cols = intra
    ? [["#", 16, "l"], ["Description", 128, "l"], ["HSN", 38, "l"], ["Qty", 44, "r"], ["Rate", 46, "r"], ["Taxable", 60, "r"], ["CGST", 56, "r"], ["SGST", 56, "r"], ["Total", 0, "r"]]
    : [["#", 16, "l"], ["Description", 150, "l"], ["HSN", 40, "l"], ["Qty", 46, "r"], ["Rate", 52, "r"], ["Taxable", 68, "r"], ["IGST", 70, "r"], ["Total", 0, "r"]];
  const fixed = cols.reduce((a, c) => a + (c[1] as number), 0);
  const widths = cols.map((c) => ((c[1] as number) || W - fixed));
  // A cell may carry a second, smaller line after "\n" (used for tax rates).
  const drawCells = (cells: string[], yy: number, bold: boolean, h: number, fill?: string) => {
    if (fill) doc.rect(L, yy, W, h).fill(fill);
    let x = L;
    cells.forEach((t, i) => {
      const [main, sub] = t.split("\n");
      const opts = { width: widths[i] - 8, align: (cols[i][2] === "r" ? "right" : "left") as "right" | "left", lineBreak: false };
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 7.6 : 8.4).fillColor(ink).text(pdfSafe(main), x + 4, yy + 6, opts);
      if (sub) doc.font("Helvetica").fontSize(6.8).fillColor(muted).text(pdfSafe(sub), x + 4, yy + 17, opts);
      x += widths[i];
    });
    return yy + h;
  };
  y = drawCells(cols.map((c) => String(c[0])), y, true, 18, "#f4f4f5");
  doc.font("Helvetica").fontSize(6.8).fillColor(muted).text("Amounts in INR", L, y + 3, { width: W, align: "right" });
  y += 12;
  inv.items.forEach((it, idx) => {
    const tax = intra
      ? [`${formatIndian(it.cgstAmount)}\n@ ${D(it.cgstRate).toFixed(2)}%`, `${formatIndian(it.sgstAmount)}\n@ ${D(it.sgstRate).toFixed(2)}%`]
      : [`${formatIndian(it.igstAmount)}\n@ ${D(it.igstRate).toFixed(2)}%`];
    y = drawCells([String(idx + 1), it.description, it.hsnCode, `${formatQty(it.quantity)} ${it.unit}`, formatIndian(it.rate), formatIndian(it.taxableValue), ...tax, formatIndian(it.lineTotal)], y, false, 30);
    line(y);
  });

  // Totals
  y += 12;
  const tx = L + W - 230;
  const totals: [string, string, boolean?][] = [
    ["Taxable value", formatIndian(inv.taxableTotal)],
    ...(intra ? ([["CGST", formatIndian(inv.cgstTotal)], ["SGST", formatIndian(inv.sgstTotal)]] as [string, string][]) : ([["IGST", formatIndian(inv.igstTotal)]] as [string, string][])),
    ["Round off", formatIndian(inv.roundOff)],
    ["Grand total (INR)", formatIndian(inv.grandTotal), true],
  ];
  for (const [k, v, bold] of totals) {
    if (bold) {
      doc.rect(tx, y - 3, 230, 20).fill("#18181b");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff").text(k, tx + 8, y + 2, { width: 120 });
      doc.text(v, tx + 110, y + 2, { width: 112, align: "right" });
      y += 22;
    } else {
      doc.font("Helvetica").fontSize(9).fillColor(muted).text(k, tx + 8, y, { width: 120 });
      doc.fillColor(ink).text(v, tx + 110, y, { width: 112, align: "right" });
      y += 15;
    }
  }
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(muted).text("Amount in words", L, y - 60, { width: W - 250 });
  doc.font("Helvetica").fontSize(9).fillColor(ink).text(pdfSafe(amountInWords(inv.grandTotal)), L, doc.y + 2, { width: W - 250 });

  // Footer blocks
  y += 20;
  line(y);
  y += 10;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(muted).text("BANK DETAILS", L, y);
  doc.font("Helvetica").fontSize(8.5).fillColor(ink).text(pdfSafe(settings?.bankDetails ?? "-"), L, y + 11, { width: W / 2 });
  doc.font("Helvetica-Bold").fontSize(8).fillColor(muted).text("DECLARATION", L, doc.y + 8);
  doc.font("Helvetica").fontSize(8).fillColor(ink).text("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", L, doc.y + 2, { width: W / 2 });
  doc.font("Helvetica").fontSize(9).fillColor(ink).text(pdfSafe(`For ${inv.sellerName}`), L + W / 2, y, { width: W / 2, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(muted).text("Authorised signatory", L + W / 2, y + 48, { width: W / 2, align: "right" });

  if (inv.status === "CANCELLED") {
    doc.save();
    doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font("Helvetica-Bold").fontSize(64).fillColor("#dc2626").opacity(0.15).text("CANCELLED", 0, doc.page.height / 2 - 40, { width: doc.page.width, align: "center" });
    doc.restore();
    doc.opacity(1).font("Helvetica-Bold").fontSize(9).fillColor("#dc2626").text(pdfSafe(`Cancelled via credit note ${inv.creditNote?.creditNoteNo ?? ""} on ${formatDate(inv.cancelledAt)}`), L, doc.page.height - 95, { width: W, align: "center" });
  }

  doc.font("Helvetica-Oblique").fontSize(7).fillColor("#a1a1aa").text(
    "Computer-generated invoice from Sutra ERP (internship prototype). Demonstrates GST computation only; not an e-invoice (no IRN/QR) and not certified for GST filing. All parties are fictional.",
    L,
    doc.page.height - 70,
    { width: W, align: "center" },
  );
  doc.end();
  return { buffer: await done, filename: `${inv.invoiceNo.replace(/\//g, "-")}.pdf` };
}
