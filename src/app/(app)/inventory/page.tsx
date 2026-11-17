import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { D, formatINR, formatQty, sum } from "@/lib/decimal";
import { formatDateTime } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { reconcileInventory } from "@/server/inventory";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ViewAll } from "@/components/app/widgets";
import { AdjustStockButton } from "./adjust-stock";

export const metadata = { title: "Inventory" };
const TABS = [
  { key: "RAW_MATERIAL", label: "Raw materials" },
  { key: "PACKAGING_MATERIAL", label: "Packaging" },
  { key: "FINISHED_GOOD", label: "Finished goods" },
] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser("inventory:view");
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "RAW_MATERIAL";
  const [items, allBalances, recon, movements] = await Promise.all([
    prisma.item.findMany({ where: { kind: tab }, include: { unit: true, balance: true, ledger: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { code: "asc" } }),
    prisma.inventoryBalance.findMany({ include: { item: true } }),
    prisma.$transaction((tx) => reconcileInventory(tx)),
    prisma.inventoryTransaction.findMany({ where: { item: { kind: tab } }, include: { item: { include: { unit: true } }, createdBy: true }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const valueOf = (k: string) => sum(allBalances.filter((b) => b.item.kind === k).map((b) => b.value));
  const mismatches = recon.filter((r) => !r.matches);
  const canAdjust = hasPermission(user.role, "inventory:adjust");
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Balances are maintained only by ledger postings (purchases, production, dispatch, returns, authorised adjustments) and reconciled against the ledger."
        actions={canAdjust && <AdjustStockButton items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit.code, onHand: D(i.balance?.quantity ?? 0).toFixed(), avgCost: D(i.balance?.avgCost ?? 0).toFixed() }))} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Raw-material value" value={formatINR(valueOf("RAW_MATERIAL"))} href="/inventory?tab=RAW_MATERIAL" />
        <StatCard label="Packaging value" value={formatINR(valueOf("PACKAGING_MATERIAL"))} href="/inventory?tab=PACKAGING_MATERIAL" />
        <StatCard label="Finished-goods value" value={formatINR(valueOf("FINISHED_GOOD"))} href="/inventory?tab=FINISHED_GOOD" />
        <StatCard label="Ledger reconciliation" value={mismatches.length ? `${mismatches.length} differ` : "Balanced"} hint={`${recon.length} items checked: cache = Σ ledger`} tone={mismatches.length ? "critical" : "good"} />
      </div>
      <div className="mt-5 flex gap-1 overflow-x-auto border-b" role="tablist">
        {TABS.map((t) => (
          <Link key={t.key} href={`/inventory?tab=${t.key}`} role="tab" aria-selected={tab === t.key} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </div>
      <Card className="mt-4">
        <CardContent className="pt-5">
          <Table>
            <THead><TR><TH>Item</TH><TH className="text-right">On hand</TH><TH className="text-right">Reorder level</TH><TH className="text-right">Avg cost</TH><TH className="text-right">Value</TH><TH>Status</TH><TH className="hidden lg:table-cell">Last movement</TH></TR></THead>
            <TBody>
              {items.map((i) => {
                const qty = D(i.balance?.quantity ?? 0);
                const low = qty.lte(D(i.reorderLevel));
                const last = i.ledger[0];
                return (
                  <TR key={i.id}>
                    <TD><div className="font-medium">{i.name}</div><div className="text-[11px] text-muted-foreground">{i.code}</div></TD>
                    <TD className="tabular text-right font-medium">{formatQty(qty)} <span className="text-[11px] text-muted-foreground">{i.unit.code}</span></TD>
                    <TD className="tabular text-right">{formatQty(i.reorderLevel)}</TD>
                    <TD className="tabular text-right">{formatINR(D(i.balance?.avgCost ?? 0).toDecimalPlaces(3).toFixed(3), 3)}</TD>
                    <TD className="tabular text-right">{formatINR(i.balance?.value ?? 0)}</TD>
                    <TD>{qty.lte(0) ? <Badge variant="danger">Out of stock</Badge> : low ? <Badge variant="warning">Reorder</Badge> : <Badge variant="success">OK</Badge>}</TD>
                    <TD className="hidden text-xs text-muted-foreground lg:table-cell">{last ? `${last.movementType.replace(/_/g, " ").toLowerCase()} · ${last.sourceRef} · ${formatDateTime(last.createdAt)}` : "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent movements</CardTitle>
          <ViewAll href="/reports/stock-ledger" label="Full stock ledger" />
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>When</TH><TH>Item</TH><TH>Movement</TH><TH className="text-right">Qty</TH><TH className="text-right">Before → after</TH><TH className="text-right">Value</TH><TH className="hidden md:table-cell">Source</TH><TH className="hidden md:table-cell">User</TH></TR></THead>
            <TBody>
              {movements.map((m) => (
                <TR key={m.id}>
                  <TD className="text-xs">{formatDateTime(m.txnDate)}</TD>
                  <TD>{m.item.name}{m.batchNo && <div className="text-[11px] text-muted-foreground">Batch {m.batchNo}</div>}</TD>
                  <TD className="text-xs capitalize">{m.movementType.replace(/_/g, " ").toLowerCase()}</TD>
                  <TD className={cn("tabular text-right font-medium", D(m.quantity).isNegative() ? "text-destructive" : "text-success")}>{D(m.quantity).gt(0) ? "+" : ""}{formatQty(m.quantity)} {m.item.unit.code}</TD>
                  <TD className="tabular text-right text-xs">{formatQty(m.balanceBefore)} → {formatQty(m.balanceAfter)}</TD>
                  <TD className="tabular text-right">{formatINR(m.value)}</TD>
                  <TD className="hidden text-xs md:table-cell">{m.sourceRef}</TD>
                  <TD className="hidden text-xs md:table-cell">{m.createdBy.name}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      {mismatches.length > 0 ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="size-4" /> {mismatches.map((m) => m.name).join(", ")} differ from the ledger.</div>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-success" /> Every balance equals the sum of its ledger movements (quantity and value).</div>
      )}
    </>
  );
}
