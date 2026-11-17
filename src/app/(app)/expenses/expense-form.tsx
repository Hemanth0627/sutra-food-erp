"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import type { z } from "zod";
import { isoDateIst } from "@/lib/dates";
import { expenseSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

type Values = z.input<typeof expenseSchema>;

export function ExpenseForm({ runs, defaultRunId, openInitially }: { runs: { id: string; label: string }[]; defaultRunId?: string; openInitially?: boolean }) {
  const [open, setOpen] = useState(!!openInitially);
  const { call, pending } = useApi();
  const form = useForm<Values>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { expenseDate: isoDateIst(new Date()), category: "LABOUR", amount: "", description: "", allocationMethod: "DIRECT", productionRunId: defaultRunId ?? "" },
  });
  const method = useWatch({ control: form.control, name: "allocationMethod" });
  const e = form.formState.errors;
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Record expense</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record production expense</DialogTitle>
            <DialogDescription>Updates the run&apos;s costing snapshot (labour / energy / overheads). Material cost frozen at completion is never changed.</DialogDescription>
          </DialogHeader>
          <form
            id="expense-form"
            className="grid gap-3 sm:grid-cols-2"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              await call("/api/expenses", v, { success: "Expense recorded and allocated" });
              setOpen(false);
              form.reset();
            })}
          >
            <Field label="Category" htmlFor="ex-cat">
              <NativeSelect id="ex-cat" {...form.register("category")}>
                <option value="LABOUR">Labour</option>
                <option value="GAS_AND_POWER">Gas & power</option>
                <option value="GAS">Gas</option>
                <option value="ELECTRICITY">Electricity</option>
                <option value="OTHER_OVERHEAD">Other overhead</option>
              </NativeSelect>
            </Field>
            <Field label="Amount (₹)" htmlFor="ex-amt" error={e.amount?.message}><Input id="ex-amt" inputMode="decimal" {...form.register("amount")} /></Field>
            <Field label="Date" htmlFor="ex-date"><Input id="ex-date" type="date" {...form.register("expenseDate")} /></Field>
            <Field label="Allocation" htmlFor="ex-m">
              <NativeSelect id="ex-m" {...form.register("allocationMethod")}>
                <option value="DIRECT">Direct to one run</option>
                <option value="OUTPUT_QUANTITY">Spread over the month by good output</option>
              </NativeSelect>
            </Field>
            {method === "DIRECT" && (
              <Field label="Production run" htmlFor="ex-run" error={e.productionRunId?.message} className="sm:col-span-2">
                <NativeSelect id="ex-run" {...form.register("productionRunId")}><option value="">Select run</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</NativeSelect>
              </Field>
            )}
            <Field label="Description" htmlFor="ex-desc" error={e.description?.message} className="sm:col-span-2"><Input id="ex-desc" {...form.register("description")} placeholder="Labour for Murukku batch" /></Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="expense-form" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
