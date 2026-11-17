"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { loginSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { apiFetch } from "@/components/app/use-api";

const DEMO = [
  { role: "Owner", email: "owner@sutra-erp.test" },
  { role: "Admin", email: "admin@sutra-erp.test" },
  { role: "Salesman A", email: "salesman.a@sutra-erp.test" },
  { role: "Salesman B", email: "salesman.b@sutra-erp.test" },
  { role: "Production", email: "production@sutra-erp.test" },
  { role: "Accountant", email: "accounts@sutra-erp.test" },
];

type Values = z.input<typeof loginSchema>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: Values) {
    try {
      await apiFetch("/api/auth/login", { body: values });
      router.push(next);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
    }
  }

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
      <div className="mt-8 rounded-xl border bg-card p-4">
        <div className="text-xs font-medium">Demo accounts <span className="font-normal text-muted-foreground">(password Demo@1234, fictional data)</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                form.setValue("email", d.email);
                form.setValue("password", "Demo@1234");
              }}
              className="rounded-md border px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent"
            >
              <span className="block font-medium">{d.role}</span>
              <span className="block truncate text-muted-foreground">{d.email}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
