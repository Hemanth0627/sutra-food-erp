"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { D, formatINR, formatPct, formatQty, round2 } from "@/lib/decimal";
import { computeInvoice } from "@/lib/gst";
import { computeRunCosting, consumptionVariancePct, exceedsTolerance, yieldVariancePct } from "@/lib/production";
import { cn } from "@/lib/utils";

/**
 * "Try it" calculator for the landing page. It runs the same pure functions the ERP uses when it
 * completes a production run and issues an invoice (src/lib/production.ts, src/lib/gst.ts). The
 * defaults are the assignment benchmark, so untouched it shows ₹31.14 per packet and a ₹7,875 invoice.
 * Nothing is saved; it is a calculator, not live data.
 */

// Murukku 200 g BOM for one batch of 200 packets, with the benchmark rates.
const STD = { flourKg: 40, oilL: 10, spiceKg: 1.2, pouches: 200, cartons: 10, output: 200 };
const RATE = { flour: "43.125", oil: "140", spice: "200", pouch: "2.50", carton: "15", price: "50" };
const OPENING_FG = 50;
const TOLERANCE = 3;
const BENCHMARK = { oil: 10.5, good: 188, damaged: 6, labour: 1200, energy: 600, qty: 150, state: "33" };

const STATES = [
  { code: "33", label: "Retailer A · Tamil Nadu" },
  { code: "29", label: "Distributor B · Karnataka" },
];

function Slider({ id, label, value, min, max, step, onChange, unit, hint }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-zinc-300">{label}</label>
        <span className="tabular text-sm font-semibold text-white">{unit === "₹" ? formatINR(value, 0) : `${formatQty(value)} ${unit}`}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={unit === "₹" ? `${value} rupees` : `${value} ${unit}`}
        className="mt-2 w-full cursor-pointer accent-amber-500"
      />
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

function Flag({ value, adverseLabel }: { value: ReturnType<typeof D>; adverseLabel: string }) {
  const flagged = exceedsTolerance(value, TOLERANCE);
  return (
    <span className={cn("mt-1 inline-flex items-center gap-1 text-[11px] font-medium", flagged ? "text-amber-400" : "text-emerald-400")}>
      {flagged ? <AlertTriangle className="size-3" aria-hidden="true" /> : <CheckCircle2 className="size-3" aria-hidden="true" />}
      {flagged ? `Outside ±${TOLERANCE}%: ${adverseLabel}` : `Within ±${TOLERANCE}%`}
    </span>
  );
}

export function BatchLab() {
  const [oil, setOil] = useState(BENCHMARK.oil);
  const [good, setGood] = useState(BENCHMARK.good);
  const [damaged, setDamaged] = useState(BENCHMARK.damaged);
  const [labour, setLabour] = useState(BENCHMARK.labour);
  const [energy, setEnergy] = useState(BENCHMARK.energy);
  const [qty, setQty] = useState(BENCHMARK.qty);
  const [state, setState] = useState(BENCHMARK.state);
  const isBenchmark = oil === BENCHMARK.oil && good === BENCHMARK.good && damaged === BENCHMARK.damaged && labour === BENCHMARK.labour && energy === BENCHMARK.energy && qty === BENCHMARK.qty && state === BENCHMARK.state;

  const r = useMemo(() => {
    const pouchesUsed = good + damaged;
    const cartons = Math.floor(good / 20); // full cartons only, as on the packing line
    const lines = {
      flour: round2(D(STD.flourKg).times(RATE.flour)),
      oil: round2(D(oil).times(RATE.oil)),
      spice: round2(D(STD.spiceKg).times(RATE.spice)),
      pouches: round2(D(pouchesUsed).times(RATE.pouch)),
      cartons: round2(D(cartons).times(RATE.carton)),
    };
    const costing = computeRunCosting({
      rawMaterialValues: [lines.flour, lines.oil, lines.spice],
      packagingValues: [lines.pouches, lines.cartons],
      labour: String(labour),
      energy: String(energy),
      otherOverhead: "0",
      goodOutput: String(good),
      sellingPrice: RATE.price,
    });
    const available = OPENING_FG + good;
    const billable = Math.min(qty, available);
    const invoice = computeInvoice(billable > 0 ? [{ quantity: String(billable), rate: RATE.price, gstRate: "5" }] : [], "33", state);
    return {
      pouchesUsed,
      cartons,
      lines,
      costing,
      oilVar: consumptionVariancePct(oil, STD.oilL),
      yieldVar: yieldVariancePct(good, STD.output),
      available,
      billable,
      shortage: Math.max(0, qty - available),
      invoice,
    };
  }, [oil, good, damaged, labour, energy, qty, state]);

  const reset = () => {
    setOil(BENCHMARK.oil);
    setGood(BENCHMARK.good);
    setDamaged(BENCHMARK.damaged);
    setLabour(BENCHMARK.labour);
    setEnergy(BENCHMARK.energy);
    setQty(BENCHMARK.qty);
    setState(BENCHMARK.state);
  };
  const intra = r.invoice.supplyType === "INTRA_STATE";
  const t = r.invoice.totals;

  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Controls */}
      <div className="space-y-4">
        <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <legend className="px-1 text-xs font-medium uppercase tracking-wider text-amber-400">Make · one batch (BOM: 200 packets)</legend>
          <div className="space-y-5">
            <Slider id="lab-oil" label="Oil issued" value={oil} min={9} max={12} step={0.1} onChange={setOil} unit="L" hint="BOM standard 10 L at ₹140/L. Flour 40 kg (₹43.125/kg weighted average) and spice 1.2 kg are issued to standard." />
            <Slider id="lab-good" label="Good packets packed" value={good} min={160} max={200} step={1} onChange={setGood} unit="pkts" hint="Expected 200. Cartons used = full cartons of 20." />
            <Slider id="lab-damaged" label="Pouches damaged on the line" value={damaged} min={0} max={20} step={1} onChange={setDamaged} unit="pcs" hint="Damaged pouches are written off and still costed to the batch." />
            <div className="grid gap-5 sm:grid-cols-2">
              <Slider id="lab-labour" label="Labour" value={labour} min={0} max={3000} step={100} onChange={setLabour} unit="₹" />
              <Slider id="lab-energy" label="Gas & power" value={energy} min={0} max={1500} step={50} onChange={setEnergy} unit="₹" />
            </div>
          </div>
        </fieldset>
        <fieldset className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <legend className="px-1 text-xs font-medium uppercase tracking-wider text-amber-400">Sell · at ₹50 a packet + 5% GST</legend>
          <div className="space-y-5">
            <Slider id="lab-qty" label="Packets ordered" value={qty} min={10} max={300} step={10} onChange={setQty} unit="pkts" hint={`In stock after this batch: ${OPENING_FG} opening + ${good} made = ${r.available}.`} />
            <div role="radiogroup" aria-label="Customer" className="grid grid-cols-2 gap-2">
              {STATES.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  role="radio"
                  aria-checked={state === s.code}
                  onClick={() => setState(s.code)}
                  className={cn("rounded-lg border px-3 py-2 text-left text-sm transition-colors", state === s.code ? "border-amber-400/60 bg-amber-400/10 text-white" : "border-white/10 text-zinc-400 hover:text-white")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-white/10 bg-[#0f0f11] p-5" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">{isBenchmark ? "Showing the assignment benchmark" : "Your batch"}</p>
          <button type="button" onClick={reset} disabled={isBenchmark} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/5 disabled:opacity-40">
            <RotateCcw className="size-3.5" /> Reset to benchmark
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 p-4">
            <dt className="text-xs text-zinc-400">Cost per good packet</dt>
            <dd className="tabular mt-1 text-2xl font-semibold text-white">{formatINR(round2(r.costing.costPerUnit))}</dd>
            <dd className="text-[11px] text-zinc-500">Margin {formatINR(round2(r.costing.grossMarginPerUnit))} ({formatPct(r.costing.marginPct, 1, false)})</dd>
          </div>
          <div className="rounded-xl border border-white/10 p-4">
            <dt className="text-xs text-zinc-400">Invoice total</dt>
            <dd className="tabular mt-1 text-2xl font-semibold text-white">{formatINR(t.grandTotal)}</dd>
            <dd className="text-[11px] text-zinc-500">{intra ? "Same state: CGST + SGST" : "Other state: IGST"}</dd>
          </div>
          <div className="rounded-xl border border-white/10 p-4">
            <dt className="text-xs text-zinc-400">Oil variance</dt>
            <dd className="tabular mt-1 text-xl font-semibold text-white">{formatPct(r.oilVar)}</dd>
            <dd><Flag value={r.oilVar} adverseLabel="flagged" /></dd>
          </div>
          <div className="rounded-xl border border-white/10 p-4">
            <dt className="text-xs text-zinc-400">Yield variance</dt>
            <dd className="tabular mt-1 text-xl font-semibold text-white">{formatPct(r.yieldVar)}</dd>
            <dd><Flag value={r.yieldVar} adverseLabel="flagged" /></dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Batch cost</p>
            <dl className="mt-2 space-y-1 text-sm">
              {[
                ["Flour 40 kg", r.lines.flour],
                [`Oil ${formatQty(oil)} L`, r.lines.oil],
                ["Spice 1.2 kg", r.lines.spice],
                [`Pouches ${r.pouchesUsed}${damaged ? ` (incl. ${damaged} damaged)` : ""}`, r.lines.pouches],
                [`Cartons ${r.cartons}`, r.lines.cartons],
                ["Labour", D(labour)],
                ["Gas & power", D(energy)],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-2 text-zinc-400"><dt>{String(k)}</dt><dd className="tabular text-zinc-200">{formatINR(v as ReturnType<typeof D>)}</dd></div>
              ))}
              <div className="flex justify-between gap-2 border-t border-white/10 pt-1 font-semibold text-white"><dt>Total ÷ {good} good</dt><dd className="tabular">{formatINR(r.costing.totalCost)}</dd></div>
            </dl>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">GST invoice</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2 text-zinc-400"><dt>{r.billable} × ₹50</dt><dd className="tabular text-zinc-200">{formatINR(t.taxableTotal)}</dd></div>
              {intra ? (
                <>
                  <div className="flex justify-between gap-2 text-zinc-400"><dt>CGST 2.5%</dt><dd className="tabular text-zinc-200">{formatINR(t.cgstTotal)}</dd></div>
                  <div className="flex justify-between gap-2 text-zinc-400"><dt>SGST 2.5%</dt><dd className="tabular text-zinc-200">{formatINR(t.sgstTotal)}</dd></div>
                </>
              ) : (
                <div className="flex justify-between gap-2 text-zinc-400"><dt>IGST 5%</dt><dd className="tabular text-zinc-200">{formatINR(t.igstTotal)}</dd></div>
              )}
              {!t.roundOff.isZero() && <div className="flex justify-between gap-2 text-zinc-400"><dt>Round off</dt><dd className="tabular text-zinc-200">{formatINR(t.roundOff)}</dd></div>}
              <div className="flex justify-between gap-2 border-t border-white/10 pt-1 font-semibold text-white"><dt>Total</dt><dd className="tabular">{formatINR(t.grandTotal)}</dd></div>
            </dl>
            {r.shortage > 0 && (
              <p className="mt-3 flex gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>Short by {r.shortage} packets: only {r.available} in stock, so only {r.billable} can be invoiced and dispatched.</span>
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          Runs the same costing, variance and GST code as the ERP. Nothing is saved: in the app these numbers come from posted stock-ledger and invoice records.
        </p>
      </div>
    </div>
  );
}
