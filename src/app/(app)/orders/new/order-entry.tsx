"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Loader2, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { enqueue, loadCatalog, newClientRef, saveCatalog, type Catalog } from "./offline-queue";
import { PendingSyncBanner } from "./pending-sync-banner";

/** Integer-paisa arithmetic for the on-screen estimate (the server recomputes with exact decimals). */
function paise(price: string): number {
  const [r, p = ""] = price.split(".");
  return Number(r) * 100 + Number((p + "00").slice(0, 2));
}
const rupees = (p: number) => `${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;

export function OrderEntry({ userId, initialCatalog }: { userId: string; initialCatalog: Catalog }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
  const [step, setStep] = useState<"customer" | "items">("customer");
  const [customerId, setCustomerId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Keep a device copy of the catalogue for offline capture; fall back to it if this render had no data.
    if (initialCatalog.products.length) saveCatalog(initialCatalog);
    else {
      const cached = loadCatalog();
      if (cached) setCatalog(cached);
    }
  }, [initialCatalog]);

  const customers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.customers
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q))
      .sort((a, b) => Number(b.salesmanId === userId) - Number(a.salesmanId === userId) || a.name.localeCompare(b.name));
  }, [catalog.customers, search, userId]);

  const customer = catalog.customers.find((c) => c.id === customerId);
  const lines = catalog.products.filter((p) => (qty[p.id] ?? 0) > 0);
  const totalPaise = lines.reduce((acc, p) => acc + paise(p.price) * (qty[p.id] ?? 0), 0);
  const totalQty = lines.reduce((acc, p) => acc + (qty[p.id] ?? 0), 0);

  const setLine = (id: string, value: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(100000, Math.floor(value || 0))) }));

  async function submit() {
    if (!customer || !lines.length) return;
    const clientRef = newClientRef();
    const payload = {
      clientRef,
      customerId: customer.id,
      notes: notes.trim() || undefined,
      capturedOffline: false,
      orderDate: new Date().toISOString(),
      items: lines.map((p) => ({ productId: p.id, quantity: String(qty[p.id]) })),
    };
    setSubmitting(true);
    const queueIt = (reason: string) => {
      enqueue({ clientRef, userId, customerName: customer.name, createdAt: payload.orderDate, payload: { ...payload, capturedOffline: true } });
      toast.message("Saved on this device", { description: `${reason} The order will sync automatically when you are back online.` });
      setQty({});
      setNotes("");
      setStep("customer");
      setCustomerId("");
    };
    try {
      if (!navigator.onLine) {
        queueIt("You are offline.");
        return;
      }
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status >= 500) queueIt("The server is unavailable.");
        else toast.error(body?.error?.message ?? "Order could not be placed");
        return;
      }
      toast.success(`Order ${body.order.orderNo} placed`, { description: `${customer.name} · ${totalQty} pkts · ₹${rupees(totalPaise)} before tax` });
      router.push(`/orders/${body.order.id}`);
      router.refresh();
    } catch {
      queueIt("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PendingSyncBanner userId={userId} />
      {step === "customer" ? (
        <>
          <h1 className="text-xl font-semibold tracking-tight">New order</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Step 1 of 2 · choose the customer</p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or city" className="h-11 pl-9 text-base" aria-label="Search customers" />
          </div>
          <ul className="mt-3 space-y-2">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setCustomerId(c.id);
                    setStep("items");
                  }}
                  className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:border-foreground/30 active:bg-accent"
                >
                  <span>
                    <span className="block font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.type === "DISTRIBUTOR" ? "Distributor" : "Retailer"} · {c.city}</span>
                  </span>
                  {c.salesmanId === userId && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">My customer</span>}
                </button>
              </li>
            ))}
            {!customers.length && <li className="py-8 text-center text-sm text-muted-foreground">No customers match.</li>}
          </ul>
        </>
      ) : (
        <>
          <button onClick={() => setStep("customer")} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="size-4" /> Change customer
          </button>
          <h1 className="text-xl font-semibold tracking-tight">{customer?.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Step 2 of 2 · add quantities (packets)</p>
          <ul className="mt-4 space-y-2 pb-40">
            {catalog.products.map((p) => {
              const q = qty[p.id] ?? 0;
              return (
                <li key={p.id} className={cn("rounded-xl border bg-card p-3 transition-colors", q > 0 && "border-brand/50 ring-1 ring-brand/20")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.category} · {formatINR(p.price)} + {Number(p.gstRate)}% GST</div>
                    </div>
                    <div className="tabular text-right text-sm font-medium">{q > 0 ? formatINR(rupees(paise(p.price) * q)) : ""}</div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => setLine(p.id, q - 10)} aria-label={`Remove 10 ${p.name}`}><Minus /></Button>
                    <Input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={q || ""}
                      placeholder="0"
                      onChange={(e) => setLine(p.id, Number(e.target.value.replace(/\D/g, "")))}
                      className="tabular h-11 flex-1 text-center text-lg font-semibold"
                      aria-label={`Quantity of ${p.name}`}
                    />
                    <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => setLine(p.id, q + 10)} aria-label={`Add 10 ${p.name}`}><Plus /></Button>
                  </div>
                </li>
              );
            })}
            <li>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the office (optional)" aria-label="Order notes" />
            </li>
          </ul>
          <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t bg-card/95 p-3 backdrop-blur md:bottom-0 md:left-60">
            <div className="mx-auto flex max-w-xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{totalQty} pkts · subtotal before tax</div>
                <div className="tabular text-lg font-semibold">{formatINR(rupees(totalPaise))}</div>
              </div>
              <Button size="lg" variant="brand" disabled={!lines.length || submitting} onClick={submit} className="h-12">
                {submitting ? <Loader2 className="animate-spin" /> : <Check />} Place order
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
