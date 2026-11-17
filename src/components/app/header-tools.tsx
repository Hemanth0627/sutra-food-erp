"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Loader2, Search } from "lucide-react";
import { NAV } from "@/lib/nav";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Hit {
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Global search: pages the role can open plus matching documents and masters (server-filtered by role). */
export function HeaderSearch({ role }: { role: Role }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? ""))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = (await res.json()) as { hits?: Hit[] };
        const pages: Hit[] = NAV[role]
          .flatMap((s) => s.items)
          .filter((i) => i.label.toLowerCase().includes(term.toLowerCase()))
          .slice(0, 4)
          .map((i) => ({ type: "Page", title: i.label, subtitle: "Go to page", href: i.href }));
        setHits([...pages, ...(json.hits ?? [])]);
        setActive(0);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, role]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    router.push(h.href);
  };

  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && hits[active]) {
            go(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Search orders, invoices, customers…"
        aria-label="Search"
        role="combobox"
        aria-expanded={open && q.trim().length >= 2}
        aria-controls="global-search-results"
        aria-activedescendant={hits[active] ? `search-hit-${active}` : undefined}
        className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-12 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">Ctrl K</kbd>
      {open && q.trim().length >= 2 && (
        <ul id="global-search-results" role="listbox" className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
          {loading && !hits.length && <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Searching…</li>}
          {!loading && !hits.length && <li className="px-3 py-2 text-sm text-muted-foreground">No matches for “{q.trim()}”</li>}
          {hits.map((h, i) => (
            <li key={`${h.type}-${h.href}-${i}`} id={`search-hit-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left", i === active ? "bg-accent" : "")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{h.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>
                </span>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{h.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Note {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
}

const SEV_DOT = { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-sky-500" };

/** Bell menu backed by /api/notifications (live alerts for office roles, order decisions for salesmen). */
export function NotificationsBell() {
  const [data, setData] = useState<{ count: number; items: Note[]; moreHref: string } | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (res.ok && !stop) setData(await res.json());
      } catch {
        /* offline */
      }
    };
    void load();
    const t = setInterval(() => !document.hidden && load(), 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  const count = data?.count ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-md hover:bg-accent" aria-label={count ? `Notifications: ${count} need attention` : "Notifications"}>
          <Bell className="size-4" />
          {count > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">{count > 9 ? "9+" : count}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data?.items.length ? (
          <ul className="max-h-96 overflow-y-auto">
            {data.items.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="flex gap-2.5 rounded-md px-2 py-2 hover:bg-accent">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEV_DOT[n.severity])} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug text-foreground"><span className="sr-only">{n.severity}: </span>{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{n.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">{data ? "Nothing needs your attention." : "Loading…"}</p>
        )}
        {data && (
          <>
            <DropdownMenuSeparator />
            <Link href={data.moreHref} className="block rounded-md px-2 py-1.5 text-center text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">View all</Link>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
