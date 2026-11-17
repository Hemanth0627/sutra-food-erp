"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatINR, formatINRCompact, formatQty } from "@/lib/decimal";

/**
 * Chart conventions (data-viz reference method): one y-axis, thin bars with 4px rounded data ends,
 * recessive grid, categorical colours in fixed order (blue → orange → aqua), legend only when there
 * are two or more series, and a hover tooltip on every mark. Values arrive as numbers for display only;
 * all business calculations happen server-side with exact decimals.
 */
export type ValueFormat = "money" | "qty" | "pct";

const fmt = (v: number, f: ValueFormat) => (f === "money" ? formatINR(v) : f === "pct" ? `${v.toFixed(2)}%` : formatQty(v));
const axisFmt = (v: number, f: ValueFormat) => (f === "money" ? formatINRCompact(v) : f === "pct" ? `${v}%` : formatQty(v));
const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export interface SeriesDef {
  key: string;
  label: string;
}

function ChartTooltip({ active, payload, label, format }: TooltipContentProps<number, string> & { format: ValueFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-foreground">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span>{p.name}</span>
          <span className="tabular ml-auto pl-3 font-medium text-foreground">{fmt(Number(p.value), format)}</span>
        </div>
      ))}
    </div>
  );
}

export function BarsChart({
  data,
  xKey,
  series,
  format = "money",
  height = 240,
  ariaLabel,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: SeriesDef[];
  format?: ValueFormat;
  height?: number;
  ariaLabel: string;
}) {
  if (!data.length) {
    return <div className="grid place-items-center text-xs text-muted-foreground" style={{ height }}>No posted transactions yet</div>;
  }
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => axisFmt(v, format)} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} format={format} />} />
          {series.length > 1 && <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={36} stroke="var(--card)" strokeWidth={1} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars for ranked categories (e.g. margin by product, variance by material). */
export function HBarsChart({ data, labelKey, valueKey, valueLabel, format = "money", ariaLabel }: { data: Record<string, string | number>[]; labelKey: string; valueKey: string; valueLabel: string; format?: ValueFormat; ariaLabel: string }) {
  if (!data.length) return <div className="grid h-40 place-items-center text-xs text-muted-foreground">No posted transactions yet</div>;
  const height = Math.max(120, data.length * 34 + 24);
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => axisFmt(v, format)} />
          <YAxis type="category" dataKey={labelKey} tickLine={false} axisLine={false} width={130} tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} format={format} />} />
          <Bar dataKey={valueKey} name={valueLabel} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
