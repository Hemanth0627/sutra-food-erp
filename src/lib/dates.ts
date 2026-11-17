/**
 * Business dates are Indian Standard Time (UTC+05:30, no DST) regardless of the server time zone.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;

export function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Financial year label (April–March): 17 Nov 2026 -> "2026-27". */
export function financialYear(date: Date): string {
  const { year, month } = istParts(date);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Start of the IST day containing `date`, as a UTC instant. */
export function startOfIstDay(date: Date): Date {
  const { year, month, day } = istParts(date);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

export function startOfIstMonth(date: Date): Date {
  const { year, month } = istParts(date);
  return new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
}

export function addIstMonths(monthStart: Date, months: number): Date {
  const { year, month } = istParts(monthStart);
  return new Date(Date.UTC(year, month - 1 + months, 1) - IST_OFFSET_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

/** "2026-11" key for monthly grouping (IST). */
export function monthKey(date: Date): string {
  const { year, month } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** yyyy-MM-dd in IST, used for <input type="date"> values and report filters. */
export function isoDateIst(date: Date): string {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parses yyyy-MM-dd as the start of that IST day. */
export function parseIsoDateIst(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const { year, month, day } = istParts(d);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm}`;
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((startOfIstDay(to).getTime() - startOfIstDay(from).getTime()) / 86400000);
}

export type PeriodKey = "today" | "7d" | "month" | "30d" | "fy";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "30d", label: "30 days" },
  { key: "fy", label: "This FY" },
];

/** Dashboard period → start instant (IST business dates). Unknown keys fall back to this month. */
export function resolvePeriod(key: string | undefined, now = new Date()): { key: PeriodKey; label: string; from: Date } {
  const today = startOfIstDay(now);
  const found = PERIODS.find((p) => p.key === key) ?? PERIODS[2];
  const { year, month } = istParts(now);
  const fyStart = new Date(Date.UTC(month >= 4 ? year : year - 1, 3, 1) - IST_OFFSET_MS);
  const from = { today, "7d": addDays(today, -6), month: startOfIstMonth(now), "30d": addDays(today, -29), fy: fyStart }[found.key];
  return { ...found, from };
}

