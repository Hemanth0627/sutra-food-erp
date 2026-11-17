"use client";
import { useEffect, useRef } from "react";
import { hasWebGL, isLowPower, prefersReducedMotion } from "./capabilities";

/**
 * Hero background using Vanta.js NET (MIT, github.com/tengbao/vanta) on top of three.js.
 * - Loaded lazily, only on capable devices, never when the user prefers reduced motion.
 * - Destroyed while the hero is off-screen so it costs nothing during the rest of the page.
 * - Vanta's NET effect was written for older three.js and references THREE.VertexColors, which modern
 *   three removed (vertexColors is now a boolean). We pass a shim object with VertexColors: true.
 * The static CSS gradient underneath is the fallback.
 */
export function VantaHero({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !hasWebGL() || isLowPower()) return;
    let effect: { destroy(): void } | null = null;
    let cancelled = false;

    const start = async () => {
      if (effect || cancelled) return;
      const [THREE, vanta] = await Promise.all([import("three"), import("vanta/dist/vanta.net.min")]);
      if (cancelled || effect) return;
      const mod = vanta as unknown as { default?: unknown };
      const NET = ((mod.default as { default?: unknown })?.default ?? mod.default ?? vanta) as (o: Record<string, unknown>) => { destroy(): void };
      effect = NET({
        el,
        THREE: { ...THREE, VertexColors: true },
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 1,
        color: 0xd97706,
        backgroundColor: 0x0c0c0d,
        points: 9,
        maxDistance: 19,
        spacing: 22,
        showDots: true,
      });
    };
    const stop = () => {
      effect?.destroy();
      effect = null;
    };
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? void start() : stop()), { threshold: 0.05 });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      stop();
    };
  }, []);

  return (
    <div ref={ref} className={className} style={{ background: "radial-gradient(1200px 600px at 70% 10%, rgba(245,158,11,0.14), transparent 60%), #0c0c0d" }}>
      {/* Readability scrim between the WebGL layer and the copy */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(90deg,#0c0c0d_0%,rgba(12,12,13,0.86)_38%,rgba(12,12,13,0.35)_70%,rgba(12,12,13,0.1)_100%)] max-md:bg-[linear-gradient(180deg,rgba(12,12,13,0.55)_0%,rgba(12,12,13,0.88)_45%,rgba(12,12,13,0.8)_100%)]" />
      {children}
    </div>
  );
}
