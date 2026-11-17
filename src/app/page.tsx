import Link from "next/link";
import {
  ArrowRight, BadgeCheck, Boxes, Calculator, ClipboardCheck, Factory, FileSpreadsheet, Gauge, Layers, Lock, ReceiptIndianRupee,
  ScrollText, ShieldCheck, Smartphone, Truck, WifiOff,
} from "lucide-react";
import { BrandMark, BrandName } from "@/components/app/brand";
import { HeroIntro } from "@/components/landing/hero-intro";
import { ScrollStory } from "@/components/landing/scroll-story";
import { VantaHero } from "@/components/landing/vanta-hero";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

const PRODUCTS = [
  { name: "Murukku", note: "Rice & urad spirals, 200 g", tone: "from-amber-500/30" },
  { name: "Mixture", note: "Besan sev, peanuts, 200 g", tone: "from-red-500/25" },
  { name: "Banana chips", note: "Nendran, coconut oil, 200 g", tone: "from-green-500/25" },
  { name: "Potato chips", note: "Salted & spiced, 200 g", tone: "from-yellow-400/25" },
  { name: "Traditional sweets", note: "Ghee & besan, 200 g", tone: "from-pink-500/25" },
];

const PILLARS = [
  {
    id: "production",
    kicker: "Production",
    title: "BOM-driven production with variance you can act on",
    points: [
      { icon: Layers, title: "Versioned BOMs", body: "Draft, activate, archive. Runs keep the exact version they used, so history never shifts." },
      { icon: Factory, title: "Issue → output → complete", body: "Record issues, good output, damaged pouches and scrap. Completion is a single atomic transaction." },
      { icon: Gauge, title: "±3% tolerance alerts", body: "Material and yield deviations are flagged automatically; the threshold is configurable." },
      { icon: Calculator, title: "Frozen costing snapshots", body: "Weighted-average material cost plus labour and energy per run. New purchase prices never rewrite old costs." },
    ],
  },
  {
    id: "inventory",
    kicker: "Inventory",
    title: "A single append-only stock ledger",
    points: [
      { icon: ScrollText, title: "Ten movement types", body: "Opening, purchase, issue, output, dispatch, returns, adjustment, packaging and damage. Each records before/after balances." },
      { icon: Lock, title: "No overwrites, ever", body: "A database trigger blocks edits to ledger rows; balances are a reconciled cache of the ledger." },
      { icon: Boxes, title: "Raw, packaging, finished goods", body: "Reorder alerts, batch numbers, expiry tracking and exact-once dispatch." },
      { icon: ShieldCheck, title: "No negative stock", body: "Checked under row locks in the app and enforced by a database constraint." },
    ],
  },
  {
    id: "finance",
    kicker: "Finance",
    title: "GST invoicing, receivables and audit-ready reports",
    points: [
      { icon: ReceiptIndianRupee, title: "CGST/SGST or IGST", body: "Exact decimal arithmetic, FY-based numbering and PDF tax invoices. Cancellations go through credit notes." },
      { icon: Truck, title: "Dispatch & receivables", body: "Dispatch once per invoice, allocate receipts without over-allocation, and age balances by due date." },
      { icon: FileSpreadsheet, title: "18 reports, 3 formats", body: "Sales and purchase registers, GST, stock, production, costing and ageing reports, plus a monthly audit pack, in CSV, Excel or PDF." },
      { icon: BadgeCheck, title: "Benchmark verified", body: "The assignment scenario is replayed through the real services and 25 checks are asserted automatically." },
    ],
  },
];

const STACK = ["Next.js 15 App Router", "React 19", "TypeScript", "PostgreSQL 17", "Prisma ORM", "Tailwind CSS 4", "shadcn/ui patterns", "Recharts", "React Hook Form + Zod", "Three.js", "Vanta.js", "GSAP ScrollTrigger", "PDFKit", "ExcelJS", "Vitest", "PWA offline queue"];

export default async function LandingPage() {
  const user = await getCurrentUser();
  const cta = user ? { href: "/dashboard", label: "Open your dashboard" } : { href: "/login", label: "Sign in" };
  return (
    <div className="dark bg-[#0c0c0d] text-zinc-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-black">Skip to content</a>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-[#0c0c0d]/70 backdrop-blur-md">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4" aria-label="Primary">
          <Link href="/" className="flex items-center gap-2.5"><BrandMark className="size-6" /><BrandName className="text-[15px] text-white" /></Link>
          <div className="ml-auto hidden items-center gap-6 text-sm text-zinc-400 md:flex">
            <a href="#workflow" className="hover:text-white">Workflow</a>
            <a href="#production" className="hover:text-white">Production</a>
            <a href="#inventory" className="hover:text-white">Inventory</a>
            <a href="#finance" className="hover:text-white">Finance</a>
            <a href="#technology" className="hover:text-white">Technology</a>
          </div>
          <Link href={cta.href} className="ml-auto inline-flex h-8 items-center rounded-md bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-zinc-200 md:ml-0">{cta.label}</Link>
        </nav>
      </header>

      <main id="main">
        <VantaHero className="relative flex min-h-[100svh] items-center overflow-hidden">
          <HeroIntro className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-28">
            <p data-intro className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
              Food manufacturing ERP · South Indian snacks
            </p>
            <h1 data-intro className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
              From flour sack to GST invoice, one ledger.
            </h1>
            <p data-intro className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              Sutra connects sales orders, purchases, BOM-driven production, inventory, costing, GST invoicing and receivables. Every transaction is entered once, at its source, and flows everywhere else automatically.
            </p>
            <div data-intro className="mt-8 flex flex-wrap gap-3">
              <Link href={cta.href} className="inline-flex h-11 items-center gap-2 rounded-md bg-amber-500 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-400">{cta.label} <ArrowRight className="size-4" /></Link>
              <a href="#workflow" className="inline-flex h-11 items-center rounded-md border border-white/15 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5">See how it flows</a>
            </div>
            <dl data-intro className="mt-14 grid max-w-2xl grid-cols-2 gap-6 border-t border-white/10 pt-6 sm:grid-cols-4">
              {[["5", "roles with server-side permissions"], ["10", "stock movement types, one ledger"], ["18", "reports in CSV, Excel and PDF"], ["25/25", "benchmark checks automated"]].map(([v, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd><span className="block text-2xl font-semibold text-white">{v}</span><span className="text-xs text-zinc-500">{l}</span></dd></div>
              ))}
            </dl>
          </HeroIntro>
        </VantaHero>

        <section className="mx-auto max-w-6xl px-4 py-24" aria-labelledby="products-title">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">Product overview</p>
          <h2 id="products-title" className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white">Built around a real snack line-up</h2>
          <p className="mt-3 max-w-2xl text-zinc-400">Five 200 g products, each with an HSN code, 5% GST, a selling price, a reorder level and a versioned recipe. The demo company and its data are fictional.</p>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PRODUCTS.map((p) => (
              <li key={p.name} className={`rounded-2xl border border-white/10 bg-gradient-to-b ${p.tone} to-transparent p-5`}>
                <div className="text-base font-medium text-white">{p.name}</div>
                <div className="mt-1 text-xs text-zinc-400">{p.note}</div>
              </li>
            ))}
          </ul>
        </section>

        <ScrollStory />

        {PILLARS.map((pillar) => (
          <section key={pillar.id} id={pillar.id} className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24" aria-labelledby={`${pillar.id}-title`}>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">{pillar.kicker}</p>
            <h2 id={`${pillar.id}-title`} className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white">{pillar.title}</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
              {pillar.points.map((pt) => (
                <div key={pt.title} className="bg-[#0f0f11] p-6">
                  <pt.icon className="size-5 text-amber-400" />
                  <h3 className="mt-4 text-base font-medium text-white">{pt.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{pt.body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="mx-auto max-w-6xl px-4 py-24" aria-labelledby="roles-title">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">Roles</p>
          <h2 id="roles-title" className="mt-3 text-3xl font-semibold tracking-tight text-white">One system, five workspaces</h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: Gauge, t: "Owner", d: "Live performance, profitability, alerts and receivables." },
              { icon: ClipboardCheck, t: "Admin", d: "Approve orders, invoice, dispatch, collect, purchase." },
              { icon: Smartphone, t: "Salesman", d: "Mobile order entry in under a minute, works offline." },
              { icon: Factory, t: "Production", d: "BOMs, runs, issues, output, wastage and variance." },
              { icon: FileSpreadsheet, t: "Accountant", d: "Read-only registers, GST, ageing and audit exports." },
            ].map((r) => (
              <div key={r.t} className="rounded-2xl border border-white/10 p-5">
                <r.icon className="size-5 text-amber-400" />
                <div className="mt-3 font-medium text-white">{r.t}</div>
                <p className="mt-1 text-sm text-zinc-400">{r.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><WifiOff className="size-3.5" /> Offline orders are queued on the device with a unique reference and synced exactly once.</p>
        </section>

        <section id="technology" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24" aria-labelledby="tech-title">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">Technology</p>
          <h2 id="tech-title" className="mt-3 text-3xl font-semibold tracking-tight text-white">Boring where it matters, modern where it helps</h2>
          <p className="mt-3 max-w-2xl text-zinc-400">PostgreSQL transactions with row locks, unique keys and triggers guard the books. The 3D layer is decorative, lazy-loaded and switched off for reduced motion or missing WebGL.</p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {STACK.map((s) => <li key={s} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-zinc-300">{s}</li>)}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent p-8 md:flex-row md:items-center md:p-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Walk through the benchmark yourself</h2>
              <p className="mt-2 max-w-xl text-zinc-400">Sign in with any demo role (password Demo@1234) and follow the purchase → production → invoice → payment scenario.</p>
            </div>
            <Link href={cta.href} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-black hover:bg-zinc-200">{cta.label} <ArrowRight className="size-4" /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2"><BrandMark className="size-5" /> Sutra ERP: internship prototype. All companies, people and GSTINs are fictional.</div>
          <div>
            Hero background: <a className="underline underline-offset-2 hover:text-zinc-300" href="https://github.com/tengbao/vanta" target="_blank" rel="noopener noreferrer">Vanta.js</a> (MIT). Scroll-driven camera technique inspired by{" "}
            <a className="underline underline-offset-2 hover:text-zinc-300" href="https://github.com/fireship-io/threejs-scroll-animation-demo" target="_blank" rel="noopener noreferrer">Fireship&apos;s three.js scroll demo</a>.
          </div>
        </div>
      </footer>
    </div>
  );
}
