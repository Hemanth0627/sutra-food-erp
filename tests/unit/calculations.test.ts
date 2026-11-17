import { describe, expect, it } from "vitest";
import { D, formatINR, formatIndian, formatQty, round2, sum } from "@/lib/decimal";
import { amountInWords, computeInvoice, computeInvoiceTotals, computeTaxLine, supplyTypeFor } from "@/lib/gst";
import { gstinCheckChar, makeDemoGstin, validateGstin } from "@/lib/gstin";
import {
  actualYieldPct,
  allocateByOutput,
  computeRunCosting,
  consumptionVariancePct,
  exceedsTolerance,
  expectedOutput,
  explodeBomLine,
  plannedOutput,
  yieldVariancePct,
} from "@/lib/production";
import { convertQuantity, convertRate, STANDARD_UNITS, UnitConversionError } from "@/lib/units";
import { applyIssue, applyReceipt, averageCost, position } from "@/lib/valuation";
import { financialYear } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";

const unit = (code: string) => STANDARD_UNITS.find((u) => u.code === code)!;

describe("exact decimal money", () => {
  it("avoids floating point drift", () => {
    expect(sum(["0.1", "0.2"]).toFixed(2)).toBe("0.30");
    expect(D("0.1").plus("0.2").eq("0.3")).toBe(true);
  });
  it("rounds half-up to the paisa", () => {
    expect(round2("187.495").toFixed(2)).toBe("187.50");
    expect(round2("2.005").toFixed(2)).toBe("2.01");
  });
  it("formats rupees with Indian digit grouping", () => {
    expect(formatINR("7875")).toBe("₹7,875.00");
    expect(formatINR("1234567.5")).toBe("₹12,34,567.50");
    expect(formatIndian("-3875")).toBe("-3,875.00");
    expect(formatQty("19.500")).toBe("19.5");
  });
});

describe("unit conversions", () => {
  it("converts mass, volume and counts within a dimension", () => {
    expect(convertQuantity("1200", unit("G"), unit("KG")).toString()).toBe("1.2");
    expect(convertQuantity("60000", unit("G"), unit("KG")).toString()).toBe("60");
    expect(convertQuantity("500", unit("ML"), unit("L")).toString()).toBe("0.5");
    expect(convertQuantity("10.5", unit("L"), unit("ML")).toString()).toBe("10500");
    expect(convertQuantity("200", unit("PCS"), unit("PKT")).toString()).toBe("200");
  });
  it("converts rates inversely to quantities", () => {
    expect(convertRate("45", unit("KG"), unit("G")).toString()).toBe("0.045");
    expect(convertRate("0.14", unit("ML"), unit("L")).toString()).toBe("140");
  });
  it("rejects conversions across dimensions", () => {
    expect(() => convertQuantity("1", unit("KG"), unit("L"))).toThrow(UnitConversionError);
  });
});

describe("weighted-average inventory valuation (benchmark flour)", () => {
  it("revalues flour after the ₹45 purchase to ₹43.125/kg", () => {
    const opening = applyReceipt(position(0, 0), "100", "42");
    expect(opening.after.value.toFixed(2)).toBe("4200.00");
    const afterPurchase = applyReceipt(opening.after, "60", "45");
    expect(afterPurchase.after.quantity.toString()).toBe("160");
    expect(afterPurchase.after.value.toFixed(2)).toBe("6900.00");
    expect(afterPurchase.avgCostAfter.toString()).toBe("43.125");
  });
  it("issues at the average cost and keeps the average", () => {
    const before = position("160", "6900");
    const issue = applyIssue(before, "40");
    expect(issue.valueChange.toFixed(2)).toBe("-1725.00");
    expect(issue.unitCost.toString()).toBe("43.125");
    expect(issue.after.quantity.toString()).toBe("120");
    expect(averageCost(issue.after).toString()).toBe("43.125");
  });
  it("values oil, spice and packaging issues exactly", () => {
    expect(applyIssue(position("30", "4200"), "10.5").valueChange.toFixed(2)).toBe("-1470.00");
    expect(applyIssue(position("5", "1000"), "1.2").valueChange.toFixed(2)).toBe("-240.00");
    expect(applyIssue(position("500", "1250"), "194").valueChange.toFixed(2)).toBe("-485.00");
    expect(applyIssue(position("30", "450"), "9").valueChange.toFixed(2)).toBe("-135.00");
  });
  it("takes the entire value when the whole balance is issued and refuses to go negative", () => {
    const p = position("3", "100");
    expect(applyIssue(p, "3").after.value.toString()).toBe("0");
    expect(() => applyIssue(p, "3.001")).toThrow();
  });
});

describe("BOM explosion and production variance", () => {
  const line = (qty: string, u: string, stock: string) => ({ itemId: "x", quantity: qty, unit: unit(u), stockUnit: unit(stock) });
  it("explodes BOM lines to stock units for the planned batches", () => {
    expect(explodeBomLine(line("40", "KG", "KG"), "1").toString()).toBe("40");
    expect(explodeBomLine(line("1500", "G", "KG"), "1").toString()).toBe("1.5");
    expect(explodeBomLine(line("1.2", "KG", "KG"), "2.5").toString()).toBe("3");
    expect(plannedOutput("200", "1").toString()).toBe("200");
    expect(expectedOutput("200", "1", "100").toString()).toBe("200");
    expect(expectedOutput("200", "2", "97.5").toString()).toBe("390");
  });
  it("computes the benchmark yield variance (−6%) and oil variance (+5%)", () => {
    expect(yieldVariancePct("188", "200").toString()).toBe("-6");
    expect(actualYieldPct("188", "200").toString()).toBe("94");
    expect(consumptionVariancePct("10.5", "10").toString()).toBe("5");
    expect(consumptionVariancePct("40", "40").toString()).toBe("0");
  });
  it("flags deviations beyond the 3% tolerance (absolute value, strictly greater)", () => {
    expect(exceedsTolerance("-6", "3")).toBe(true);
    expect(exceedsTolerance("5", "3")).toBe(true);
    expect(exceedsTolerance("-3", "3")).toBe(false);
    expect(exceedsTolerance("2.999", "3")).toBe(false);
  });
});

describe("run costing (benchmark 6.4)", () => {
  const costing = computeRunCosting({
    rawMaterialValues: ["1725", "1470", "240"],
    packagingValues: ["485", "135"],
    labour: "1200",
    energy: "600",
    otherOverhead: "0",
    goodOutput: "188",
    sellingPrice: "50",
  });
  it("totals ₹5,855 and ₹31.14 per good packet", () => {
    expect(costing.materialCost.toFixed(2)).toBe("3435.00");
    expect(costing.packagingCost.toFixed(2)).toBe("620.00");
    expect(costing.totalCost.toFixed(2)).toBe("5855.00");
    expect(costing.costPerUnit.toFixed(4)).toBe("31.1436");
    expect(round2(costing.costPerUnit).toFixed(2)).toBe("31.14");
  });
  it("derives margin from the selling price", () => {
    expect(costing.grossMarginPerUnit.toFixed(4)).toBe("18.8564");
    expect(costing.marginPct.toFixed(2)).toBe("37.71");
  });
  it("allocates period overheads by output and never loses a paisa", () => {
    const shares = allocateByOutput("100", [
      { runId: "a", goodOutput: "100" },
      { runId: "b", goodOutput: "100" },
      { runId: "c", goodOutput: "100" },
    ]);
    expect(sum(shares.map((s) => s.amount)).toFixed(2)).toBe("100.00");
    expect(shares.map((s) => s.amount.toFixed(2)).sort()).toEqual(["33.33", "33.33", "33.34"]);
  });
});

describe("GST", () => {
  it("splits CGST/SGST for an intra-state Tamil Nadu sale (Retailer A)", () => {
    const { supplyType, totals } = computeInvoice([{ quantity: "150", rate: "50", gstRate: "5" }], "33", "33");
    expect(supplyType).toBe("INTRA_STATE");
    expect(totals.taxableTotal.toFixed(2)).toBe("7500.00");
    expect(totals.cgstTotal.toFixed(2)).toBe("187.50");
    expect(totals.sgstTotal.toFixed(2)).toBe("187.50");
    expect(totals.igstTotal.toFixed(2)).toBe("0.00");
    expect(totals.grandTotal.toFixed(2)).toBe("7875.00");
    expect(totals.roundOff.toFixed(2)).toBe("0.00");
  });
  it("charges IGST for an inter-state Karnataka sale (Distributor B)", () => {
    expect(supplyTypeFor("33", "29")).toBe("INTER_STATE");
    const full = computeInvoice([{ quantity: "120", rate: "50", gstRate: "5" }], "33", "29");
    expect(full.totals.igstTotal.toFixed(2)).toBe("300.00");
    expect(full.totals.cgstTotal.toFixed(2)).toBe("0.00");
    expect(full.totals.grandTotal.toFixed(2)).toBe("6300.00");
    const partial = computeInvoice([{ quantity: "88", rate: "50", gstRate: "5" }], "33", "29");
    expect(partial.totals.igstTotal.toFixed(2)).toBe("220.00");
    expect(partial.totals.grandTotal.toFixed(2)).toBe("4620.00");
  });
  it("rounds each line half-up and rounds the grand total to the rupee", () => {
    const line = computeTaxLine({ quantity: "3", rate: "33.33", gstRate: "5" }, "INTRA_STATE");
    expect(line.taxableValue.toFixed(2)).toBe("99.99");
    expect(line.cgstAmount.toFixed(2)).toBe("2.50");
    const totals = computeInvoiceTotals([line]);
    expect(totals.totalBeforeRoundOff.toFixed(2)).toBe("104.99");
    expect(totals.grandTotal.toFixed(2)).toBe("105.00");
    expect(totals.roundOff.toFixed(2)).toBe("0.01");
  });
  it("writes amounts in Indian words", () => {
    expect(amountInWords("7875")).toBe("Seven Thousand Eight Hundred Seventy Five Rupees Only");
    expect(amountInWords("125000.50")).toBe("One Lakh Twenty Five Thousand Rupees and Fifty Paise Only");
  });
  it("validates GSTIN format and checksum", () => {
    const g = makeDemoGstin("33", "AAKCT4821M");
    expect(validateGstin(g)).toEqual({ valid: true, stateCode: "33" });
    expect(g[14]).toBe(gstinCheckChar(g.slice(0, 14)));
    const wrong = g.slice(0, 14) + (g[14] === "A" ? "B" : "A");
    expect(validateGstin(wrong).valid).toBe(false);
    expect(validateGstin("33ABC").valid).toBe(false);
  });
  it("numbers documents by Indian financial year", () => {
    expect(financialYear(new Date("2026-11-17T10:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T12:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("2027-28"); // 1 Apr 00:30 IST
  });
});

describe("role permissions", () => {
  it("enforces separation of duties", () => {
    expect(hasPermission("SALESMAN", "orders:create")).toBe(true);
    expect(hasPermission("SALESMAN", "orders:approve")).toBe(false);
    expect(hasPermission("SALESMAN", "invoices:view")).toBe(false);
    expect(hasPermission("ACCOUNTANT", "reports:export")).toBe(true);
    expect(hasPermission("ACCOUNTANT", "invoices:create")).toBe(false);
    expect(hasPermission("ACCOUNTANT", "payments:create")).toBe(false);
    expect(hasPermission("PRODUCTION_SUPERVISOR", "production:manage")).toBe(true);
    expect(hasPermission("PRODUCTION_SUPERVISOR", "invoices:create")).toBe(false);
    expect(hasPermission("ADMIN", "invoices:cancel")).toBe(true);
    expect(hasPermission("OWNER", "dashboard:owner")).toBe(true);
    expect(hasPermission("OWNER", "invoices:create")).toBe(false);
  });
});
