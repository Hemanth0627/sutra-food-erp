import { formatINR } from "@/lib/decimal";
import { formatDate } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ExpenseForm } from "./expense-form";
import Link from "next/link";

export const metadata = { title: "Production expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const user = await requirePageUser("expenses:view");
  const { run } = await searchParams;
  const [expenses, runs] = await Promise.all([
    prisma.expense.findMany({ include: { allocations: { include: { productionRun: true } }, createdBy: true }, orderBy: { expenseDate: "desc" }, take: 200 }),
    prisma.productionRun.findMany({ where: { status: { not: "CANCELLED" } }, include: { product: { include: { item: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <>
      <PageHeader
        title="Production expenses"
        description="Labour, gas, electricity and other overheads. Charge them directly to a run, or spread a period expense over that month's completed runs in proportion to good output."
        actions={hasPermission(user.role, "expenses:manage") && <ExpenseForm runs={runs.map((r) => ({ id: r.id, label: `${r.runNo} · ${r.product.item.name} (${r.status.toLowerCase().replace("_", " ")})` }))} defaultRunId={run} openInitially={!!run} />}
      />
      <Card>
        {expenses.length ? (
          <Table>
            <THead><TR><TH>Expense</TH><TH>Category</TH><TH>Description</TH><TH>Allocated to</TH><TH className="text-right">Amount</TH></TR></THead>
            <TBody>
              {expenses.map((e) => (
                <TR key={e.id}>
                  <TD><div className="font-medium">{e.expenseNo}</div><div className="text-[11px] text-muted-foreground">{formatDate(e.expenseDate)} · {e.createdBy.name}</div></TD>
                  <TD className="capitalize">{e.category.replace(/_/g, " ").toLowerCase()}</TD>
                  <TD className="text-sm">{e.description}<div className="text-[11px] text-muted-foreground">{e.allocationMethod === "DIRECT" ? "Direct charge" : "Allocated by good output"}</div></TD>
                  <TD className="text-xs">{e.allocations.map((a) => <div key={a.id}><Link href={`/production/${a.productionRunId}`} className="hover:underline">{a.productionRun.runNo}</Link> · {formatINR(a.amount)}</div>)}</TD>
                  <TD className="tabular text-right font-medium">{formatINR(e.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState title="No expenses recorded" />}
      </Card>
    </>
  );
}
