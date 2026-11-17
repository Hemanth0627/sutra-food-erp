import { D, Dec, DecimalLike, round4, round6 } from "./decimal";

/**
 * Weighted-average (moving average) inventory valuation.
 *
 * Receipt: newValue = value + qty × rate; avg = newValue / newQty.
 * Issue:   issued at the current average. To avoid rounding residue the issue value is computed
 *          proportionally (value × issueQty / balanceQty); issuing the entire balance takes the
 *          entire value.
 */
export interface StockPosition {
  quantity: Dec;
  value: Dec;
}

export interface ValuationResult {
  /** Signed value change of this movement (+ receipt, − issue). */
  valueChange: Dec;
  /** Rate applied to this movement (per stock unit). */
  unitCost: Dec;
  after: StockPosition;
  avgCostAfter: Dec;
}

export function averageCost(position: StockPosition): Dec {
  if (position.quantity.lte(0)) return new Dec(0);
  return round6(position.value.div(position.quantity));
}

export function position(quantity: DecimalLike, value: DecimalLike): StockPosition {
  return { quantity: D(quantity), value: D(value) };
}

export function applyReceipt(before: StockPosition, quantity: DecimalLike, unitCost: DecimalLike): ValuationResult {
  const q = D(quantity);
  if (q.lte(0)) throw new Error("Receipt quantity must be positive");
  const rate = D(unitCost);
  if (rate.isNegative()) throw new Error("Unit cost must not be negative");
  const valueChange = round4(q.times(rate));
  const after = { quantity: before.quantity.plus(q), value: before.value.plus(valueChange) };
  return { valueChange, unitCost: rate, after, avgCostAfter: averageCost(after) };
}

export function applyIssue(before: StockPosition, quantity: DecimalLike): ValuationResult {
  const q = D(quantity);
  if (q.lte(0)) throw new Error("Issue quantity must be positive");
  if (q.gt(before.quantity)) {
    throw new Error(`Issue of ${q.toString()} exceeds available ${before.quantity.toString()}`);
  }
  const isFullIssue = q.eq(before.quantity);
  const issueValue = isFullIssue ? before.value : round4(before.value.times(q).div(before.quantity));
  const after = { quantity: before.quantity.minus(q), value: before.value.minus(issueValue) };
  return {
    valueChange: issueValue.negated(),
    unitCost: averageCost(before),
    after,
    avgCostAfter: isFullIssue ? new Dec(0) : averageCost(after),
  };
}
