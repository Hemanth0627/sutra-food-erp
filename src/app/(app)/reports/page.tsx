import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { REPORTS, type ReportGroup } from "@/server/reports/definitions";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Reports" };
const GROUPS: ReportGroup[] = ["Sales", "Purchases", "Inventory", "Production", "Receivables", "Audit"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  await requirePageUser("reports:view");
  const { group } = await searchParams;
  const active = GROUPS.find((g) => g === group);
  return (
    <>
      <PageHeader title={active ? `${active} reports` : "Accounting & audit reports"} description="Every report is computed from posted transactions and can be filtered and exported to CSV, Excel or PDF." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/reports" className={cn("rounded-full border px-3 py-1 text-xs", !active ? "border-foreground bg-foreground text-background" : "hover:bg-accent")}>All</Link>
        {GROUPS.map((g) => (
          <Link key={g} href={`/reports?group=${g}`} className={cn("rounded-full border px-3 py-1 text-xs", active === g ? "border-foreground bg-foreground text-background" : "hover:bg-accent")}>{g}</Link>
        ))}
      </div>
      {GROUPS.filter((g) => !active || g === active).map((g) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {REPORTS.filter((r) => r.group === g).map((r) => (
              <Link key={r.key} href={`/reports/${r.key}`} className="group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/25">
                <div className="flex items-center gap-2 text-sm font-medium"><FileBarChart className="size-4 text-brand" /> {r.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">Filters: {r.filters.join(", ")}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
