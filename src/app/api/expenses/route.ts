import { expenseSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { createExpense } from "@/server/services/expenses";

export const POST = apiRoute({ permission: "expenses:manage", schema: expenseSchema }, async ({ actor, body }) => ({
  expense: await createExpense(actor, body),
}));
