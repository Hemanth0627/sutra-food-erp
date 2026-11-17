"use client";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import type { z } from "zod";
import { D, formatINR, sum } from "@/lib/decimal";
import { isoDateIst } from "@/lib/dates";
import { paymentSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

export interface OpenInvoiceOption {
  id: string;
  invoiceNo: string;
  customerId: string;
  invoiceDate: string;
  balance: string;
}

type Values = z.input<typeof paymentSchema>;

export function RecordPaymentButton({ customers, openInvoices, defaultCustomerId }: { customers: { id: string; name: string }[]; openInvoices: OpenInvoiceOption[]; defaultCustomerId?: string }) {
  const [open, setOpen] = useState(false);
  const { call, pending } = useApi();
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const form = useForm<Values>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { customerId: defaultCustomerId ?? "", paymentDate: isoDateIst(new Date()), amount: "", mode: "UPI", reference: "", notes: "", autoAllocate: true, allocations: [] },
  });
  const { errors } = form.formState;
  const customerId = useWatch({ control: form.control, name: "customerId" });
  const amount = useWatch({ control: form.control, name: "amount" });
  const invoices = useMemo(() => openInvoices.filter((i) => i.customerId === customerId), [openInvoices, customerId]);
  const due = sum(invoices.map((i) => i.balance));
  const allocTotal = sum(Object.values(alloc).filter((v) => /^\d+(\.\d{1,2})?$/.test(v)));

  async function onSubmit(values: Values) {
    const allocations = manual ? Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([invoiceId, a]) => ({ invoiceId, amount: a })) : [];
    await call<{ payment: { receiptNo: string } }>("/api/payments", { ...values, autoAllocate: !manual, allocations }, { success: (r) => `Receipt ${r.payment.receiptNo} recorded` });
    setOpen(false);
    form.reset();
    setAlloc({});
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Record payment</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Record customer payment</DialogTitle>
            <DialogDescription>Allocate to invoices oldest-first, or split it yourself. Allocations cannot exceed an invoice&apos;s balance; any excess stays on account.</DialogDescription>
          </DialogHeader>
          <form id="payment-form" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Customer" htmlFor="customerId" error={errors.customerId?.message} className="sm:col-span-2">
              <NativeSelect id="customerId" {...form.register("customerId")} aria-invalid={!!errors.customerId}>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Amount (₹)" htmlFor="amount" error={errors.amount?.message} hint={customerId ? `Open balance ${formatINR(due)}` : undefined}>
              <Input id="amount" inputMode="decimal" {...form.register("amount")} aria-invalid={!!errors.amount} />
            </Field>
            <Field label="Date" htmlFor="paymentDate" error={errors.paymentDate?.message}>
              <Input id="paymentDate" type="date" {...form.register("paymentDate")} />
            </Field>
            <Field label="Mode" htmlFor="mode">
              <NativeSelect id="mode" {...form.register("mode")}>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash</option>
              </NativeSelect>
            </Field>
            <Field label="Reference" htmlFor="reference"><Input id="reference" {...form.register("reference")} placeholder="UTR / cheque no." /></Field>
          </form>
          {customerId && (
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">Open invoices</span>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Allocate manually
                </label>
              </div>
              {invoices.length ? (
                <ul className="divide-y">
                  {invoices.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span><span className="font-medium">{i.invoiceNo}</span> <span className="text-xs text-muted-foreground">{i.invoiceDate}</span></span>
                      <span className="flex items-center gap-2">
                        <span className="tabular text-xs text-muted-foreground">balance {formatINR(i.balance)}</span>
                        {manual && <Input className="h-8 w-28 text-right" inputMode="decimal" value={alloc[i.id] ?? ""} onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))} aria-label={`Allocate to ${i.invoiceNo}`} />}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-3 py-3 text-xs text-muted-foreground">No open invoices; the receipt will be held on account.</p>}
              {manual && (
                <div className={`border-t px-3 py-2 text-xs ${amount && allocTotal.gt(D(String(amount) || 0)) ? "text-destructive" : "text-muted-foreground"}`}>
                  Allocated {formatINR(allocTotal)} of {formatINR(D(/^\d+(\.\d+)?$/.test(String(amount)) ? String(amount) : 0))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="payment-form" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
