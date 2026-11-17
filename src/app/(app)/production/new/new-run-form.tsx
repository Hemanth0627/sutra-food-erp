"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { D, formatINR, formatQty, round2, sum } from "@/lib/decimal";
import { isoDateIst } from "@/lib/dates";
import { explodeBomLine, expectedOutput, plannedOutput } from "@/lib/production";
import type { UnitDef } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

interface Line { itemId: string; name: string; kind: string; quantity: string; unit: UnitDef; stockUnit: UnitDef; onHand: string; avgCost: string }
interface Version { id: string; label: string; batchSize: string; yieldPct: string; lines: Line[] }
interface ProductOpt { id: string; name: string; versions: Version[] }

export function NewRunForm({ products }: { products: ProductOpt[] }) {
  const router = useRouter();
  const { call, pending } = useApi();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);
  const [versionId, setVersionId] = useState(product?.versions[0]?.id ?? "");
  const version = product?.versions.find((v) => v.id === versionId) ?? product?.versions[0];
  const [batches, setBatches] = useState("1");
  const [date, setDate] = useState(isoDateIst(new Date()));
  const [notes, setNotes] = useState("");
  const valid = /^\d+(\.\d{1,3})?$/.test(batches) && D(batches).gt(0);

  const req = useMemo(() => {
    if (!version || !valid) return [];
    return version.lines.map((l) => {
      const qty = explodeBomLine({ itemId: l.itemId, quantity: l.quantity, unit: l.unit, stockUnit: l.stockUnit }, batches);
      return { ...l, required: qty, cost: round2(qty.times(D(l.avgCost))), short: qty.gt(D(l.onHand)) };
    });
  }, [version, batches, valid]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Finished product" htmlFor="rp">
            <NativeSelect id="rp" value={productId} onChange={(e) => { setProductId(e.target.value); setVersionId(products.find((p) => p.id === e.target.value)?.versions[0]?.id ?? ""); }}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="BOM (active version)" htmlFor="rv" hint={version ? `Batch = ${version.batchSize} pkts at ${version.yieldPct}% expected yield` : "This product has no active BOM"}>
            <NativeSelect id="rv" value={version?.id ?? ""} onChange={(e) => setVersionId(e.target.value)} disabled={!product?.versions.length}>
              {product?.versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Number of batches" htmlFor="rb" error={valid ? undefined : "Enter a positive number (max 3 decimals)"}>
            <Input id="rb" inputMode="decimal" value={batches} onChange={(e) => setBatches(e.target.value)} />
          </Field>
          <Field label="Planned date" htmlFor="rd"><Input id="rd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Notes" htmlFor="rn" className="sm:col-span-2 lg:col-span-4"><Textarea id="rn" rows={1} className="min-h-9" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </CardContent>
      </Card>
      {version && valid && (
        <Card>
          <CardHeader>
            <CardTitle>Expected material consumption</CardTitle>
            <p className="text-xs text-muted-foreground">Planned output {formatQty(plannedOutput(version.batchSize, batches))} pkts · expected good output {formatQty(expectedOutput(version.batchSize, batches, version.yieldPct))} pkts</p>
          </CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Material</TH><TH className="text-right">Required</TH><TH className="text-right">On hand</TH><TH className="text-right">Std cost</TH><TH>Stock</TH></TR></THead>
              <TBody>
                {req.map((r) => (
                  <TR key={r.itemId}>
                    <TD className="font-medium">{r.name}<div className="text-[11px] font-normal text-muted-foreground">{r.quantity} {r.unit.code} per batch</div></TD>
                    <TD className="tabular text-right">{formatQty(r.required)} {r.stockUnit.code}</TD>
                    <TD className="tabular text-right">{formatQty(r.onHand)} {r.stockUnit.code}</TD>
                    <TD className="tabular text-right">{formatINR(r.cost)}</TD>
                    <TD>{r.short ? <span className="inline-flex items-center gap-1 text-xs text-destructive"><TriangleAlert className="size-3.5" /> Short {formatQty(r.required.minus(D(r.onHand)))}</span> : <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" /> OK</span>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-3 text-right text-sm">Standard material cost <span className="tabular font-semibold">{formatINR(sum(req.map((r) => r.cost)))}</span></div>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end">
        <Button
          variant="brand"
          disabled={pending || !version || !valid}
          onClick={async () => {
            const r = await call<{ run: { id: string; runNo: string } }>("/api/production", { productId, bomVersionId: version!.id, plannedBatches: batches, plannedDate: date, notes: notes || undefined }, { success: (r) => `${r.run.runNo} planned` });
            router.push(`/production/${r.run.id}`);
          }}
        >
          {pending && <Loader2 className="animate-spin" />} Plan production run
        </Button>
      </div>
    </div>
  );
}
