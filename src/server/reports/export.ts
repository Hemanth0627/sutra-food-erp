import ExcelJS from "exceljs";
import { formatDateTime } from "@/lib/dates";
import type { Actor } from "../audit";
import { prisma } from "../db";
import { notFound } from "../errors";
import { addFooters, createDoc, drawTable, pdfSafe } from "../pdf/pdf-utils";
import { getReport, type Column, type ReportResult, type Row } from "./definitions";
import type { ReportFilters } from "./filters";

export interface ExportFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(result: ReportResult): string {
  const lines: string[] = [];
  for (const s of result.sections) {
    if (result.sections.length > 1) lines.push(csvEscape(s.title));
    lines.push(s.columns.map((c) => csvEscape(c.label)).join(","));
    for (const r of s.rows) lines.push(s.columns.map((c) => csvEscape(r[c.key] === null || r[c.key] === undefined ? "" : String(r[c.key]))).join(","));
    if (s.totals) lines.push(s.columns.map((c) => csvEscape(s.totals![c.key] === null || s.totals![c.key] === undefined ? "" : String(s.totals![c.key]))).join(","));
    lines.push("");
  }
  return "﻿" + lines.join("\r\n");
}

function excelValue(col: Column, v: Row[string]): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (["money", "qty", "pct", "number"].includes(col.type) && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (col.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00Z`);
  return s;
}

const NUM_FMT: Record<string, string> = { money: "#,##0.00", qty: "#,##0.###", pct: '0.00"%"', number: "0", date: "dd-mmm-yyyy" };

async function toXlsx(title: string, subtitle: string, result: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sutra ERP";
  wb.created = new Date();
  const used = new Set<string>();
  for (const s of result.sections) {
    let name = s.title.replace(/[\[\]:*?/\\]/g, " ").slice(0, 28).trim() || "Sheet";
    while (used.has(name)) name = name.slice(0, 26) + "_" + used.size;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow([result.sections.length > 1 ? s.title : title]).font = { bold: true, size: 13 };
    ws.addRow([subtitle]).font = { color: { argb: "FF71717A" }, size: 9 };
    ws.addRow([]);
    const header = ws.addRow(s.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD4D4D8" } } };
    });
    for (const r of s.rows) ws.addRow(s.columns.map((c) => excelValue(c, r[c.key])));
    if (s.totals) ws.addRow(s.columns.map((c) => excelValue(c, s.totals![c.key] ?? null))).font = { bold: true };
    if (s.notes?.length) {
      ws.addRow([]);
      s.notes.forEach((n) => (ws.addRow([n]).font = { italic: true, color: { argb: "FF71717A" }, size: 9 }));
    }
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(48, Math.max(10, c.label.length + 2, ...s.rows.map((r) => String(r[c.key] ?? "").length + 2)));
      if (NUM_FMT[c.type]) col.numFmt = NUM_FMT[c.type];
    });
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function toPdf(title: string, subtitle: string, company: string, result: ReportResult, footer: string): Promise<Buffer> {
  const { doc, done } = createDoc({ size: "A4", layout: "landscape", margins: { top: 36, bottom: 40, left: 32, right: 32 }, info: { Title: title, Author: company } });
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#18181b").text(pdfSafe(title));
  doc.font("Helvetica").fontSize(9).fillColor("#52525b").text(pdfSafe(`${company}  ·  ${subtitle}`));
  doc.moveDown(0.8);
  for (const s of result.sections) drawTable(doc, s.title, s.columns, s.rows, s.totals, s.notes);
  addFooters(doc, footer);
  doc.end();
  return done;
}

export async function exportReport(key: string, filters: ReportFilters, format: "csv" | "xlsx" | "pdf", actor: Actor): Promise<ExportFile> {
  const def = getReport(key);
  if (!def) throw notFound("Report");
  const result = await def.run(filters);
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
  const company = settings?.legalName ?? "Sutra ERP";
  const parts = [`Period ${filters.fromStr} to ${filters.toStr}`];
  if (filters.customerId) parts.push(`Customer: ${(await prisma.customer.findUnique({ where: { id: filters.customerId } }))?.name ?? "?"}`);
  if (filters.productId) parts.push(`Product: ${(await prisma.product.findUnique({ where: { id: filters.productId }, include: { item: true } }))?.item.name ?? "?"}`);
  if (filters.type) parts.push(`Type: ${filters.type}`);
  const subtitle = parts.join("  ·  ");
  const base = `${key}_${filters.fromStr}_${filters.toStr}`;
  const footer = `Generated ${formatDateTime(new Date())} IST by ${actor.name} from posted transactions · Sutra ERP`;

  await prisma.auditLog.create({
    data: { userId: actor.id, action: "report.export", entityType: "Report", entityId: key, summary: `Exported ${def.title} (${format.toUpperCase()}) for ${filters.fromStr} – ${filters.toStr}`, ipAddress: actor.ipAddress ?? null },
  });

  if (format === "csv") return { buffer: Buffer.from(toCsv(result), "utf8"), filename: `${base}.csv`, contentType: "text/csv; charset=utf-8" };
  if (format === "xlsx") {
    return { buffer: await toXlsx(def.title, `${company} · ${subtitle}`, result), filename: `${base}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  return { buffer: await toPdf(def.title, subtitle, company, result, footer), filename: `${base}.pdf`, contentType: "application/pdf" };
}
