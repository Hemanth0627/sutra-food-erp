import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Form field wrapper with label, hint and error message (wired for screen readers). */
export function Field({ label, htmlFor, error, hint, className, children }: { label: string; htmlFor?: string; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
