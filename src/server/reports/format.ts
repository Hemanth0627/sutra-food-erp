import { formatIndian, formatQty } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import type { Column, Row } from "./definitions";

export function formatCell(col: Column, value: Row[string]): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);
  switch (col.type) {
    case "money":
      return /^-?\d+(\.\d+)?$/.test(s) ? formatIndian(s) : s;
    case "qty":
      return /^-?\d+(\.\d+)?$/.test(s) ? formatQty(s) : s;
    case "pct":
      return /^-?\d+(\.\d+)?$/.test(s) ? `${s}%` : s;
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatDate(new Date(`${s}T06:30:00Z`)) : s;
    default:
      return s;
  }
}

