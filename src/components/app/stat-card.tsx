import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical";
  href?: string;
  className?: string;
}) {
  const toneBar = { neutral: "bg-border", good: "bg-success", warning: "bg-warning", critical: "bg-destructive" }[tone];
  const body = (
    <div className={cn("relative h-full overflow-hidden rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors", href && "hover:border-foreground/20", className)}>
      <span className={cn("absolute inset-y-3 left-0 w-0.5 rounded-r", toneBar)} aria-hidden />
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="tabular mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
