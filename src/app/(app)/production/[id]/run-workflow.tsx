"use client";
import { useState } from "react";
import { Ban, Loader2, PackageCheck, Play, Wand2 } from "lucide-react";
import { D, formatPct, formatQty } from "@/lib/decimal";
import { consumptionVariancePct, exceedsTolerance, yieldVariancePct } from "@/lib/production";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

export interface RunMaterial {
  itemId: string;
  name: string;
  kind: string;
  unit: string;
  plannedQty: string;
  issuedQty: string | null;
  onHand: string;
}

const isNum = (v: string) => /^\d+(\.\d{1,3})?$/.test(v);

export function RunWorkflow({ runId, runNo, status, materials, plannedOutput, expectedOutput, tolerance }: { runId: string; runNo: string; status: string; materials: RunMaterial[]; plannedOutput: string; expectedOutput: string; tolerance: string }) {
  const { call, pending } = useApi();
  const [issued, setIssued] = useState<Record<string, string>>(Object.fromEntries(materials.map((m) => [m.itemId, m.issuedQty ?? m.plannedQty])));
  const [actual, setActual] = useState<Record<string, string>>(Object.fromEntries(materials.map((m) => [m.itemId, m.issuedQty ?? m.plannedQty])));
  const [damaged, setDamaged] = useState<Record<string, string>>(Object.fromEntries(materials.map((m) => [m.itemId, "0"])));
  const [good, setGood] = useState("");
  const [scrap, setScrap] = useState("");
  const [scrapNotes, setScrapNotes] = useState("");

  const fillPackaging = () => {
    if (!isNum(good)) return;
    setActual((a) => {
      const next = { ...a };
      for (const m of materials.filter((x) => x.kind === "PACKAGING_MATERIAL")) {
        const perUnit = D(m.plannedQty).div(D(plannedOutput));
        // Whole units only: e.g. 188 packets / 20 per carton = 9 full cartons (loose packets go in the next carton).
        next[m.itemId] = D(good).times(perUnit).floor().toString();
      }
      return next;
    });
  };

  async function cancel() {
    const reason = window.prompt(`Why is ${runNo} being cancelled?`);
    if (reason && reason.trim().length >= 3) await call(`/api/production/${runId}/cancel`, { reason }, { success: `${runNo} cancelled` });
  }

  if (status === "PLANNED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Issue materials & start</CardTitle>
          <CardDescription>Record the quantities issued to the line. Stock is checked now and deducted when the run is completed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Material</TH><TH className="text-right">BOM standard</TH><TH className="text-right">On hand</TH><TH className="w-40 text-right">Issued</TH></TR></THead>
            <TBody>
              {materials.map((m) => (
                <TR key={m.itemId}>
                  <TD className="font-medium">{m.name}</TD>
                  <TD className="tabular text-right">{formatQty(m.plannedQty)} {m.unit}</TD>
                  <TD className={cn("tabular text-right", D(m.onHand).lt(D(isNum(issued[m.itemId]) ? issued[m.itemId] : "0")) && "text-destructive")}>{formatQty(m.onHand)} {m.unit}</TD>
                  <TD><Input inputMode="decimal" className="tabular text-right" value={issued[m.itemId]} onChange={(e) => setIssued((s) => ({ ...s, [m.itemId]: e.target.value }))} aria-label={`Issued ${m.name}`} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={cancel} disabled={pending}><Ban /> Cancel run</Button>
            <Button variant="brand" disabled={pending || materials.some((m) => !isNum(issued[m.itemId]))} onClick={() => call(`/api/production/${runId}/start`, { materials: materials.map((m) => ({ itemId: m.itemId, actualQty: issued[m.itemId] })) }, { success: `${runNo} started` })}>
              {pending ? <Loader2 className="animate-spin" /> : <Play />} Start run
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status !== "IN_PROGRESS") return null;
  const yieldVar = isNum(good) ? yieldVariancePct(good, expectedOutput) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Record output & complete</CardTitle>
        <CardDescription>
          On completion, one database transaction deducts raw materials and packaging (including damaged packaging), adds the good output to finished goods, freezes the costing snapshot and flags variances above ±{D(tolerance).toFixed(0)}%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Good output (packets)" htmlFor="good" hint={yieldVar ? `Expected ${formatQty(expectedOutput)} · yield variance ${formatPct(yieldVar)}` : `Expected ${formatQty(expectedOutput)}`}>
            <Input id="good" inputMode="decimal" value={good} onChange={(e) => setGood(e.target.value)} className={cn("tabular", yieldVar && exceedsTolerance(yieldVar, tolerance) && "border-destructive")} />
          </Field>
          <Field label="Process scrap / wastage (kg)" htmlFor="scrap" hint="Broken or burnt product, optional"><Input id="scrap" inputMode="decimal" value={scrap} onChange={(e) => setScrap(e.target.value)} /></Field>
          <Field label="Scrap notes" htmlFor="scrapn"><Input id="scrapn" value={scrapNotes} onChange={(e) => setScrapNotes(e.target.value)} /></Field>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm font-medium">Actual consumption</div>
          <Button type="button" size="sm" variant="ghost" onClick={fillPackaging} disabled={!isNum(good)}><Wand2 /> Packaging from good output</Button>
        </div>
        <Table>
          <THead><TR><TH>Material</TH><TH className="text-right">BOM standard</TH><TH className="w-32 text-right">Used</TH><TH className="w-32 text-right">Damaged / wasted</TH><TH className="text-right">Total</TH><TH className="text-right">Variance</TH></TR></THead>
          <TBody>
            {materials.map((m) => {
              const a = isNum(actual[m.itemId] ?? "") ? actual[m.itemId] : "0";
              const d = isNum(damaged[m.itemId] ?? "") ? damaged[m.itemId] : "0";
              const total = D(a).plus(D(d));
              const v = consumptionVariancePct(total, m.plannedQty);
              const flagged = exceedsTolerance(v, tolerance);
              return (
                <TR key={m.itemId}>
                  <TD className="font-medium">{m.name}<div className="text-[11px] font-normal text-muted-foreground">Issued {formatQty(m.issuedQty ?? m.plannedQty)} {m.unit}</div></TD>
                  <TD className="tabular text-right">{formatQty(m.plannedQty)} {m.unit}</TD>
                  <TD><Input inputMode="decimal" className="tabular text-right" value={actual[m.itemId]} onChange={(e) => setActual((s) => ({ ...s, [m.itemId]: e.target.value }))} aria-label={`Used ${m.name}`} /></TD>
                  <TD><Input inputMode="decimal" className="tabular text-right" value={damaged[m.itemId]} onChange={(e) => setDamaged((s) => ({ ...s, [m.itemId]: e.target.value }))} aria-label={`Damaged ${m.name}`} /></TD>
                  <TD className="tabular text-right">{formatQty(total)} {m.unit}</TD>
                  <TD className={cn("tabular text-right", flagged && "font-semibold text-destructive")}>{formatPct(v)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={cancel} disabled={pending}><Ban /> Cancel run</Button>
          <Button
            variant="brand"
            disabled={pending || !isNum(good) || materials.some((m) => !isNum(actual[m.itemId] ?? "") || !isNum(damaged[m.itemId] ?? ""))}
            onClick={() =>
              call(
                `/api/production/${runId}/complete`,
                {
                  actualGoodOutput: good,
                  scrapQty: scrap && isNum(scrap) ? scrap : undefined,
                  scrapNotes: scrapNotes || undefined,
                  materials: materials.map((m) => ({ itemId: m.itemId, actualQty: actual[m.itemId], damagedQty: damaged[m.itemId] || "0" })),
                },
                { success: `${runNo} completed and posted to the stock ledger` },
              )
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />} Complete run
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
