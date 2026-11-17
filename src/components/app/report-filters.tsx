"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/app/field";

export type FilterKind = "date" | "customer" | "product" | "type";

/** One row of filters above the report (date range, customer, product, transaction type), synced to the URL. */
export function ReportFiltersBar({
  filters,
  values,
  customers,
  products,
  typeOptions,
}: {
  filters: FilterKind[];
  values: { from: string; to: string; customerId?: string; productId?: string; type?: string };
  customers: { id: string; name: string }[];
  products: { id: string; name: string }[];
  typeOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [v, setV] = useState(values);
  const apply = (next = v) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, val] of Object.entries(next)) {
      if (val) q.set(k, val);
      else q.delete(k);
    }
    router.push(`${pathname}?${q.toString()}`);
  };
  return (
    <form
      className="mb-4 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      {filters.includes("date") && (
        <>
          <Field label="From" htmlFor="f-from" className="lg:w-40"><Input id="f-from" type="date" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /></Field>
          <Field label="To" htmlFor="f-to" className="lg:w-40"><Input id="f-to" type="date" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></Field>
        </>
      )}
      {filters.includes("customer") && (
        <Field label="Customer" htmlFor="f-c" className="lg:w-52">
          <NativeSelect id="f-c" value={v.customerId ?? ""} onChange={(e) => setV({ ...v, customerId: e.target.value })}><option value="">All customers</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
        </Field>
      )}
      {filters.includes("product") && (
        <Field label="Product" htmlFor="f-p" className="lg:w-52">
          <NativeSelect id="f-p" value={v.productId ?? ""} onChange={(e) => setV({ ...v, productId: e.target.value })}><option value="">All products</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
        </Field>
      )}
      {filters.includes("type") && typeOptions && (
        <Field label="Type" htmlFor="f-t" className="lg:w-52">
          <NativeSelect id="f-t" value={v.type ?? ""} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="">All types</option>{typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect>
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit"><Filter /> Apply</Button>
      </div>
    </form>
  );
}
