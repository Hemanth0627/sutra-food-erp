import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
export function Alert({ className, tone = "info", children }: { className?: string; tone?: "info" | "warning" | "danger" | "success"; children: React.ReactNode }) {
  const tones = {
    info: "border-info/30 bg-info-soft text-info",
    warning: "border-warning/30 bg-warning-soft text-warning",
    danger: "border-destructive/30 bg-danger-soft text-destructive",
    success: "border-success/30 bg-success-soft text-success",
  } as const;
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", tones[tone], className)}>{children}</div>;
}
