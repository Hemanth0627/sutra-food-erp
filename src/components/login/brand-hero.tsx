"use client";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/app/brand";
import { hasWebGL, isLowPower, prefersReducedMotion } from "@/components/landing/capabilities";
import type { BrandScene } from "./brand-scene";

/**
 * Decorative 3D Sutra mark behind the sign-in panel. Three.js is loaded lazily; without WebGL a large
 * static mark is shown instead, and with reduced motion the 3D mark is rendered once and stays still.
 * It tilts toward the pointer and stops rendering when the panel is hidden or off-screen.
 */
export function BrandHero() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"pending" | "3d" | "static">("pending");

  useEffect(() => {
    setMode(hasWebGL() ? "3d" : "static");
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (mode !== "3d" || !wrap || !canvas) return;
    let scene: BrandScene | null = null;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    import("./brand-scene")
      .then(({ createBrandScene }) => {
        if (disposed) return;
        scene = createBrandScene(canvas, { animate: !prefersReducedMotion(), lowPower: isLowPower() });
        const s = scene;
        const size = () => s.resize(wrap.clientWidth, wrap.clientHeight);
        size();
        const ro = new ResizeObserver(size);
        ro.observe(wrap);
        const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? s.start() : s.stop()));
        io.observe(wrap);
        const onVis = () => (document.hidden ? s.stop() : s.start());
        document.addEventListener("visibilitychange", onVis);
        // Pointer anywhere over the panel tilts the mark (the canvas itself ignores pointer events).
        const panel = wrap.parentElement ?? wrap;
        const onMove = (e: PointerEvent) => {
          const r = panel.getBoundingClientRect();
          s.pointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
        };
        const onLeave = () => s.pointer(0, 0);
        panel.addEventListener("pointermove", onMove);
        panel.addEventListener("pointerleave", onLeave);
        cleanups.push(() => {
          ro.disconnect();
          io.disconnect();
          document.removeEventListener("visibilitychange", onVis);
          panel.removeEventListener("pointermove", onMove);
          panel.removeEventListener("pointerleave", onLeave);
        });
      })
      .catch(() => setMode("static"));
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
      scene?.dispose();
    };
  }, [mode]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: "radial-gradient(520px 420px at 66% 36%, rgba(245,158,11,0.16), transparent 70%)" }} />
      {mode === "3d" && <canvas ref={canvasRef} className="absolute inset-0 size-full" />}
      {mode === "static" && <BrandMark className="absolute right-[12%] top-[18%] size-56 opacity-60 drop-shadow-[0_20px_60px_rgba(245,158,11,0.35)]" />}
    </div>
  );
}
