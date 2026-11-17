"use client";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import { D, formatINR, round2, sum } from "@/lib/decimal";
import { isoDateIst } from "@/lib/dates";
import { convertQuantity } from "@/lib/units";
import { purchaseSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

type Values = z.input<typeof purchaseSchema>;
const num = (v: unknown) => (/^\d+(\.\d+)?$/.test(String(v ?? "")) ? String(v) : "0");

export function PurchaseForm({
  suppliers,
  items,
  units,
}: {
  suppliers: { id: string; name: string }[];
  items: { id: string; name: string; kind: string; unitId: string; unitCode: string; dimension: string; onHand: string; avgCost: string }[];
  units: { id: string; code: string; dimension: string; toBase: string }[];
}) {
  const router = useRouter();
  const { call, pending } = useApi();
  const today = isoDateIst(new Date());
  const form = useForm<Values>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { supplierId: "", supplierInvoiceNo: "", invoiceDate: today, receivedDate: today, notes: "", items: [{ itemId: "", unitId: "", quantity: "", rate: "", gstRate: "0", batchNo: "", expiryDate: "" }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const lines = useWatch({ control: form.control, name: "items" });
  const e = form.formState.errors;

  const lineCalc = (l: Values["items"][number]) => {
    const taxable = round2(D(num(l?.quantity)).times(D(num(l?.rate))));
    const tax = round2(taxable.times(D(num(l?.gstRate))).div(100));
    const item = items.find((i) => i.id === l?.itemId);
    const unit = units.find((u) => u.id === l?.unitId);
    const stockUnit = units.find((u) => u.id === item?.unitId);
    let preview = "";
    if (item && unit && stockUnit && unit.dimension === stockUnit.dimension && D(num(l?.quantity)).gt(0)) {
      const stockQty = convertQuantity(num(l?.quantity), unit as never, stockUnit as never);
      const newQty = D(item.onHand).plus(stockQty);
      const newAvg = newQty.gt(0) ? D(item.onHand).times(D(item.avgCost)).plus(taxable).div(newQty) : D(0);
      preview = `${stockQty.toString()} ${stockUnit.code} → stock ${newQty.toString()} ${stockUnit.code}, new avg ₹${newAvg.toDecimalPlaces(3).toString()}/${stockUnit.code}`;
    }
    return { taxable, tax, preview };
  };
  const totals = (lines ?? []).map(lineCalc);

  async function onSubmit(v: Values) {
    const r = await call<{ purchase: { id: string; purchaseNo: string } }>("/api/purchases", v, { success: (r) => `Purchase ${r.purchase.purchaseNo} posted to stock` });
    router.push(`/purchases/${r.purchase.id}`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" htmlFor="supplierId" error={e.supplierId?.message}>
            <NativeSelect id="supplierId" {...form.register("supplierId")}><option value="">Select supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
          </Field>
          <Field label="Supplier invoice no." htmlFor="inv" error={e.supplierInvoiceNo?.message}><Input id="inv" {...form.register("supplierInvoiceNo")} /></Field>
          <Field label="Invoice date" htmlFor="invoiceDate"><Input id="invoiceDate" type="date" {...form.register("invoiceDate")} /></Field>
          <Field label="Received date" htmlFor="receivedDate"><Input id="receivedDate" type="date" {...form.register("receivedDate")} /></Field>
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_0.8fr_auto]">
                  <Field label="Material" htmlFor={`it-${idx}`} error={le?.itemId?.message}>
                    <NativeSelect
                      id={`it-${idx}`}
                      {...form.register(`items.${idx}.itemId`, {
                        onChange: (ev) => {
                          const sel = items.find((i) => i.id === ev.target.value);
                          if (sel) form.setValue(`items.${idx}.unitId`, sel.unitId);
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
                  <Field label="Rate per unit (₹)" htmlFor={`r-${idx}`} error={le?.rate?.message}><Input id={`r-${idx}`} inputMode="decimal" {...form.register(`items.${idx}.rate`)} /></Field>
                  <Field label="GST %" htmlFor={`g-${idx}`} error={le?.gstRate?.message}><Input id={`g-${idx}`} inputMode="decimal" {...form.register(`items.${idx}.gstRate`)} /></Field>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} disabled={fields.length === 1} aria-label="Remove line"><Trash2 /></Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Supplier batch / lot" htmlFor={`b-${idx}`}><Input id={`b-${idx}`} {...form.register(`items.${idx}.batchNo`)} /></Field>
                  <Field label="Expiry (optional)" htmlFor={`x-${idx}`}><Input id={`x-${idx}`} type="date" {...form.register(`items.${idx}.expiryDate`)} /></Field>
                  <div className="text-xs text-muted-foreground sm:col-span-2 sm:self-end">
                    <span className="tabular font-medium text-foreground">{formatINR(totals[idx]?.taxable ?? 0)}</span> taxable + {formatINR(totals[idx]?.tax ?? 0)} GST
                    {totals[idx]?.preview && <div className="mt-0.5">{totals[idx].preview}</div>}
                  </div>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" onClick={() => append({ itemId: "", unitId: "", quantity: "", rate: "", gstRate: "0", batchNo: "", expiryDate: "" })}><Plus /> Add line</Button>
        </CardContent>
      </Card>
      <div className="mt-4 flex flex-col items-stretch justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="text-sm">
          Taxable <span className="tabular font-semibold">{formatINR(sum(totals.map((t) => t.taxable)))}</span> · GST <span className="tabular font-semibold">{formatINR(sum(totals.map((t) => t.tax)))}</span> · Total <span className="tabular font-semibold">{formatINR(sum(totals.map((t) => t.taxable.plus(t.tax))))}</span>
        </div>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Post purchase</Button>
      </div>
    </form>
  );
}
