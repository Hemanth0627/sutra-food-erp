import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
          <WifiOff className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">You are offline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pages you have opened before are available from the cache. Salesmen can still capture orders on the New order screen; they sync automatically when the connection returns.
        </p>
        <Link href="/orders/new" className="mt-5 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline">Open New order</Link>
      </div>
    </main>
  );
}
