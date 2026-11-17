"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

/** Search + optional status filter that writes to the URL so server components do the filtering. */
export function ListToolbar({ placeholder = "Search…", statuses, statusParam = "status", children }: { placeholder?: string; statuses?: { value: string; label: string }[]; statusParam?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q) next.set("q", q);
      else next.delete("q");
      if (next.toString() !== params.toString()) router.replace(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q, params, pathname, router]);

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8" aria-label="Search" />
      </div>
      {statuses && (
        <div className="w-full sm:w-48">
          <NativeSelect
            aria-label="Filter by status"
            value={params.get(statusParam) ?? ""}
            onChange={(e) => {
              const next = new URLSearchParams(params.toString());
              if (e.target.value) next.set(statusParam, e.target.value);
              else next.delete(statusParam);
              router.replace(`${pathname}?${next.toString()}`);
            }}
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </NativeSelect>
        </div>
      )}
      {children}
    </div>
  );
}
