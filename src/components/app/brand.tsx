import { cn } from "@/lib/utils";

/** Sutra mark: three threads (sales, production, accounts) tied into one knot. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path d="M8 11c5 0 5 10 10 10h6" className="stroke-background" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M8 21c5 0 5-10 10-10h6" stroke="#f59e0b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="16" r="2.2" fill="#f59e0b" />
    </svg>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      Sutra<span className="text-brand"> ERP</span>
    </span>
  );
}
