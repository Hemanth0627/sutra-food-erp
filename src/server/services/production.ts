import { D, Dec, round2, round3, sum } from "@/lib/decimal";
import { addDays, isoDateIst } from "@/lib/dates";
import {
  actualYieldPct,
  computeRunCosting,
  consumptionVariancePct,
  ENERGY_CATEGORIES,
  exceedsTolerance,
  expectedOutput,
  explodeBomLine,
  plannedOutput,
  yieldVariancePct,
} from "@/lib/production";
import type { ProductionCompleteInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { withTransaction, type Tx } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { assertAvailable, postMovement } from "../inventory";
import { nextDocumentNumber } from "../sequence";
import { getCompanySettings, parseDateInput } from "./common";

/**
 * Production workflow: PLANNED → IN_PROGRESS (materials issued/recorded) → COMPLETED.
 *
 * Completion is one atomic transaction that validates stock, posts raw-material issues, packaging
 * consumption, damaged material and finished-goods output to the ledger, freezes the costing
 * snapshot and writes the audit trail. A conditional status update (IN_PROGRESS → COMPLETED)
 * guarantees a run can only be completed once.
 */

export async function createProductionRun(
  actor: Actor,
  input: { productId: string; bomVersionId: string; plannedBatches: string; plannedDate: string; notes?: string },
) {
  return withTransaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: input.productId }, include: { item: true } });
    if (!product) throw notFound("Product");
    const version = await tx.bomVersion.findUnique({
      where: { id: input.bomVersionId },
      include: { bom: true, items: { include: { item: { include: { unit: true } }, unit: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!version || version.bom.productId !== product.id) throw badRequest("Select a BOM version that belongs to this product");
    if (version.status !== "ACTIVE") throw badRequest(`BOM v${version.versionNo} is ${version.status.toLowerCase()}; production must use the active version`);

    const plannedDate = parseDateInput(input.plannedDate, new Date());
    const { number } = await nextDocumentNumber(tx, "PR", plannedDate);
    const planned = plannedOutput(version.batchSize, input.plannedBatches);
    const expected = expectedOutput(version.batchSize, input.plannedBatches, version.expectedYieldPct);

    const run = await tx.productionRun.create({
      data: {
        runNo: number,
        productId: product.id,
        bomVersionId: version.id,
        status: "PLANNED",
        plannedBatches: D(input.plannedBatches).toFixed(),
        plannedOutput: planned.toFixed(),
        expectedOutput: expected.toFixed(),
        plannedDate,
        notes: input.notes ?? null,
        createdById: actor.id,
        materials: {
          create: version.items.map((line) => ({
            itemId: line.itemId,
            plannedQty: explodeBomLine(
              { itemId: line.itemId, quantity: line.quantity, unit: line.unit, stockUnit: line.item.unit },
              input.plannedBatches,
            ).toFixed(),
          })),
        },
      },
    });
    await audit(tx, actor, "production.create", "ProductionRun", run.id, `Planned ${number}: ${input.plannedBatches} batch(es) of ${product.item.name} using ${version.bom.code} v${version.versionNo} (expected ${expected.toFixed()} units)`);
    return run;
  });
}

/** Records the quantities issued to the floor and starts the run. Stock is validated now and posted at completion. */
export async function startProductionRun(actor: Actor, runId: string, input: { materials: { itemId: string; actualQty: string }[] }) {
  return withTransaction(async (tx) => {
    const run = await tx.productionRun.findUnique({ where: { id: runId }, include: { materials: true, product: { include: { item: true } } } });
    if (!run) throw notFound("Production run");
    for (const m of input.materials) {
      if (!run.materials.some((rm) => rm.itemId === m.itemId)) throw badRequest("Issued material is not part of this run's BOM");
    }
    await assertAvailable(tx, input.materials.map((m) => ({ itemId: m.itemId, quantity: m.actualQty })));
    const claimed = await tx.productionRun.updateMany({
      where: { id: runId, status: "PLANNED" },
      data: { status: "IN_PROGRESS", startedAt: new Date(), startedById: actor.id },
    });
    if (claimed.count !== 1) throw conflict(`Run ${run.runNo} is ${run.status.toLowerCase().replace("_", " ")} and cannot be started`);
    for (const m of input.materials) {
      await tx.productionMaterial.update({
        where: { runId_itemId: { runId, itemId: m.itemId } },
        data: { actualQty: round3(m.actualQty).toFixed() },
      });
    }
    await audit(tx, actor, "production.start", "ProductionRun", runId, `Started ${run.runNo} (${run.product.item.name}); materials issued to the line`, {
      issued: input.materials,
    });
    return { id: runId };
  });
}

export async function cancelProductionRun(actor: Actor, runId: string, reason: string) {
  return withTransaction(async (tx) => {
    const run = await tx.productionRun.findUnique({ where: { id: runId } });
    if (!run) throw notFound("Production run");
    const res = await tx.productionRun.updateMany({
      where: { id: runId, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      data: { status: "CANCELLED", notes: [run.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") },
    });
    if (res.count !== 1) throw conflict(`Run ${run.runNo} is ${run.status.toLowerCase()} and cannot be cancelled`);
    await audit(tx, actor, "production.cancel", "ProductionRun", runId, `Cancelled ${run.runNo}: ${reason}`);
    return { id: runId };
  });
}

/** Sums expense allocations of a run by cost bucket. */
async function overheadsFor(tx: Tx, runId: string) {
  const allocations = await tx.expenseAllocation.findMany({ where: { productionRunId: runId }, include: { expense: true } });
  const bucket = (pred: (c: string) => boolean) => sum(allocations.filter((a) => pred(a.expense.category)).map((a) => a.amount));
  return {
    labour: bucket((c) => c === "LABOUR"),
    energy: bucket((c) => (ENERGY_CATEGORIES as readonly string[]).includes(c)),
    other: bucket((c) => c === "OTHER_OVERHEAD"),
  };
}

export async function completeProductionRun(actor: Actor, runId: string, input: ProductionCompleteInput, at: Date = new Date()) {
  return withTransaction(async (tx) => {
    const run = await tx.productionRun.findUnique({
      where: { id: runId },
      include: {
        product: { include: { item: true } },
        bomVersion: { include: { bom: true } },
        materials: { include: { item: { include: { unit: true } } } },
      },
    });
    if (!run) throw notFound("Production run");

    // 1. Claim the run (prevents duplicate completion; the row stays locked until commit).
    const claimed = await tx.productionRun.updateMany({
      where: { id: runId, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: at, completedById: actor.id },
    });
    if (claimed.count !== 1) {
      throw conflict(
        run.status === "COMPLETED" ? `Run ${run.runNo} is already completed` : `Run ${run.runNo} must be started before it can be completed`,
      );
    }

    const settings = await getCompanySettings(tx);
    const tolerance = D(settings.varianceTolerancePct);

    const lines = run.materials.map((m) => {
      const entry = input.materials.find((x) => x.itemId === m.itemId);
      if (!entry) throw badRequest(`Enter the actual quantity for ${m.item.name}`);
      const actual = round3(entry.actualQty);
      const damaged = round3(entry.damagedQty);
      return { m, actual, damaged, total: actual.plus(damaged) };
    });
    const extra = input.materials.filter((x) => !run.materials.some((m) => m.itemId === x.itemId));
    if (extra.length) throw badRequest("Completion includes a material that is not on this run's BOM");

    // 2. Validate stock for everything that will be deducted (reports all shortages together).
    await assertAvailable(tx, lines.map((l) => ({ itemId: l.m.itemId, quantity: l.total })));

    // 3. Post raw-material issues, packaging consumption and damaged material.
    const ref = run.runNo;
    const rawValues: Dec[] = [];
    const packValues: Dec[] = [];
    let materialFlag = false;
    for (const l of lines) {
      const isPackaging = l.m.item.kind === "PACKAGING_MATERIAL";
      let lineValue = new Dec(0);
      let unitCost = new Dec(0);
      if (l.actual.gt(0)) {
        const mv = await postMovement(tx, {
          itemId: l.m.itemId,
          movementType: isPackaging ? "PACKAGING_CONSUMPTION" : "PRODUCTION_ISSUE",
          quantity: l.actual.negated(),
          sourceType: "PRODUCTION_RUN",
          sourceId: run.id,
          sourceLineId: l.m.id,
          sourceRef: ref,
          txnDate: at,
          userId: actor.id,
          notes: `${run.product.item.name} production`,
        });
        lineValue = lineValue.plus(mv.valueChange.abs());
        unitCost = mv.unitCost;
      }
      if (l.damaged.gt(0)) {
        const mv = await postMovement(tx, {
          itemId: l.m.itemId,
          movementType: "DAMAGED_MATERIAL",
          quantity: l.damaged.negated(),
          sourceType: "PRODUCTION_RUN",
          sourceId: run.id,
          sourceLineId: l.m.id,
          sourceRef: ref,
          txnDate: at,
          userId: actor.id,
          notes: isPackaging ? "Damaged during packing" : "Wasted during processing",
        });
        lineValue = lineValue.plus(mv.valueChange.abs());
        if (unitCost.isZero()) unitCost = mv.unitCost;
      }
      const totalCost = round2(lineValue);
      (isPackaging ? packValues : rawValues).push(totalCost);
      const variancePct = consumptionVariancePct(l.total, l.m.plannedQty);
      const isFlagged = exceedsTolerance(variancePct, tolerance);
      materialFlag ||= isFlagged;
      await tx.productionMaterial.update({
        where: { id: l.m.id },
        data: {
          actualQty: l.actual.toFixed(),
          damagedQty: l.damaged.toFixed(),
          unitCost: unitCost.toFixed(),
          totalCost: totalCost.toFixed(2),
          variancePct: variancePct.toFixed(),
          isFlagged,
        },
      });
    }

    // 4. Yield and costing snapshot.
    const good = round3(input.actualGoodOutput);
    const yieldVar = yieldVariancePct(good, run.expectedOutput);
    const yieldFlag = exceedsTolerance(yieldVar, tolerance);
    const overheads = await overheadsFor(tx, run.id);
    const costing = computeRunCosting({
      rawMaterialValues: rawValues,
      packagingValues: packValues,
      labour: overheads.labour,
      energy: overheads.energy,
      otherOverhead: overheads.other,
      goodOutput: good,
      sellingPrice: run.product.sellingPrice,
    });

    // 5. Finished-goods output, valued at the run's cost so far (material + packaging + overheads already allocated).
    let batchNo: string | null = null;
    let expiryDate: Date | null = null;
    if (good.gt(0)) {
      batchNo = `${run.product.sku}-${isoDateIst(at).replace(/-/g, "").slice(2)}-${run.runNo.split("/").pop()}`;
      expiryDate = run.product.item.shelfLifeDays ? addDays(at, run.product.item.shelfLifeDays) : null;
      const unitCost = costing.totalCost.div(good);
      const mv = await postMovement(tx, {
        itemId: run.product.itemId,
        movementType: "PRODUCTION_OUTPUT",
        quantity: good,
        unitCost,
        sourceType: "PRODUCTION_RUN",
        sourceId: run.id,
        sourceLineId: run.product.itemId,
        sourceRef: ref,
        txnDate: at,
        userId: actor.id,
        batchNo,
        expiryDate,
        notes: `Good output of ${run.runNo}`,
      });
      await tx.productionOutput.create({
        data: {
          runId: run.id,
          itemId: run.product.itemId,
          quantity: good.toFixed(),
          batchNo,
          expiryDate,
          unitCost: unitCost.toDecimalPlaces(6).toFixed(),
          value: round2(mv.valueChange).toFixed(2),
        },
      });
    }

    await tx.productionRun.update({
      where: { id: run.id },
      data: {
        actualGoodOutput: good.toFixed(),
        scrapQty: input.scrapQty !== undefined ? round3(input.scrapQty).toFixed() : null,
        scrapNotes: input.scrapNotes ?? null,
        batchNo,
        expiryDate,
        actualYieldPct: actualYieldPct(good, run.plannedOutput).toFixed(),
        yieldVariancePct: yieldVar.toFixed(),
        varianceTolerancePct: tolerance.toFixed(),
        hasVarianceAlert: materialFlag || yieldFlag,
        materialCost: costing.materialCost.toFixed(2),
        packagingCost: costing.packagingCost.toFixed(2),
        labourCost: costing.labourCost.toFixed(2),
        energyCost: costing.energyCost.toFixed(2),
        overheadCost: costing.overheadCost.toFixed(2),
        totalCost: costing.totalCost.toFixed(2),
        costPerUnit: costing.costPerUnit.toFixed(),
        sellingPrice: costing.sellingPrice.toFixed(2),
        grossMarginPerUnit: costing.grossMarginPerUnit.toFixed(),
        marginPct: costing.marginPct.toFixed(),
      },
    });

    await audit(tx, actor, "production.complete", "ProductionRun", run.id, `Completed ${run.runNo}: ${good.toFixed()} good units (yield variance ${yieldVar.toFixed(2)}%), cost ₹${costing.totalCost.toFixed(2)}`, {
      goodOutput: good.toFixed(),
      yieldVariancePct: yieldVar.toFixed(),
      materials: lines.map((l) => ({ item: l.m.item.code, actual: l.actual.toFixed(), damaged: l.damaged.toFixed() })),
    });
    return { id: run.id };
  });
}

/**
 * Re-applies expense allocations to a run's costing snapshot. Material/packaging cost is frozen at
 * completion (so new purchase prices never change history); only labour/energy/overhead change here.
 */
export async function refreshRunOverheads(tx: Tx, runId: string) {
  const run = await tx.productionRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound("Production run");
  const o = await overheadsFor(tx, runId);
  if (run.status !== "COMPLETED") {
    await tx.productionRun.update({
      where: { id: runId },
      data: { labourCost: round2(o.labour).toFixed(2), energyCost: round2(o.energy).toFixed(2), overheadCost: round2(o.other).toFixed(2) },
    });
    return;
  }
  const costing = computeRunCosting({
    rawMaterialValues: [run.materialCost ?? 0],
    packagingValues: [run.packagingCost ?? 0],
    labour: o.labour,
    energy: o.energy,
    otherOverhead: o.other,
    goodOutput: run.actualGoodOutput ?? 0,
    sellingPrice: run.sellingPrice ?? 0,
  });
  await tx.productionRun.update({
    where: { id: runId },
    data: {
      labourCost: costing.labourCost.toFixed(2),
      energyCost: costing.energyCost.toFixed(2),
      overheadCost: costing.overheadCost.toFixed(2),
      totalCost: costing.totalCost.toFixed(2),
      costPerUnit: costing.costPerUnit.toFixed(),
      grossMarginPerUnit: costing.grossMarginPerUnit.toFixed(),
      marginPct: costing.marginPct.toFixed(),
    },
  });
}
