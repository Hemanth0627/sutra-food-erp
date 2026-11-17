"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { PERIODS } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Period segmented control (writes ?period=) plus a refresh button that re-reads the server data. */
export function PeriodFilter({ current, generatedAt }: { current: string; generatedAt: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [time, setTime] = useState("");
  useEffect(() => {
    setTime(new Date(generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }));
  }, [generatedAt]);
  const go = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("period", key);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg border bg-card p-0.5 shadow-sm">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={current === p.key}
            onClick={() => go(p.key)}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", current === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => start(() => router.refresh())} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground shadow-sm hover:text-foreground" aria-label="Refresh figures">
        <RefreshCw className={cn("size-3.5", pending && "animate-spin")} /> {time ? `Updated ${time}` : "Refresh"}
      </button>
    </div>
  );
}
