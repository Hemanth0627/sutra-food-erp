import PDFDocument from "pdfkit";
import { formatCell } from "../reports/format";
import type { Column, Row } from "../reports/definitions";

export { formatCell };

/** Standard PDF fonts use WinAnsi encoding; map characters outside it to safe equivalents. */
export function pdfSafe(text: string): string {
  return text
    .replace(/₹/g, "Rs. ")
    .replace(/[−‒]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…€™]/g, "?");
}

export function createDoc(options: PDFKit.PDFDocumentOptions) {
  const doc = new PDFDocument({ bufferPages: true, ...options });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

const WIDE_KEYS = new Set(["summary", "invoices", "damaged", "metric", "description", "item", "material", "customer", "product", "supplier"]);

function weight(col: Column): number {
  if (WIDE_KEYS.has(col.key)) return col.key === "summary" ? 4 : 1.8;
  switch (col.type) {
    case "text":
      return 1.25;
    case "date":
      return 1.05;
    case "money":
      return 1.1;
    case "qty":
      return 0.9;
    case "pct":
      return 0.8;
    default:
      return 0.7;
  }
}

/** Draws a table with repeated headers on page breaks. Returns the y position after the table. */
export function drawTable(doc: PDFKit.PDFDocument, title: string, columns: Column[], rows: Row[], totals?: Row, notes?: string[]) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 18;
  const fontSize = columns.length > 10 ? 6.8 : columns.length > 7 ? 7.6 : 8.6;
  const totalWeight = columns.reduce((a, c) => a + weight(c), 0);
  const widths = columns.map((c) => (weight(c) / totalWeight) * width);
  const pad = 3;
  const isNumeric = (c: Column) => ["money", "qty", "pct", "number"].includes(c.type);

  if (doc.y > bottom() - 60) doc.addPage();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#18181b").text(pdfSafe(title), left, doc.y);
  doc.moveDown(0.3);

  const header = () => {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(fontSize);
    const h = Math.max(...columns.map((c, i) => doc.heightOfString(pdfSafe(c.label), { width: widths[i] - pad * 2 }))) + pad * 2;
    doc.rect(left, y, width, h).fill("#f4f4f5");
    let x = left;
    columns.forEach((c, i) => {
      doc.fillColor("#3f3f46").text(pdfSafe(c.label), x + pad, y + pad, { width: widths[i] - pad * 2, align: isNumeric(c) ? "right" : "left" });
      x += widths[i];
    });
    doc.y = y + h;
  };

  const drawRow = (row: Row, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
    const texts = columns.map((c) => pdfSafe(formatCell(c, row[c.key] ?? null)));
    const h = Math.max(10, ...texts.map((t, i) => doc.heightOfString(t || " ", { width: widths[i] - pad * 2 }))) + pad * 2;
    if (doc.y + h > bottom()) {
      doc.addPage();
      header();
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
    }
    const y = doc.y;
    if (bold) doc.rect(left, y, width, h).fill("#fafafa");
    let x = left;
    texts.forEach((t, i) => {
      doc.fillColor("#18181b").text(t, x + pad, y + pad, { width: widths[i] - pad * 2, align: isNumeric(columns[i]) ? "right" : "left" });
      x += widths[i];
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.4).strokeColor("#e4e4e7").stroke();
    doc.y = y + h;
  };

  header();
  if (rows.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(fontSize + 0.5).fillColor("#71717a").text("No transactions in this period.", left + pad, doc.y + 4);
    doc.moveDown(0.5);
  }
  rows.forEach((r) => drawRow(r));
  if (totals && rows.length) drawRow(totals, true);
  if (notes?.length) {
    doc.moveDown(0.3);
    doc.font("Helvetica-Oblique").fontSize(7).fillColor("#71717a");
    notes.forEach((n) => doc.text(pdfSafe(n), left, doc.y, { width }));
  }
  doc.moveDown(1);
}

/** Adds "Page x of y" and a footer line to every buffered page. */
export function addFooters(doc: PDFKit.PDFDocument, footer: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - bottomMargin + 10;
    doc.font("Helvetica").fontSize(7).fillColor("#a1a1aa");
    doc.text(pdfSafe(footer), doc.page.margins.left, y, { width: 400, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - doc.page.margins.right - 100, y, { width: 100, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}
