"use client";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { D, formatINR, round2, sum } from "@/lib/decimal";
import { convertQuantity, type UnitDef } from "@/lib/units";
import { bomCreateSchema, bomVersionSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

type UnitOpt = { id: string; code: string; dimension: string; toBase: string };
type ItemOpt = { id: string; name: string; kind: string; unitId: string; avgCost: string };

const schema = bomVersionSchema.extend({ header: bomCreateSchema.partial().optional() });
type Values = z.input<typeof schema>;

export function BomEditor({
  mode,
  bomId,
  versionId,
  products,
  items,
  units,
  initial,
}: {
  mode: "create" | "new-version" | "edit-draft";
  bomId?: string;
  versionId?: string;
  products?: { id: string; name: string; sku: string }[];
  items: ItemOpt[];
  units: UnitOpt[];
  initial?: Partial<Values>;
}) {
  const router = useRouter();
  const { call, pending } = useApi();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      batchSize: "200",
      expectedYieldPct: "100",
      notes: "",
      items: [{ itemId: "", unitId: "", quantity: "", notes: "" }],
      ...(mode === "create" ? { header: { productId: "", name: "", code: "" } } : {}),
      ...initial,
    },
  });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "items" });
  const watched = useWatch({ control: form.control, name: "items" });
  const batchSize = useWatch({ control: form.control, name: "batchSize" });
  const yieldPct = useWatch({ control: form.control, name: "expectedYieldPct" });
  const e = form.formState.errors;

  const lineCost = (l?: { itemId?: string; unitId?: string; quantity?: string | number }) => {
    const item = items.find((i) => i.id === l?.itemId);
    const unit = units.find((u) => u.id === l?.unitId);
    const stockUnit = units.find((u) => u.id === item?.unitId);
    const q = String(l?.quantity ?? "");
    if (!item || !unit || !stockUnit || unit.dimension !== stockUnit.dimension || !/^\d+(\.\d+)?$/.test(q)) return null;
    const stockQty = convertQuantity(q, unit as UnitDef, stockUnit as UnitDef);
    return { stockQty, stockUnit: stockUnit.code, cost: round2(stockQty.times(D(item.avgCost))) };
  };
  const costs = (watched ?? []).map(lineCost);
  const total = sum(costs.map((c) => c?.cost ?? 0));
  const expected = /^\d+(\.\d+)?$/.test(String(batchSize)) && /^\d+(\.\d+)?$/.test(String(yieldPct)) ? D(String(batchSize)).times(D(String(yieldPct))).div(100) : D(0);

  async function onSubmit(v: Values) {
    const version = { batchSize: v.batchSize, expectedYieldPct: v.expectedYieldPct, notes: v.notes, items: v.items };
    if (mode === "create") {
      const h = v.header ?? {};
      if (!h.productId || !h.name || !h.code) {
        form.setError("header.productId", { message: "Product, name and code are required" });
        return;
      }
      const r = await call<{ bomId: string }>("/api/bom", { productId: h.productId, name: h.name, code: h.code, version }, { success: "BOM created as draft v1" });
      router.push(`/bom/${r.bomId}`);
    } else if (mode === "new-version") {
      const r = await call<{ version: { id: string; versionNo: number } }>(`/api/bom/${bomId}/versions`, version, { success: (r) => `Draft v${r.version.versionNo} created. Review and activate it.` });
      router.push(`/bom/${bomId}?v=${r.version.id}`);
    } else {
      await call(`/api/bom/versions/${versionId}`, version, { method: "PATCH", success: "Draft saved" });
      router.push(`/bom/${bomId}?v=${versionId}`);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      {mode === "create" && (
        <Card>
          <CardHeader><CardTitle>Recipe</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label="Finished product" htmlFor="h-p" error={e.header?.productId?.message}>
              <NativeSelect id="h-p" {...form.register("header.productId")}><option value="">Select product</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
            </Field>
            <Field label="BOM name" htmlFor="h-n" error={e.header?.name?.message}><Input id="h-n" {...form.register("header.name")} placeholder="Murukku 200 g – standard batch" /></Field>
            <Field label="Code" htmlFor="h-c" error={e.header?.code?.message}><Input id="h-c" className="uppercase" {...form.register("header.code")} placeholder="BOM-MURUKKU-2" /></Field>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Batch</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Batch size (packets per batch)" htmlFor="bs" error={e.batchSize?.message}><Input id="bs" inputMode="decimal" {...form.register("batchSize")} /></Field>
          <Field label="Expected yield (% of batch)" htmlFor="ey" error={e.expectedYieldPct?.message} hint={`Expected good output: ${expected.toDecimalPlaces(3).toString()} packets`}><Input id="ey" inputMode="decimal" {...form.register("expectedYieldPct")} /></Field>
          <Field label="Notes" htmlFor="bn"><Textarea id="bn" rows={1} className="min-h-9" {...form.register("notes")} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Materials per batch</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {typeof e.items?.message === "string" && <p className="text-xs text-destructive">{e.items.message}</p>}
          {fields.map((f, idx) => {
            const item = items.find((i) => i.id === watched?.[idx]?.itemId);
            const stockUnit = units.find((u) => u.id === item?.unitId);
            const unitOptions = units.filter((u) => !stockUnit || u.dimension === stockUnit.dimension);
            const c = costs[idx];
            const le = e.items?.[idx];
            return (
              <div key={f.id} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_0.8fr_1.2fr_auto]">
                <Field label="Material" htmlFor={`bi-${idx}`} error={le?.itemId?.message}>
                  <NativeSelect
                    id={`bi-${idx}`}
                    {...form.register(`items.${idx}.itemId`, {
                      onChange: (ev) => {
                        const sel = items.find((i) => i.id === ev.target.value);
                        if (sel) form.setValue(`items.${idx}.unitId`, sel.unitId);
                      },
                    })}
                  >
                    <option value="">Select material</option>
                    <optgroup label="Raw materials">{items.filter((i) => i.kind === "RAW_MATERIAL").map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>
                    <optgroup label="Packaging">{items.filter((i) => i.kind === "PACKAGING_MATERIAL").map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>
                  </NativeSelect>
                </Field>
                <Field label="Quantity" htmlFor={`bq-${idx}`} error={le?.quantity?.message}><Input id={`bq-${idx}`} inputMode="decimal" {...form.register(`items.${idx}.quantity`)} /></Field>
                <Field label="Unit" htmlFor={`bu-${idx}`} error={le?.unitId?.message}>
                  <NativeSelect id={`bu-${idx}`} {...form.register(`items.${idx}.unitId`)}><option value="">Unit</option>{unitOptions.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</NativeSelect>
                </Field>
                <div className="pb-2 text-xs text-muted-foreground">
                  {c ? <><span className="tabular font-medium text-foreground">{formatINR(c.cost)}</span> · {c.stockQty.toString()} {c.stockUnit} @ ₹{D(item?.avgCost ?? 0).toDecimalPlaces(3).toString()}</> : "—"}
                </div>
                <div className="flex gap-1 pb-0.5">
                  <Button type="button" variant="ghost" size="icon" disabled={idx === 0} onClick={() => move(idx, idx - 1)} aria-label="Move up">↑</Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} disabled={fields.length === 1} aria-label="Remove material"><Trash2 /></Button>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" onClick={() => append({ itemId: "", unitId: "", quantity: "", notes: "" })}><Plus /> Add material</Button>
        </CardContent>
      </Card>
      <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="text-sm">
          Standard material cost per batch <span className="tabular font-semibold">{formatINR(total)}</span>
          {expected.gt(0) && <> · per packet <span className="tabular font-semibold">{formatINR(total.div(expected).toDecimalPlaces(2).toFixed(2))}</span></>}
          <div className="text-xs text-muted-foreground">At current weighted-average rates. Saved as a draft; activate it to use it in production.</div>
        </div>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} {mode === "edit-draft" ? "Save draft" : "Save as draft"}</Button>
      </div>
    </form>
  );
}
