import { D, Dec, round2, sum } from "@/lib/decimal";
import { convertQuantity } from "@/lib/units";
import { prisma } from "../db";

/** Standard material cost of a BOM version at current weighted-average rates (and at its activation snapshot). */
export async function bomVersionCosting(versionId: string) {
  const v = await prisma.bomVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { items: { include: { item: { include: { unit: true, balance: true } }, unit: true }, orderBy: { sortOrder: "asc" } }, bom: { include: { product: { include: { item: true } } } } },
  });
  const lines = v.items.map((l) => {
    const stockQty = convertQuantity(l.quantity, l.unit, l.item.unit);
    const currentRate = D(l.item.balance?.avgCost ?? 0);
    const snapshotRate = l.standardRate ? D(l.standardRate) : null;
    return {
      id: l.id,
      itemId: l.itemId,
      itemName: l.item.name,
      kind: l.item.kind,
      quantity: D(l.quantity),
      unit: l.unit.code,
      unitId: l.unitId,
      stockQty,
      stockUnit: l.item.unit.code,
      currentRate,
      snapshotRate,
      currentCost: round2(stockQty.times(currentRate)),
      snapshotCost: snapshotRate ? round2(stockQty.times(snapshotRate)) : null,
      onHand: D(l.item.balance?.quantity ?? 0),
    };
  });
  const currentTotal = sum(lines.map((l) => l.currentCost));
  const expected = D(v.batchSize).times(D(v.expectedYieldPct)).div(100);
  return {
    version: v,
    lines,
    currentTotal,
    perUnitCurrent: expected.gt(0) ? currentTotal.div(expected) : new Dec(0),
    snapshotTotal: v.standardMaterialCost ? D(v.standardMaterialCost) : null,
    rawTotal: sum(lines.filter((l) => l.kind === "RAW_MATERIAL").map((l) => l.currentCost)),
    packTotal: sum(lines.filter((l) => l.kind === "PACKAGING_MATERIAL").map((l) => l.currentCost)),
  };
}
