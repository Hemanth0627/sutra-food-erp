import { D } from "@/lib/decimal";
import { addIstMonths, formatMonthKey, monthKey, startOfIstMonth } from "@/lib/dates";
import { allocateByOutput } from "@/lib/production";
import type { ExpenseInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { withTransaction } from "../db";
import { badRequest, notFound } from "../errors";
import { nextDocumentNumber } from "../sequence";
import { parseDateInput } from "./common";
import { refreshRunOverheads } from "./production";

/**
 * Production expenses (labour, gas, electricity, other overheads) and their allocation to runs.
 *
 * DIRECT           – the whole amount is charged to the selected run.
 * OUTPUT_QUANTITY  – a period expense is spread over all runs completed in the expense's month,
 *                    in proportion to good output (paisa remainder to the largest run).
 */
export async function createExpense(actor: Actor, input: ExpenseInput) {
  return withTransaction(async (tx) => {
    const expenseDate = parseDateInput(input.expenseDate, new Date());
    let targets: { runId: string; amount: string; basisQty?: string }[] = [];

    if (input.allocationMethod === "DIRECT") {
      const run = await tx.productionRun.findUnique({ where: { id: input.productionRunId! } });
      if (!run) throw notFound("Production run");
      if (run.status === "CANCELLED") throw badRequest("Cannot charge expenses to a cancelled run");
      targets = [{ runId: run.id, amount: D(input.amount).toFixed(2) }];
    } else {
      const from = startOfIstMonth(expenseDate);
      const to = addIstMonths(from, 1);
      const runs = await tx.productionRun.findMany({
        where: { status: "COMPLETED", completedAt: { gte: from, lt: to }, actualGoodOutput: { gt: 0 } },
        select: { id: true, actualGoodOutput: true },
      });
      if (!runs.length) throw badRequest(`No completed production runs in ${formatMonthKey(monthKey(expenseDate))} to allocate this expense to`);
      targets = allocateByOutput(input.amount, runs.map((r) => ({ runId: r.id, goodOutput: r.actualGoodOutput! }))).map((s) => ({
        runId: s.runId,
        amount: s.amount.toFixed(2),
        basisQty: s.basisQty.toFixed(),
      }));
    }

    const { number } = await nextDocumentNumber(tx, "EXP", expenseDate);
    const expense = await tx.expense.create({
      data: {
        expenseNo: number,
        expenseDate,
        category: input.category,
        amount: D(input.amount).toFixed(2),
        description: input.description,
        allocationMethod: input.allocationMethod,
        productionRunId: input.allocationMethod === "DIRECT" ? input.productionRunId! : null,
        createdById: actor.id,
        allocations: { create: targets.map((t) => ({ productionRunId: t.runId, amount: t.amount, basisQty: t.basisQty ?? null })) },
      },
    });
    for (const t of targets) await refreshRunOverheads(tx, t.runId);
    await audit(tx, actor, "expense.create", "Expense", expense.id, `Recorded ${input.category.toLowerCase().replace(/_/g, " ")} expense ${number} ₹${expense.amount} (${input.allocationMethod === "DIRECT" ? "direct" : "allocated by output"})`, {
      allocations: targets,
    });
    return expense;
  });
}
