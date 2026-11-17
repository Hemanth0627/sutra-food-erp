import { D } from "@/lib/decimal";
import { stateName } from "@/lib/gstin";
import { audit, type Actor } from "../audit";
import { withTransaction } from "../db";
import { badRequest, notFound } from "../errors";
import { postMovement, reconcileInventory } from "../inventory";
import { nextDocumentNumber } from "../sequence";

/**
 * Authorised stock adjustment workflow (physical-count corrections, damage write-offs).
 * Balances are never overwritten: an adjustment is a ledger movement with a mandatory reason,
 * an adjustment number and an audit entry. Decreases cannot take stock below zero.
 */
export async function adjustStock(
  actor: Actor,
  input: { itemId: string; type: "STOCK_ADJUSTMENT" | "DAMAGED_MATERIAL"; direction: "INCREASE" | "DECREASE"; quantity: string; unitCost?: string; reason: string },
) {
  if (input.type === "DAMAGED_MATERIAL" && input.direction === "INCREASE") throw badRequest("Damage write-offs can only decrease stock");
  return withTransaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id: input.itemId }, include: { unit: true } });
    if (!item) throw notFound("Item");
    const qty = D(input.quantity);
    const signed = input.direction === "INCREASE" ? qty : qty.negated();
    const now = new Date();
    const { number } = await nextDocumentNumber(tx, "ADJ", now);
    const adj = await tx.stockAdjustment.create({
      data: { adjustmentNo: number, itemId: item.id, movementType: input.type, quantityChange: signed.toFixed(), reason: input.reason, createdById: actor.id },
    });
    await postMovement(tx, {
      itemId: item.id,
      movementType: input.type,
      quantity: signed,
      unitCost: input.direction === "INCREASE" && input.unitCost !== undefined ? input.unitCost : undefined,
      sourceType: "ADJUSTMENT",
      sourceId: adj.id,
      sourceLineId: item.id,
      sourceRef: number,
      txnDate: now,
      userId: actor.id,
      notes: input.reason,
    });
    await audit(tx, actor, "stock.adjust", "Item", item.id, `${number}: ${input.direction === "INCREASE" ? "+" : "−"}${qty.toFixed()} ${item.unit.code} ${item.name} (${input.type === "DAMAGED_MATERIAL" ? "damage" : "adjustment"}): ${input.reason}`);
    return adj;
  });
}

export async function getReconciliation() {
  return withTransaction((tx) => reconcileInventory(tx));
}

export async function updateSettings(
  actor: Actor,
  input: {
    legalName: string; tradeName: string; gstin: string; addressLine1: string; addressLine2?: string; city: string;
    stateCode: string; pincode: string; phone?: string; email?: string; bankDetails?: string; varianceTolerancePct: string;
  },
) {
  if (input.gstin.slice(0, 2) !== input.stateCode) throw badRequest("Seller GSTIN state code must match the factory state");
  return withTransaction(async (tx) => {
    const before = await tx.companySettings.findUniqueOrThrow({ where: { id: 1 } });
    const after = await tx.companySettings.update({
      where: { id: 1 },
      data: {
        legalName: input.legalName,
        tradeName: input.tradeName,
        gstin: input.gstin,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: stateName(input.stateCode),
        stateCode: input.stateCode,
        pincode: input.pincode,
        phone: input.phone ?? null,
        email: input.email ?? null,
        bankDetails: input.bankDetails ?? null,
        varianceTolerancePct: input.varianceTolerancePct,
      },
    });
    await audit(tx, actor, "settings.update", "CompanySettings", "1", "Updated company settings", {
      before: { gstin: before.gstin, varianceTolerancePct: before.varianceTolerancePct.toString() },
      after: { gstin: after.gstin, varianceTolerancePct: after.varianceTolerancePct.toString() },
    });
    return after;
  });
}
