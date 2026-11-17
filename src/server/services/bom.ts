import { D, round2, sum } from "@/lib/decimal";
import { canConvert, convertQuantity } from "@/lib/units";
import type { BomVersionInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { withTransaction, type Tx } from "../db";
import { badRequest, conflict, notFound } from "../errors";

/**
 * BOM versioning rules
 * - A BOM (recipe) belongs to one finished product and has numbered versions.
 * - Only DRAFT versions can be edited. Activating a draft archives the previous ACTIVE version and
 *   snapshots weighted-average rates as the standard cost.
 * - "Editing" an active BOM means creating a new draft version (copied from the active one).
 * - Production runs store bomVersionId, so later recipe changes never alter historical runs.
 */

async function validateLines(tx: Tx, input: BomVersionInput) {
  const ids = input.items.map((i) => i.itemId);
  if (new Set(ids).size !== ids.length) throw badRequest("Each material can appear only once in a BOM version");
  const items = await tx.item.findMany({ where: { id: { in: ids } }, include: { unit: true } });
  const units = await tx.unit.findMany({ where: { id: { in: input.items.map((i) => i.unitId) } } });
  for (const line of input.items) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) throw notFound("BOM material");
    if (item.kind === "FINISHED_GOOD") throw badRequest(`${item.name} is a finished good; BOM lines must be raw or packaging materials`);
    const unit = units.find((u) => u.id === line.unitId);
    if (!unit) throw notFound("Unit");
    if (!canConvert(unit, item.unit)) throw badRequest(`${item.name} is stocked in ${item.unit.code}; ${unit.code} is not convertible`);
  }
}

export async function createBom(
  actor: Actor,
  header: { productId: string; name: string; code: string },
  version: BomVersionInput,
  options: { activate?: boolean } = {},
) {
  const bomId = await withTransaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: header.productId }, include: { item: true } });
    if (!product) throw notFound("Product");
    if (await tx.bom.findUnique({ where: { code: header.code } })) throw conflict(`BOM code ${header.code} already exists`);
    await validateLines(tx, version);
    const bom = await tx.bom.create({ data: { code: header.code, name: header.name, productId: product.id } });
    const v = await tx.bomVersion.create({
      data: {
        bomId: bom.id,
        versionNo: 1,
        status: "DRAFT",
        batchSize: version.batchSize,
        expectedYieldPct: version.expectedYieldPct,
        notes: version.notes ?? null,
        createdById: actor.id,
        items: { create: version.items.map((i, idx) => ({ itemId: i.itemId, unitId: i.unitId, quantity: i.quantity, notes: i.notes ?? null, sortOrder: idx })) },
      },
    });
    await audit(tx, actor, "bom.create", "Bom", bom.id, `Created BOM ${bom.code} for ${product.item.name} (v1 draft)`, { versionId: v.id });
    return bom.id;
  });
  if (options.activate) {
    const draft = await withTransaction((tx) => tx.bomVersion.findFirstOrThrow({ where: { bomId, versionNo: 1 } }));
    await activateBomVersion(actor, draft.id);
  }
  return bomId;
}

/** Creates the next version as a DRAFT (the "edit" action on an active BOM). */
export async function createBomVersion(actor: Actor, bomId: string, version: BomVersionInput) {
  return withTransaction(async (tx) => {
    const bom = await tx.bom.findUnique({ where: { id: bomId }, include: { versions: true } });
    if (!bom) throw notFound("BOM");
    if (bom.versions.some((v) => v.status === "DRAFT")) throw conflict("This BOM already has a draft version; edit or activate it first");
    await validateLines(tx, version);
    const versionNo = Math.max(0, ...bom.versions.map((v) => v.versionNo)) + 1;
    const v = await tx.bomVersion.create({
      data: {
        bomId,
        versionNo,
        status: "DRAFT",
        batchSize: version.batchSize,
        expectedYieldPct: version.expectedYieldPct,
        notes: version.notes ?? null,
        createdById: actor.id,
        items: { create: version.items.map((i, idx) => ({ itemId: i.itemId, unitId: i.unitId, quantity: i.quantity, notes: i.notes ?? null, sortOrder: idx })) },
      },
    });
    await audit(tx, actor, "bom.version.create", "BomVersion", v.id, `Created draft v${versionNo} of BOM ${bom.code}`);
    return v;
  });
}

export async function updateDraftBomVersion(actor: Actor, versionId: string, version: BomVersionInput) {
  return withTransaction(async (tx) => {
    const v = await tx.bomVersion.findUnique({ where: { id: versionId }, include: { bom: true } });
    if (!v) throw notFound("BOM version");
    if (v.status !== "DRAFT") throw conflict("Only draft versions can be edited. Create a new version instead.");
    await validateLines(tx, version);
    await tx.bomItem.deleteMany({ where: { bomVersionId: versionId } });
    const updated = await tx.bomVersion.update({
      where: { id: versionId },
      data: {
        batchSize: version.batchSize,
        expectedYieldPct: version.expectedYieldPct,
        notes: version.notes ?? null,
        items: { create: version.items.map((i, idx) => ({ itemId: i.itemId, unitId: i.unitId, quantity: i.quantity, notes: i.notes ?? null, sortOrder: idx })) },
      },
    });
    await audit(tx, actor, "bom.version.update", "BomVersion", versionId, `Edited draft v${v.versionNo} of BOM ${v.bom.code}`);
    return updated;
  });
}

export async function activateBomVersion(actor: Actor, versionId: string) {
  return withTransaction(async (tx) => {
    const v = await tx.bomVersion.findUnique({
      where: { id: versionId },
      include: { bom: true, items: { include: { item: { include: { unit: true, balance: true } }, unit: true } } },
    });
    if (!v) throw notFound("BOM version");
    if (v.status !== "DRAFT") throw conflict(`Version ${v.versionNo} is ${v.status.toLowerCase()} and cannot be activated`);
    if (v.items.length === 0) throw badRequest("Add materials before activating");

    const now = new Date();
    await tx.bomVersion.updateMany({ where: { bomId: v.bomId, status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: now } });

    const costs = [];
    for (const line of v.items) {
      const rate = D(line.item.balance?.avgCost ?? 0);
      const stockQty = convertQuantity(line.quantity, line.unit, line.item.unit);
      costs.push(round2(stockQty.times(rate)));
      await tx.bomItem.update({ where: { id: line.id }, data: { standardRate: rate.toFixed() } });
    }
    const standardMaterialCost = sum(costs);
    const activated = await tx.bomVersion.update({
      where: { id: versionId },
      data: { status: "ACTIVE", activatedAt: now, standardMaterialCost: standardMaterialCost.toFixed(2) },
    });
    await audit(tx, actor, "bom.version.activate", "BomVersion", versionId, `Activated v${v.versionNo} of BOM ${v.bom.code}; standard material cost ₹${standardMaterialCost.toFixed(2)} per batch`);
    return activated;
  });
}
