"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronRight, LogOut, Menu, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { breadcrumbLabel, NAV, SALESMAN_TABS, type NavItem } from "@/lib/nav";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandMark, BrandName } from "./brand";
import { ICONS } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { useOnline } from "./use-online";

export interface ShellUser {
  name: string;
  email: string;
  role: Role;
}

/** Picks the single best-matching nav entry (longest path prefix; query-specific entries win on a query match). */
function activeHref(role: Role, pathname: string, search: URLSearchParams): string | null {
  let best: { href: string; score: number } | null = null;
  for (const item of NAV[role].flatMap((s) => s.items)) {
    const [path, query] = item.href.split("?");
    const pathMatch = pathname === path || (path !== "/dashboard" && pathname.startsWith(path + "/"));
    if (!pathMatch) continue;
    let score = path.length * 10 + (pathname === path ? 5 : 0);
    if (query) {
      const [k, v] = query.split("=");
      if (search.get(k) !== v) continue;
      score += 3;
    }
    if (!best || score > best.score) best = { href: item.href, score };
  }
  return best?.href ?? null;
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = activeHref(role, pathname, search);
  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Main">
      {NAV[role].map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.title && <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{section.title}</div>}
          {section.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.href === current;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                  active ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {Icon && <Icon className={cn("size-4", active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")} />}
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  return (
    <ol className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex" aria-label="Breadcrumb">
      <li>
        <Link href="/dashboard" className="hover:text-foreground">Home</Link>
      </li>
      {parts.filter((p) => p !== "dashboard").map((p, i, arr) => {
        const href = "/" + parts.slice(0, parts.indexOf(p) + 1).join("/");
        const last = i === arr.length - 1;
        return (
          <li key={href} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0" />
            {last ? <span className="truncate font-medium text-foreground">{breadcrumbLabel(p)}</span> : <Link href={href} className="truncate hover:text-foreground">{breadcrumbLabel(p)}</Link>}
          </li>
        );
      })}
    </ol>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const initials = user.name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-accent" aria-label="Account menu">
          <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{initials || "U"}</span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block max-w-40 truncate text-xs font-medium">{user.name}</span>
            <span className="block text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="font-medium text-foreground">{user.name}</div>
          <div>{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Salesman">
      <ul className="grid grid-cols-5">
        {SALESMAN_TABS.map((t: NavItem) => {
          const Icon = ICONS[t.icon];
          const active = t.href === "/orders" ? pathname === "/orders" || (pathname.startsWith("/orders/") && pathname !== "/orders/new") : pathname === t.href;
          return (
            <li key={t.href}>
              <Link href={t.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-brand" : "text-muted-foreground")} aria-current={active ? "page" : undefined}>
                {Icon && <Icon className={cn("size-5", t.icon === "new" && "size-6")} />}
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const online = useOnline();
  const isSalesman = user.role === "SALESMAN";
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar md:flex">
        <Link href="/dashboard" className="flex h-14 items-center gap-2.5 border-b px-5">
          <BrandMark className="size-6" />
          <BrandName className="text-[15px]" />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavLinks role={user.role} />
        </div>
        <div className="border-t px-5 py-3 text-[11px] leading-snug text-muted-foreground">
          Thenmalai Snacks · demo data is fictional
        </div>
      </aside>
      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          {!isSalesman && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-14 items-center gap-2.5 border-b px-5">
                  <BrandMark className="size-6" />
                  <BrandName />
                </div>
                <div className="flex-1 overflow-y-auto">
                  <NavLinks role={user.role} onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          )}
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <BrandMark className="size-6" />
            <BrandName className="text-sm" />
          </Link>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1">
            {!online && (
              <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                <WifiOff className="size-3" /> Offline
              </span>
            )}
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <main className={cn("mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 md:py-7", isSalesman && "pb-24 md:pb-7")}>{children}</main>
      </div>
      {isSalesman && <BottomTabs />}
    </div>
  );
}
