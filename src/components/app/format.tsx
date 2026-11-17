import { formatINR, formatPct, formatQty, type DecimalLike } from "@/lib/decimal";
import { cn } from "@/lib/utils";

export function Money({ value, className }: { value: DecimalLike | null | undefined; className?: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatINR(value)}</span>;
}

export function Qty({ value, unit, className }: { value: DecimalLike | null | undefined; unit?: string; className?: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>
      {formatQty(value)}
      {unit && <span className="ml-1 text-[11px] text-muted-foreground">{unit}</span>}
    </span>
  );
}

export function Pct({ value, flagged, className }: { value: DecimalLike | null | undefined; flagged?: boolean; className?: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("tabular whitespace-nowrap", flagged && "font-semibold text-destructive", className)}>{formatPct(value)}</span>;
}
