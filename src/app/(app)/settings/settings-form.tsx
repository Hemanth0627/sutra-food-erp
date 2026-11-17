"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import type { z } from "zod";
import { INDIAN_STATES } from "@/lib/gstin";
import { settingsSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

type Values = z.input<typeof settingsSchema>;

export function SettingsForm({ initial }: { initial: Values }) {
  const { call, pending } = useApi();
  const form = useForm<Values>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const e = form.formState.errors;
  return (
    <form onSubmit={form.handleSubmit((v) => call("/api/settings", v, { method: "PUT", success: "Settings saved" }))} noValidate>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Seller (factory) details</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Legal name" htmlFor="ln" error={e.legalName?.message}><Input id="ln" {...form.register("legalName")} /></Field>
            <Field label="Trade name" htmlFor="tn" error={e.tradeName?.message}><Input id="tn" {...form.register("tradeName")} /></Field>
            <Field label="GSTIN" htmlFor="gst" error={e.gstin?.message}><Input id="gst" className="uppercase" {...form.register("gstin")} /></Field>
            <Field label="State" htmlFor="st"><NativeSelect id="st" {...form.register("stateCode")}>{INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}</NativeSelect></Field>
            <Field label="Address line 1" htmlFor="a1" error={e.addressLine1?.message}><Input id="a1" {...form.register("addressLine1")} /></Field>
            <Field label="Address line 2" htmlFor="a2"><Input id="a2" {...form.register("addressLine2")} /></Field>
            <Field label="City" htmlFor="ci" error={e.city?.message}><Input id="ci" {...form.register("city")} /></Field>
            <Field label="PIN code" htmlFor="pin" error={e.pincode?.message}><Input id="pin" {...form.register("pincode")} /></Field>
            <Field label="Phone" htmlFor="ph"><Input id="ph" {...form.register("phone")} /></Field>
            <Field label="Email" htmlFor="em" error={e.email?.message}><Input id="em" {...form.register("email")} /></Field>
            <Field label="Bank details (printed on invoices)" htmlFor="bk" className="sm:col-span-2"><Input id="bk" {...form.register("bankDetails")} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Production control</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Variance tolerance (%)" htmlFor="tol" error={e.varianceTolerancePct?.message} hint="Material consumption or yield deviating by more than this is flagged. Default 3%. Applies to runs completed after the change.">
              <Input id="tol" inputMode="decimal" {...form.register("varianceTolerancePct")} />
            </Field>
            <Button type="submit" disabled={pending} className="w-full">{pending && <Loader2 className="animate-spin" />} Save settings</Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
