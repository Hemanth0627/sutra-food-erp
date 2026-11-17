import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-destructive">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your role does not include this permission. The server enforces this for every page and API call.</p>
        <Button asChild className="mt-5">
          <Link href="/dashboard">Back to your dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
