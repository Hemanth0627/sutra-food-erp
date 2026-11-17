"use client";
import { useEffect, useRef, useState } from "react";
import { Boxes, ClipboardList, Factory, FileBarChart, Package, Wheat } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasWebGL, prefersReducedMotion } from "./capabilities";

const STEPS = [
  { icon: Wheat, kicker: "01 · Purchase", title: "Raw ingredients enter the ledger", body: "Flour, oil, spice mix, pouches and cartons are received against supplier invoices. Each receipt is a purchase-receipt ledger entry and revalues stock at weighted-average cost (₹42 → ₹43.125/kg for flour after the ₹45 purchase)." },
  { icon: Factory, kicker: "02 · Production", title: "The BOM drives every batch", body: "A run explodes the active BOM version into exact requirements, records what was actually issued and flags anything outside ±3%, like the +5% oil overuse in the benchmark run." },
  { icon: Package, kicker: "03 · Output", title: "Finished packets emerge, fully costed", body: "Good output, damaged pouches and cartons are posted in one atomic transaction. The run's costing snapshot is frozen: ₹5,855 ÷ 188 good packets = ₹31.14 a packet." },
  { icon: Boxes, kicker: "04 · Inventory", title: "One ledger, every balance", body: "Raw, packaging and finished-goods balances can only change through append-only ledger movements, and the system checks them against the ledger continuously." },
  { icon: ClipboardList, kicker: "05 · Sales", title: "Orders from the field, checked against stock", body: "Salesmen capture orders on their phones, even offline. Admins see real availability: Distributor B's 120 packets against 88 in stock is flagged as a 32-packet shortage." },
  { icon: FileBarChart, kicker: "06 · Finance", title: "GST invoices, receivables and audit reports", body: "CGST/SGST or IGST is computed exactly, dispatch reduces stock once, receipts settle invoices, and 18 reports (including a monthly audit pack) export to CSV, Excel and PDF from posted records." },
];

export function ScrollStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"pending" | "3d" | "static">("pending");

  useEffect(() => {
    setMode(!prefersReducedMotion() && hasWebGL() ? "3d" : "static");
  }, []);

  // Active step follows the panel in the middle of the viewport (works with or without WebGL).
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.step))),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (mode !== "3d" || !canvasRef.current || !stageRef.current || !sectionRef.current) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      const [{ createStoryScene }, { gsap }, { ScrollTrigger }] = await Promise.all([import("./story-scene"), import("gsap"), import("gsap/ScrollTrigger")]);
      if (disposed || !canvasRef.current || !stageRef.current || !sectionRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const story = createStoryScene(canvasRef.current, { idleMotion: true });
      const size = () => story.resize(stageRef.current!.clientWidth, stageRef.current!.clientHeight);
      size();
      const ro = new ResizeObserver(size);
      ro.observe(stageRef.current);
      const trigger = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => story.setProgress(self.progress),
      });
      story.setProgress(trigger.progress);
      const vis = new IntersectionObserver(([e]) => (e.isIntersecting ? story.start() : story.stop()));
      vis.observe(stageRef.current);
      const onVisibility = () => (document.hidden ? story.stop() : story.start());
      document.addEventListener("visibilitychange", onVisibility);
      cleanups.push(() => {
        document.removeEventListener("visibilitychange", onVisibility);
        vis.disconnect();
        trigger.kill();
        ro.disconnect();
        story.dispose();
      });
    })().catch(() => setMode("static"));
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
    };
  }, [mode]);

  return (
    <section ref={sectionRef} id="workflow" className="relative" aria-label="How Sutra connects purchase, production, inventory, sales and finance">
      <div ref={stageRef} className="sticky top-0 h-[100svh] w-full overflow-hidden">
        {mode === "3d" ? (
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
        ) : (
          <StaticFlow active={active} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0c0c0d]/10 via-transparent to-[#0c0c0d]/70 lg:to-[#0c0c0d]/90" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0c0c0d] to-transparent" />
        <ol className="absolute left-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 md:flex" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s.kicker} className={cn("h-8 w-1 rounded-full transition-colors", i === active ? "bg-amber-400" : "bg-white/15")} />
          ))}
        </ol>
      </div>
      <div className="relative -mt-[100svh]">
        {STEPS.map((s, i) => (
          <div key={s.kicker} ref={(el) => { stepRefs.current[i] = el; }} data-step={i} className="flex min-h-[100svh] items-end px-4 pb-16 md:items-center md:pb-0 lg:justify-end lg:pr-[6vw]">
            <article className={cn("w-full max-w-md rounded-2xl border border-white/10 bg-[#111113]/85 p-6 shadow-2xl backdrop-blur-md transition-opacity duration-500 md:p-7", i === active ? "opacity-100" : "opacity-40")}>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-amber-400">
                <s.icon className="size-4" /> {s.kicker}
              </div>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-white md:text-2xl">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Fallback for reduced motion / no WebGL: a static flow diagram that highlights the current step. */
function StaticFlow({ active }: { active: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 lg:pr-[48%]">
      <ol className="grid w-full max-w-lg grid-cols-2 gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.kicker} className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors", i === active ? "border-amber-400/60 bg-amber-400/10 text-white" : "border-white/10 text-zinc-500")}>
            <s.icon className="size-7" />
            <span className="text-xs font-medium">{s.kicker.split(" · ")[1]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
