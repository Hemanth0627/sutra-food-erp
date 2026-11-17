import { D, Dec, DecimalLike, round, round2, sum } from "./decimal";

/**
 * GST computation for outward supplies (demonstration of the Indian GST rules, not a filing tool).
 *
 * - Intra-state supply (seller state == place of supply): CGST = SGST = GST rate / 2.
 * - Inter-state supply: IGST = full GST rate.
 * - Tax is computed per line on the taxable value and rounded half-up to the paisa; invoice totals
 *   are sums of line amounts. The grand total is rounded to the nearest rupee and the difference is
 *   shown as "Round off".
 */
export type SupplyType = "INTRA_STATE" | "INTER_STATE";

export function supplyTypeFor(sellerStateCode: string, placeOfSupplyCode: string): SupplyType {
  return sellerStateCode === placeOfSupplyCode ? "INTRA_STATE" : "INTER_STATE";
}

export interface TaxLineInput {
  quantity: DecimalLike;
  rate: DecimalLike;
  gstRate: DecimalLike;
}

export interface TaxLine {
  quantity: Dec;
  rate: Dec;
  taxableValue: Dec;
  gstRate: Dec;
  cgstRate: Dec;
  sgstRate: Dec;
  igstRate: Dec;
  cgstAmount: Dec;
  sgstAmount: Dec;
  igstAmount: Dec;
  lineTotal: Dec;
}

export function computeTaxLine(input: TaxLineInput, supplyType: SupplyType): TaxLine {
  const quantity = D(input.quantity);
  const rate = D(input.rate);
  const gstRate = D(input.gstRate);
  if (quantity.isNegative() || rate.isNegative() || gstRate.isNegative()) {
    throw new Error("Quantity, rate and GST rate must not be negative");
  }
  const taxableValue = round2(quantity.times(rate));
  const zero = new Dec(0);
  let cgstRate = zero, sgstRate = zero, igstRate = zero;
  let cgstAmount = zero, sgstAmount = zero, igstAmount = zero;
  if (supplyType === "INTRA_STATE") {
    cgstRate = round(gstRate.div(2), 3);
    sgstRate = round(gstRate.div(2), 3);
    cgstAmount = round2(taxableValue.times(cgstRate).div(100));
    sgstAmount = round2(taxableValue.times(sgstRate).div(100));
  } else {
    igstRate = gstRate;
    igstAmount = round2(taxableValue.times(igstRate).div(100));
  }
  const lineTotal = taxableValue.plus(cgstAmount).plus(sgstAmount).plus(igstAmount);
  return { quantity, rate, taxableValue, gstRate, cgstRate, sgstRate, igstRate, cgstAmount, sgstAmount, igstAmount, lineTotal };
}

export interface InvoiceTotals {
  taxableTotal: Dec;
  cgstTotal: Dec;
  sgstTotal: Dec;
  igstTotal: Dec;
  taxTotal: Dec;
  totalBeforeRoundOff: Dec;
  roundOff: Dec;
  grandTotal: Dec;
}

export function computeInvoiceTotals(lines: TaxLine[]): InvoiceTotals {
  const taxableTotal = sum(lines.map((l) => l.taxableValue));
  const cgstTotal = sum(lines.map((l) => l.cgstAmount));
  const sgstTotal = sum(lines.map((l) => l.sgstAmount));
  const igstTotal = sum(lines.map((l) => l.igstAmount));
  const taxTotal = cgstTotal.plus(sgstTotal).plus(igstTotal);
  const totalBeforeRoundOff = taxableTotal.plus(taxTotal);
  const grandTotal = round(totalBeforeRoundOff, 0);
  const roundOff = grandTotal.minus(totalBeforeRoundOff);
  return { taxableTotal, cgstTotal, sgstTotal, igstTotal, taxTotal, totalBeforeRoundOff, roundOff, grandTotal };
}

/** Convenience: tax a set of lines for a seller/place-of-supply pair. */
export function computeInvoice(lines: TaxLineInput[], sellerStateCode: string, placeOfSupplyCode: string) {
  const supplyType = supplyTypeFor(sellerStateCode, placeOfSupplyCode);
  const taxLines = lines.map((l) => computeTaxLine(l, supplyType));
  return { supplyType, lines: taxLines, totals: computeInvoiceTotals(taxLines) };
}

/** Amount in words (Indian numbering) for invoices: "Seven Thousand Eight Hundred Seventy Five Rupees Only". */
export function amountInWords(value: DecimalLike): string {
  const amount = round2(value);
  const rupees = amount.trunc();
  const paise = amount.minus(rupees).times(100).toNumber();
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number): string => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`);
  const three = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return [h ? `${ones[h]} Hundred` : "", r ? two(r) : ""].filter(Boolean).join(" ");
  };
  const words = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(" ");
  };
  const r = words(rupees.toNumber());
  const p = Math.round(paise);
  return `${r} Rupees${p ? ` and ${two(p)} Paise` : ""} Only`;
}
