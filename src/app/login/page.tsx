import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandMark, BrandName } from "@/components/app/brand";
import { BrandHero } from "@/components/login/brand-hero";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (user) redirect(safeNext);
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0c0c0d] p-10 text-zinc-100 lg:flex lg:flex-col">
        <BrandHero />
        <Link href="/" className="relative z-10 flex items-center gap-2.5">
          <BrandMark className="size-7" />
          <BrandName className="text-lg text-white" />
        </Link>
        <div className="relative z-10 mt-auto max-w-md">
          <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-amber-400">One entry. Every ledger.</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">From flour sack to GST invoice, every transaction flows through one inventory ledger.</h2>
          <ul className="mt-6 space-y-2 text-sm text-zinc-400">
            <li>• BOM-driven production with variance alerts at ±3%</li>
            <li>• Weighted-average costing with frozen run snapshots</li>
            <li>• CGST/SGST/IGST invoices, dispatch and receivables</li>
          </ul>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <BrandName className="text-lg" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use your work account. Demo accounts for each role are listed below.</p>
          <LoginForm next={safeNext} />
        </div>
      </section>
    </main>
  );
}
