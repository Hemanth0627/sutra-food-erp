import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert, Info } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { formatINR, formatPct, formatQty, type Dec } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ErpAlert } from "@/server/queries/dashboard";

export function SectionCard({ title, description, action, children, className }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
      {label} <ArrowRight className="size-3.5" />
    </Link>
  );
}

const SEV = {
  critical: { icon: CircleAlert, cls: "text-destructive", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Warning" },
  info: { icon: Info, cls: "text-info", label: "Info" },
} as const;

export function AlertList({ alerts, limit }: { alerts: ErpAlert[]; limit?: number }) {
  const list = limit ? alerts.slice(0, limit) : alerts;
  if (!list.length) return <p className="py-6 text-center text-sm text-muted-foreground">No alerts. Everything is within limits.</p>;
  return (
    <ul className="divide-y">
      {list.map((a) => {
        const s = SEV[a.severity];
        return (
          <li key={a.id}>
            <Link href={a.href} className="flex gap-3 py-2.5 hover:bg-muted/40">
              <s.icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} aria-label={s.label} />
              <div className="min-w-0">
                <div className="text-sm font-medium">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.category} · {a.detail}</div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityList({ items }: { items: { id: string; summary: string; createdAt: Date; user: { name: string } | null; action: string }[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border ring-4 ring-card" aria-hidden />
          <div className="text-[13px] leading-snug">{a.summary}</div>
          <div className="text-[11px] text-muted-foreground">{a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}</div>
        </li>
      ))}
    </ol>
  );
}

export function ProfitabilityTable({ rows }: { rows: { productId: string; name: string; qty: Dec; revenue: Dec; unitCost: Dec; cost: Dec; margin: Dec; marginPct: Dec; costBasis: string }[] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No invoiced sales yet.</p>;
  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH className="text-right">Qty sold</TH>
          <TH className="text-right">Revenue</TH>
          <TH className="text-right">Cost / unit</TH>
          <TH className="text-right">Gross margin</TH>
          <TH className="text-right">Margin %</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.productId}>
            <TD>
              <div className="font-medium">{r.name}</div>
              <div className="text-[11px] text-muted-foreground">Cost basis: {r.costBasis}</div>
            </TD>
            <TD className="tabular text-right">{formatQty(r.qty)}</TD>
            <TD className="tabular text-right">{formatINR(r.revenue)}</TD>
            <TD className="tabular text-right">{formatINR(r.unitCost)}</TD>
            <TD className="tabular text-right">{formatINR(r.margin)}</TD>
            <TD className="tabular text-right">{formatPct(r.marginPct, 2, false)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
