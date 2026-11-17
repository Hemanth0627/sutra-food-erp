import { D, Dec, DecimalLike, pctChange, pctOf, round, round2, round3, sum } from "./decimal";
import { convertQuantity, UnitDef } from "./units";

/**
 * BOM explosion, production variance and run costing. Pure functions shared by the production
 * service, the UI previews and the automated benchmark tests.
 */

export interface BomLineInput {
  itemId: string;
  quantity: DecimalLike; // per batch, in `unit`
  unit: UnitDef; // unit the BOM line is written in
  stockUnit: UnitDef; // item's stock unit
}

/** Standard requirement in the item's stock unit for the given number of batches. */
export function explodeBomLine(line: BomLineInput, batches: DecimalLike): Dec {
  const perBatch = convertQuantity(line.quantity, line.unit, line.stockUnit);
  return round3(perBatch.times(D(batches)));
}

export function plannedOutput(batchSize: DecimalLike, batches: DecimalLike): Dec {
  return round3(D(batchSize).times(D(batches)));
}

export function expectedOutput(batchSize: DecimalLike, batches: DecimalLike, expectedYieldPct: DecimalLike): Dec {
  return round3(plannedOutput(batchSize, batches).times(D(expectedYieldPct)).div(100));
}

/** Consumption variance %: (actual − standard) / standard × 100. Oil: (10.5 − 10) / 10 = +5%. */
export function consumptionVariancePct(actual: DecimalLike, standard: DecimalLike): Dec {
  return pctChange(actual, standard, 3);
}

/** Yield variance %: (actual good − expected) / expected × 100. 188 vs 200 = −6%. */
export function yieldVariancePct(actualGood: DecimalLike, expected: DecimalLike): Dec {
  return pctChange(actualGood, expected, 3);
}

/** Actual yield % of the planned batch output: 188 / 200 = 94%. */
export function actualYieldPct(actualGood: DecimalLike, planned: DecimalLike): Dec {
  return pctOf(actualGood, planned, 3);
}

export function exceedsTolerance(variancePct: DecimalLike, tolerancePct: DecimalLike): boolean {
  return D(variancePct).abs().gt(D(tolerancePct));
}

export interface CostingInput {
  /** Material lines valued at weighted-average cost at issue time (ledger issue values). */
  rawMaterialValues: DecimalLike[];
  packagingValues: DecimalLike[];
  labour: DecimalLike;
  energy: DecimalLike;
  otherOverhead: DecimalLike;
  goodOutput: DecimalLike;
  sellingPrice: DecimalLike;
}

export interface CostingResult {
  materialCost: Dec;
  packagingCost: Dec;
  labourCost: Dec;
  energyCost: Dec;
  overheadCost: Dec;
  totalCost: Dec;
  costPerUnit: Dec; // 4 dp
  sellingPrice: Dec;
  grossMarginPerUnit: Dec; // 4 dp
  marginPct: Dec; // 3 dp
}

/**
 * Run costing (absorption of direct material, packaging, labour, energy and overheads into the
 * good output). Damaged packaging is part of packagingValues, so its cost is carried by good units.
 */
export function computeRunCosting(input: CostingInput): CostingResult {
  const materialCost = round2(sum(input.rawMaterialValues));
  const packagingCost = round2(sum(input.packagingValues));
  const labourCost = round2(input.labour);
  const energyCost = round2(input.energy);
  const overheadCost = round2(input.otherOverhead);
  const totalCost = materialCost.plus(packagingCost).plus(labourCost).plus(energyCost).plus(overheadCost);
  const good = D(input.goodOutput);
  const costPerUnit = good.gt(0) ? round(totalCost.div(good), 4) : new Dec(0);
  const sellingPrice = round2(input.sellingPrice);
  const grossMarginPerUnit = round(sellingPrice.minus(costPerUnit), 4);
  const marginPct = sellingPrice.gt(0) ? round(grossMarginPerUnit.div(sellingPrice).times(100), 3) : new Dec(0);
  return { materialCost, packagingCost, labourCost, energyCost, overheadCost, totalCost, costPerUnit, sellingPrice, grossMarginPerUnit, marginPct };
}

/**
 * Allocates a period overhead across runs in proportion to good output (OUTPUT_QUANTITY method).
 * Rounds each share to the paisa and gives the rounding remainder to the largest run, so the
 * allocations always add up exactly to the expense amount.
 */
export function allocateByOutput(amount: DecimalLike, runs: { runId: string; goodOutput: DecimalLike }[]) {
  const total = D(amount);
  const basis = sum(runs.map((r) => r.goodOutput));
  if (runs.length === 0 || basis.lte(0)) return [];
  const shares = runs.map((r) => ({ runId: r.runId, basisQty: D(r.goodOutput), amount: round2(total.times(D(r.goodOutput)).div(basis)) }));
  const allocated = sum(shares.map((s) => s.amount));
  const remainder = total.minus(allocated);
  if (!remainder.isZero()) {
    const largest = shares.reduce((a, b) => (b.basisQty.gt(a.basisQty) ? b : a));
    largest.amount = largest.amount.plus(remainder);
  }
  return shares;
}

export const ENERGY_CATEGORIES = ["GAS", "ELECTRICITY", "GAS_AND_POWER"] as const;
