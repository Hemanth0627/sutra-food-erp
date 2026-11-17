import DecimalJs from "decimal.js";

/**
 * Exact decimal arithmetic for money and quantities.
 * All financial and stock calculations go through this module; JavaScript floats are never used
 * for amounts. Rounding is commercial (half-up), as used on Indian GST invoices.
 */
export const Dec = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export type DecimalLike = string | number | Dec | { toString(): string };

export function D(value: DecimalLike | null | undefined): Dec {
  if (value === null || value === undefined || value === "") return new Dec(0);
  if (value instanceof Dec) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid number: ${value}`);
    return new Dec(String(value));
  }
  return new Dec(typeof value === "string" ? value.trim() : value.toString());
}

export const ZERO = new Dec(0);

export function round(value: DecimalLike, dp: number): Dec {
  return D(value).toDecimalPlaces(dp, Dec.ROUND_HALF_UP);
}

/** Money: 2 decimal places, half-up. */
export const round2 = (v: DecimalLike) => round(v, 2);
/** Quantities: 3 decimal places. */
export const round3 = (v: DecimalLike) => round(v, 3);
/** Inventory values: 4 decimal places. */
export const round4 = (v: DecimalLike) => round(v, 4);
/** Unit costs: 6 decimal places. */
export const round6 = (v: DecimalLike) => round(v, 6);

export function sum(values: DecimalLike[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(D(v)), new Dec(0));
}

export function min(a: DecimalLike, b: DecimalLike): Dec {
  return Dec.min(D(a), D(b));
}

export function max(a: DecimalLike, b: DecimalLike): Dec {
  return Dec.max(D(a), D(b));
}

/** Percentage change of `actual` against `base`, e.g. (10.5 - 10) / 10 = +5.000. */
export function pctChange(actual: DecimalLike, base: DecimalLike, dp = 3): Dec {
  const b = D(base);
  if (b.isZero()) return new Dec(0);
  return round(D(actual).minus(b).div(b).times(100), dp);
}

export function pctOf(part: DecimalLike, whole: DecimalLike, dp = 3): Dec {
  const w = D(whole);
  if (w.isZero()) return new Dec(0);
  return round(D(part).div(w).times(100), dp);
}

/** Fixed 2-dp string, the canonical wire format for money. */
export function money(value: DecimalLike): string {
  return round2(value).toFixed(2);
}

/** Quantity as a trimmed string (no trailing zeros): 19.500 -> "19.5". */
export function qtyString(value: DecimalLike, dp = 3): string {
  return round(value, dp).toString();
}

/** Group an integer string the Indian way: 1234567 -> 12,34,567. */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

/** Format a number with Indian digit grouping and a fixed number of decimals, without floats. */
export function formatIndian(value: DecimalLike, dp = 2): string {
  const d = round(value, dp);
  const negative = d.isNegative() && !d.isZero();
  const [intPart, frac] = d.abs().toFixed(dp).split(".");
  const grouped = groupIndian(intPart);
  return (negative ? "-" : "") + grouped + (dp > 0 ? "." + frac : "");
}

/** ₹7,875.00 */
export function formatINR(value: DecimalLike, dp = 2): string {
  const s = formatIndian(value, dp);
  return s.startsWith("-") ? "-₹" + s.slice(1) : "₹" + s;
}

/** Compact rupees for KPI tiles: ₹7.9K, ₹1.25L, ₹2.1Cr. */
export function formatINRCompact(value: DecimalLike): string {
  const d = D(value);
  const abs = d.abs();
  const sign = d.isNegative() ? "-" : "";
  if (abs.gte(1e7)) return `${sign}₹${round(abs.div(1e7), 2).toString()}Cr`;
  if (abs.gte(1e5)) return `${sign}₹${round(abs.div(1e5), 2).toString()}L`;
  if (abs.gte(1e3)) return `${sign}₹${round(abs.div(1e3), 1).toString()}K`;
  return `${sign}₹${round(abs, 0).toString()}`;
}

/** Quantity with Indian grouping and trailing zeros trimmed: 1234.5 -> "1,234.5". */
export function formatQty(value: DecimalLike, dp = 3): string {
  const d = round(value, dp);
  const negative = d.isNegative() && !d.isZero();
  const [intPart, frac] = d.abs().toString().split(".");
  return (negative ? "-" : "") + groupIndian(intPart) + (frac ? "." + frac : "");
}

/** Signed percentage for display: +5.00%, -6.00%. */
export function formatPct(value: DecimalLike, dp = 2, signed = true): string {
  const d = round(value, dp);
  const s = d.toFixed(dp);
  return (signed && d.gt(0) ? "+" : "") + s + "%";
}
