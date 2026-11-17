"use client";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./capabilities";

/** Staggered fade-up of the hero copy with GSAP (skipped for reduced motion). */
export function HeroIntro({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;
    let ctx: { revert(): void } | undefined;
    void import("gsap").then(({ gsap }) => {
      if (!ref.current) return;
      ctx = gsap.context(() => {
        gsap.from("[data-intro]", { y: 18, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 });
      }, ref);
    });
    return () => ctx?.revert();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
