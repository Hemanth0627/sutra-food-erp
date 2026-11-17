"use client";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import { D, formatINR, round2, sum } from "@/lib/decimal";
import { isoDateIst } from "@/lib/dates";
import { purchaseOrderSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

type Values = z.input<typeof purchaseOrderSchema>;
const num = (v: unknown) => (/^\d+(\.\d+)?$/.test(String(v ?? "")) ? String(v) : "0");
const emptyLine = { itemId: "", unitId: "", quantity: "", rate: "", gstRate: "0" };

export function PurchaseOrderForm({
  suppliers,
  items,
  units,
}: {
  suppliers: { id: string; name: string }[];
  items: { id: string; name: string; kind: string; unitId: string; dimension: string; onHand: string; reorder: string; unitCode: string; lastRate: string }[];
  units: { id: string; code: string; dimension: string }[];
}) {
  const router = useRouter();
  const { call, pending } = useApi();
  const today = isoDateIst(new Date());
  const form = useForm<Values>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: { supplierId: "", orderDate: today, expectedDate: "", notes: "", items: [emptyLine] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const lines = useWatch({ control: form.control, name: "items" });
  const e = form.formState.errors;
  const calc = (l: Values["items"][number] | undefined) => {
    const taxable = round2(D(num(l?.quantity)).times(D(num(l?.rate))));
    return { taxable, tax: round2(taxable.times(D(num(l?.gstRate))).div(100)) };
  };
  const totals = (lines ?? []).map(calc);

  async function onSubmit(v: Values) {
    const r = await call<{ purchaseOrder: { id: string; poNo: string } }>("/api/purchase-orders", v, { success: (r) => `${r.purchaseOrder.poNo} raised` });
    router.push(`/purchase-orders/${r.purchaseOrder.id}`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
          <Field label="Supplier" htmlFor="supplierId" error={e.supplierId?.message}>
            <NativeSelect id="supplierId" {...form.register("supplierId")}><option value="">Select supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
          </Field>
          <Field label="Order date" htmlFor="orderDate" error={e.orderDate?.message}><Input id="orderDate" type="date" {...form.register("orderDate")} /></Field>
          <Field label="Expected delivery" htmlFor="expectedDate" error={e.expectedDate?.message}><Input id="expectedDate" type="date" {...form.register("expectedDate")} /></Field>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardContent className="space-y-3 p-5">
          {fields.map((f, idx) => {
            const item = items.find((i) => i.id === lines?.[idx]?.itemId);
            const unitOptions = units.filter((u) => !item || u.dimension === item.dimension);
            const le = e.items?.[idx];
            return (
              <div key={f.id} className="rounded-lg border p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_0.8fr_1fr_0.7fr_auto]">
                  <Field label="Material" htmlFor={`it-${idx}`} error={le?.itemId?.message}>
                    <NativeSelect
                      id={`it-${idx}`}
                      {...form.register(`items.${idx}.itemId`, {
                        onChange: (ev) => {
                          const sel = items.find((i) => i.id === ev.target.value);
                          if (sel) {
                            form.setValue(`items.${idx}.unitId`, sel.unitId);
                            if (!form.getValues(`items.${idx}.rate`)) form.setValue(`items.${idx}.rate`, sel.lastRate);
                          }
                        },
                      })}
                    >
                      <option value="">Select material</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.kind === "RAW_MATERIAL" ? "raw" : "packaging"})</option>)}
                    </NativeSelect>
                  </Field>
                  <Field label="Quantity" htmlFor={`q-${idx}`} error={le?.quantity?.message}><Input id={`q-${idx}`} inputMode="decimal" {...form.register(`items.${idx}.quantity`)} /></Field>
                  <Field label="Unit" htmlFor={`u-${idx}`} error={le?.unitId?.message}>
                    <NativeSelect id={`u-${idx}`} {...form.register(`items.${idx}.unitId`)}><option value="">Unit</option>{unitOptions.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</NativeSelect>
                  </Field>
                  <Field label="Rate (₹)" htmlFor={`r-${idx}`} error={le?.rate?.message}><Input id={`r-${idx}`} inputMode="decimal" {...form.register(`items.${idx}.rate`)} /></Field>
                  <Field label="GST %" htmlFor={`g-${idx}`} error={le?.gstRate?.message}><Input id={`g-${idx}`} inputMode="decimal" {...form.register(`items.${idx}.gstRate`)} /></Field>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} disabled={fields.length === 1} aria-label="Remove line"><Trash2 /></Button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {item && <>On hand {item.onHand} {item.unitCode} · reorder level {item.reorder} {item.unitCode} · </>}
                  <span className="tabular font-medium text-foreground">{formatINR(totals[idx]?.taxable ?? 0)}</span> + {formatINR(totals[idx]?.tax ?? 0)} GST
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" onClick={() => append(emptyLine)}><Plus /> Add line</Button>
          <Field label="Notes" htmlFor="notes"><Textarea id="notes" {...form.register("notes")} /></Field>
        </CardContent>
      </Card>
      <div className="mt-4 flex flex-col items-stretch justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="text-sm">
          Taxable <span className="tabular font-semibold">{formatINR(sum(totals.map((t) => t.taxable)))}</span> · GST <span className="tabular font-semibold">{formatINR(sum(totals.map((t) => t.tax)))}</span> · Total <span className="tabular font-semibold">{formatINR(sum(totals.map((t) => t.taxable.plus(t.tax))))}</span>
          <div className="text-xs text-muted-foreground">A purchase order does not change stock. Stock is added when you receive the goods against it.</div>
        </div>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Raise purchase order</Button>
      </div>
    </form>
  );
}
