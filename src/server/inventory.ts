import type { MovementType, SourceType } from "@prisma/client";
import { D, Dec, DecimalLike, round3, round6 } from "@/lib/decimal";
import { applyIssue, applyReceipt, averageCost, type StockPosition } from "@/lib/valuation";
import type { Tx } from "./db";
import { badRequest, InsufficientStockError, type StockShortage } from "./errors";

/**
 * The only code path that changes stock.
 *
 * Every movement: (1) row-locks the item's InventoryBalance (SELECT … FOR UPDATE), (2) computes the
 * weighted-average valuation, (3) appends an InventoryTransaction with before/after balances and
 * (4) updates the balance cache, all inside the caller's transaction. The ledger has a unique key on
 * (sourceType, sourceId, sourceLineId, movementType) so a document line can never post twice, and a
 * DB trigger makes the ledger append-only.
 */

export interface MovementInput {
  itemId: string;
  movementType: MovementType;
  /** Signed quantity in the item's stock unit: + receipt, − issue. */
  quantity: DecimalLike;
  /** Rate per stock unit for receipts. Omit to value a receipt at the current average (returns). */
  unitCost?: DecimalLike;
  sourceType: SourceType;
  sourceId: string;
  sourceLineId: string;
  sourceRef: string;
  txnDate: Date;
  userId: string;
  batchNo?: string | null;
  expiryDate?: Date | null;
  notes?: string | null;
}

export interface MovementResult {
  transactionId: string;
  quantity: Dec;
  valueChange: Dec;
  unitCost: Dec;
  balanceAfter: Dec;
}

const fx = (d: Dec) => d.toFixed();

export async function lockBalance(tx: Tx, itemId: string): Promise<StockPosition> {
  await tx.$executeRaw`
    INSERT INTO "InventoryBalance" ("itemId", "quantity", "value", "avgCost", "updatedAt")
    VALUES (${itemId}, 0, 0, 0, now())
    ON CONFLICT ("itemId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ quantity: unknown; value: unknown }[]>`
    SELECT "quantity", "value" FROM "InventoryBalance" WHERE "itemId" = ${itemId} FOR UPDATE`;
  if (rows.length === 0) throw badRequest(`Unknown item ${itemId}`);
  return { quantity: D(String(rows[0].quantity)), value: D(String(rows[0].value)) };
}

/** Locks several balances in a stable order (prevents deadlocks between concurrent postings). */
export async function lockBalances(tx: Tx, itemIds: string[]): Promise<Map<string, StockPosition>> {
  const unique = [...new Set(itemIds)].sort();
  const map = new Map<string, StockPosition>();
  for (const id of unique) map.set(id, await lockBalance(tx, id));
  return map;
}

/**
 * Validates that every requirement can be met from current stock. Aggregates per item and reports
 * every shortage at once.
 */
export async function assertAvailable(tx: Tx, requirements: { itemId: string; quantity: DecimalLike }[]) {
  const needed = new Map<string, Dec>();
  for (const r of requirements) {
    const q = D(r.quantity);
    if (q.lte(0)) continue;
    needed.set(r.itemId, (needed.get(r.itemId) ?? new Dec(0)).plus(q));
  }
  if (needed.size === 0) return;
  const balances = await lockBalances(tx, [...needed.keys()]);
  const short: { itemId: string; required: Dec; available: Dec }[] = [];
  for (const [itemId, required] of needed) {
    const available = balances.get(itemId)!.quantity;
    if (required.gt(available)) short.push({ itemId, required, available });
  }
  if (short.length) throw await shortageError(tx, short);
}

async function shortageError(tx: Tx, short: { itemId: string; required: Dec; available: Dec }[]) {
  const items = await tx.item.findMany({ where: { id: { in: short.map((s) => s.itemId) } }, include: { unit: true } });
  const shortages: StockShortage[] = short.map((s) => {
    const item = items.find((i) => i.id === s.itemId);
    return {
      itemId: s.itemId,
      itemName: item?.name ?? s.itemId,
      unit: item?.unit.code ?? "",
      required: round3(s.required).toString(),
      available: round3(s.available).toString(),
      shortage: round3(s.required.minus(s.available)).toString(),
    };
  });
  return new InsufficientStockError(shortages);
}

export async function postMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  const quantity = round3(input.quantity);
  if (quantity.isZero()) throw badRequest("Stock movement quantity cannot be zero");
  const before = await lockBalance(tx, input.itemId);

  let valuation;
  if (quantity.gt(0)) {
    const rate = input.unitCost !== undefined ? D(input.unitCost) : averageCost(before);
    valuation = applyReceipt(before, quantity, rate);
  } else {
    const issueQty = quantity.abs();
    if (issueQty.gt(before.quantity)) {
      throw await shortageError(tx, [{ itemId: input.itemId, required: issueQty, available: before.quantity }]);
    }
    valuation = applyIssue(before, issueQty);
  }

  const txn = await tx.inventoryTransaction.create({
    data: {
      itemId: input.itemId,
      movementType: input.movementType,
      quantity: fx(quantity),
      unitCost: fx(round6(valuation.unitCost)),
      value: fx(valuation.valueChange),
      balanceBefore: fx(before.quantity),
      balanceAfter: fx(valuation.after.quantity),
      valueBefore: fx(before.value),
      valueAfter: fx(valuation.after.value),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceLineId: input.sourceLineId,
      sourceRef: input.sourceRef,
      batchNo: input.batchNo ?? null,
      expiryDate: input.expiryDate ?? null,
      txnDate: input.txnDate,
      notes: input.notes ?? null,
      createdById: input.userId,
    },
  });

  await tx.inventoryBalance.update({
    where: { itemId: input.itemId },
    data: {
      quantity: fx(valuation.after.quantity),
      value: fx(valuation.after.value),
      avgCost: fx(valuation.avgCostAfter),
      lastTransactionId: txn.id,
    },
  });

  return {
    transactionId: txn.id,
    quantity,
    valueChange: valuation.valueChange,
    unitCost: valuation.unitCost,
    balanceAfter: valuation.after.quantity,
  };
}

export interface ReconciliationRow {
  itemId: string;
  code: string;
  name: string;
  balanceQty: string;
  ledgerQty: string;
  balanceValue: string;
  ledgerValue: string;
  matches: boolean;
}

/** Compares the balance cache with SUM(ledger) for every item. */
export async function reconcileInventory(tx: Tx): Promise<ReconciliationRow[]> {
  const rows = await tx.$queryRaw<
    { itemId: string; code: string; name: string; bq: unknown; lq: unknown; bv: unknown; lv: unknown }[]
  >`
    SELECT i."id" AS "itemId", i."code", i."name",
           COALESCE(b."quantity", 0) AS bq, COALESCE(SUM(t."quantity"), 0) AS lq,
           COALESCE(b."value", 0) AS bv, COALESCE(SUM(t."value"), 0) AS lv
    FROM "Item" i
    LEFT JOIN "InventoryBalance" b ON b."itemId" = i."id"
    LEFT JOIN "InventoryTransaction" t ON t."itemId" = i."id"
    GROUP BY i."id", i."code", i."name", b."quantity", b."value"
    ORDER BY i."code"`;
  return rows.map((r) => {
    const bq = D(String(r.bq)), lq = D(String(r.lq)), bv = D(String(r.bv)), lv = D(String(r.lv));
    return {
      itemId: r.itemId,
      code: r.code,
      name: r.name,
      balanceQty: bq.toFixed(3),
      ledgerQty: lq.toFixed(3),
      balanceValue: bv.toFixed(4),
      ledgerValue: lv.toFixed(4),
      matches: bq.eq(lq) && bv.eq(lv),
    };
  });
}
