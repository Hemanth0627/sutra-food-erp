"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import type { z } from "zod";
import { INDIAN_STATES } from "@/lib/gstin";
import { customerSchema, materialSchema, productSchema, supplierSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

function TriggerButton({ edit, label }: { edit: boolean; label: string }) {
  return edit ? <><Pencil /> Edit</> : <><Plus /> {label}</>;
}

function StateSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <NativeSelect {...props}>
      <option value="">Select state</option>
      {INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
    </NativeSelect>
  );
}

// ───────── Customer ─────────
type CustomerValues = z.input<typeof customerSchema>;
export function CustomerFormDialog({ customer, salesmen }: { customer?: CustomerValues & { id: string; isActive?: boolean }; salesmen: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const { call, pending } = useApi();
  const form = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer ?? { name: "", type: "RETAILER", gstin: "", phone: "", email: "", addressLine: "", city: "", stateCode: "33", pincode: "", creditLimit: "0", paymentTermsDays: 30, salesmanId: "" },
  });
  const e = form.formState.errors;
  async function onSubmit(v: CustomerValues) {
    if (customer) await call(`/api/customers/${customer.id}`, v, { method: "PATCH", success: "Customer updated" });
    else await call("/api/customers", v, { success: "Customer created" });
    setOpen(false);
    if (!customer) form.reset();
  }
  return (
    <>
      <Button variant={customer ? "outline" : "default"} size={customer ? "sm" : "default"} onClick={() => setOpen(true)}><TriggerButton edit={!!customer} label="New customer" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
            <DialogDescription>Place of supply follows the state; GSTIN is validated (format, checksum and state code).</DialogDescription>
          </DialogHeader>
          <form id="customer-form" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Name" htmlFor="c-name" error={e.name?.message}><Input id="c-name" {...form.register("name")} /></Field>
            <Field label="Type" htmlFor="c-type"><NativeSelect id="c-type" {...form.register("type")}><option value="RETAILER">Retailer</option><option value="DISTRIBUTOR">Distributor</option></NativeSelect></Field>
            <Field label="GSTIN" htmlFor="c-gstin" error={e.gstin?.message} hint="Leave blank for unregistered buyers"><Input id="c-gstin" {...form.register("gstin")} className="uppercase" /></Field>
            <Field label="Phone" htmlFor="c-phone" error={e.phone?.message}><Input id="c-phone" {...form.register("phone")} /></Field>
            <Field label="Email" htmlFor="c-email" error={e.email?.message}><Input id="c-email" type="email" {...form.register("email")} /></Field>
            <Field label="Address" htmlFor="c-addr" error={e.addressLine?.message}><Input id="c-addr" {...form.register("addressLine")} /></Field>
            <Field label="City" htmlFor="c-city" error={e.city?.message}><Input id="c-city" {...form.register("city")} /></Field>
            <Field label="State (place of supply)" htmlFor="c-state" error={e.stateCode?.message}><StateSelect id="c-state" {...form.register("stateCode")} /></Field>
            <Field label="PIN code" htmlFor="c-pin" error={e.pincode?.message}><Input id="c-pin" {...form.register("pincode")} /></Field>
            <Field label="Credit limit (₹)" htmlFor="c-cl" error={e.creditLimit?.message}><Input id="c-cl" inputMode="decimal" {...form.register("creditLimit")} /></Field>
            <Field label="Payment terms (days)" htmlFor="c-terms" error={e.paymentTermsDays?.message}><Input id="c-terms" type="number" {...form.register("paymentTermsDays")} /></Field>
            <Field label="Assigned salesman" htmlFor="c-sm">
              <NativeSelect id="c-sm" {...form.register("salesmanId")}><option value="">None</option>{salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="customer-form" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────── Supplier ─────────
type SupplierValues = z.input<typeof supplierSchema>;
export function SupplierFormDialog({ supplier }: { supplier?: SupplierValues & { id: string } }) {
  const [open, setOpen] = useState(false);
  const { call, pending } = useApi();
  const form = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: supplier ?? { name: "", gstin: "", phone: "", email: "", addressLine: "", city: "", stateCode: "33", paymentTermsDays: 30 },
  });
  const e = form.formState.errors;
  async function onSubmit(v: SupplierValues) {
    if (supplier) await call(`/api/suppliers/${supplier.id}`, v, { method: "PATCH", success: "Supplier updated" });
    else await call("/api/suppliers", v, { success: "Supplier created" });
    setOpen(false);
    if (!supplier) form.reset();
  }
  return (
    <>
      <Button variant={supplier ? "outline" : "default"} size={supplier ? "sm" : "default"} onClick={() => setOpen(true)}><TriggerButton edit={!!supplier} label="New supplier" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader><DialogTitle>{supplier ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
          <form id="supplier-form" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Name" htmlFor="s-name" error={e.name?.message}><Input id="s-name" {...form.register("name")} /></Field>
            <Field label="GSTIN" htmlFor="s-gstin" error={e.gstin?.message}><Input id="s-gstin" className="uppercase" {...form.register("gstin")} /></Field>
            <Field label="Phone" htmlFor="s-phone" error={e.phone?.message}><Input id="s-phone" {...form.register("phone")} /></Field>
            <Field label="Email" htmlFor="s-email" error={e.email?.message}><Input id="s-email" {...form.register("email")} /></Field>
            <Field label="Address" htmlFor="s-addr" error={e.addressLine?.message}><Input id="s-addr" {...form.register("addressLine")} /></Field>
            <Field label="City" htmlFor="s-city" error={e.city?.message}><Input id="s-city" {...form.register("city")} /></Field>
            <Field label="State" htmlFor="s-state" error={e.stateCode?.message}><StateSelect id="s-state" {...form.register("stateCode")} /></Field>
            <Field label="Payment terms (days)" htmlFor="s-terms" error={e.paymentTermsDays?.message}><Input id="s-terms" type="number" {...form.register("paymentTermsDays")} /></Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="supplier-form" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────── Product ─────────
type ProductValues = z.input<typeof productSchema>;
export function ProductFormDialog({ product, categories }: { product?: ProductValues & { id: string }; categories: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const { call, pending } = useApi();
  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product ?? { name: "", sku: "", categoryId: categories[0]?.id ?? "", packSize: "200 g", hsnCode: "", gstRate: "5", sellingPrice: "", reorderLevel: "50", shelfLifeDays: 90, isActive: true },
  });
  const e = form.formState.errors;
  async function onSubmit(v: ProductValues) {
    if (product) await call(`/api/products/${product.id}`, v, { method: "PATCH", success: "Product updated" });
    else await call("/api/products", v, { success: "Product created" });
    setOpen(false);
    if (!product) form.reset();
  }
  return (
    <>
      <Button variant={product ? "outline" : "default"} size={product ? "sm" : "default"} onClick={() => setOpen(true)}><TriggerButton edit={!!product} label="New product" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>{product ? "Edit product" : "New finished product"}</DialogTitle>
            <DialogDescription>Price changes apply to new orders only; posted invoices keep their own prices. Every change is audited.</DialogDescription>
          </DialogHeader>
          <form id="product-form" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Product name" htmlFor="p-name" error={e.name?.message}><Input id="p-name" {...form.register("name")} /></Field>
            <Field label="SKU" htmlFor="p-sku" error={e.sku?.message} hint={product ? "SKU is fixed after creation" : undefined}><Input id="p-sku" className="uppercase" readOnly={!!product} {...form.register("sku")} /></Field>
            <Field label="Category" htmlFor="p-cat"><NativeSelect id="p-cat" {...form.register("categoryId")}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <Field label="Pack size" htmlFor="p-pack" error={e.packSize?.message}><Input id="p-pack" {...form.register("packSize")} /></Field>
            <Field label="HSN code" htmlFor="p-hsn" error={e.hsnCode?.message}><Input id="p-hsn" {...form.register("hsnCode")} /></Field>
            <Field label="GST rate (%)" htmlFor="p-gst" error={e.gstRate?.message}><Input id="p-gst" inputMode="decimal" {...form.register("gstRate")} /></Field>
            <Field label="Selling price before tax (₹)" htmlFor="p-price" error={e.sellingPrice?.message}><Input id="p-price" inputMode="decimal" {...form.register("sellingPrice")} /></Field>
            <Field label="Reorder level (packets)" htmlFor="p-reorder" error={e.reorderLevel?.message}><Input id="p-reorder" inputMode="decimal" {...form.register("reorderLevel")} /></Field>
            <Field label="Shelf life (days)" htmlFor="p-shelf" error={e.shelfLifeDays?.message}><Input id="p-shelf" type="number" {...form.register("shelfLifeDays")} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--brand)]" {...form.register("isActive")} /> Active (available for orders)</label>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="product-form" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────── Material ─────────
type MaterialValues = z.input<typeof materialSchema>;
export function MaterialFormDialog({ material, units }: { material?: MaterialValues & { id: string }; units: { id: string; code: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const { call, pending } = useApi();
  const form = useForm<MaterialValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: material ?? { name: "", code: "", kind: "RAW_MATERIAL", unitId: units[0]?.id ?? "", reorderLevel: "0", description: "", isActive: true },
  });
  const e = form.formState.errors;
  async function onSubmit(v: MaterialValues) {
    if (material) await call(`/api/materials/${material.id}`, v, { method: "PATCH", success: "Material updated" });
    else await call("/api/materials", v, { success: "Material created" });
    setOpen(false);
    if (!material) form.reset();
  }
  return (
    <>
      <Button variant={material ? "outline" : "default"} size={material ? "sm" : "default"} onClick={() => setOpen(true)}><TriggerButton edit={!!material} label="New material" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{material ? "Edit material" : "New raw / packaging material"}</DialogTitle>
            <DialogDescription>Stock starts at zero; receive it through a purchase or an authorised stock adjustment.</DialogDescription>
          </DialogHeader>
          <form id="material-form" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Name" htmlFor="m-name" error={e.name?.message}><Input id="m-name" {...form.register("name")} /></Field>
            <Field label="Code" htmlFor="m-code" error={e.code?.message}><Input id="m-code" className="uppercase" readOnly={!!material} {...form.register("code")} /></Field>
            <Field label="Category" htmlFor="m-kind"><NativeSelect id="m-kind" disabled={!!material} {...form.register("kind")}><option value="RAW_MATERIAL">Raw material</option><option value="PACKAGING_MATERIAL">Packaging</option></NativeSelect></Field>
            <Field label="Stock unit" htmlFor="m-unit"><NativeSelect id="m-unit" {...form.register("unitId")}>{units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}</NativeSelect></Field>
            <Field label="Reorder level" htmlFor="m-reorder" error={e.reorderLevel?.message}><Input id="m-reorder" inputMode="decimal" {...form.register("reorderLevel")} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--brand)]" {...form.register("isActive")} /> Active</label>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="material-form" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
