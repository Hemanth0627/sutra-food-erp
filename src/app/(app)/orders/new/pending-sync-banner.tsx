"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getQueue, QUEUE_EVENT, removeFromQueue, syncQueue, type QueuedOrder } from "./offline-queue";

export function PendingSyncBanner({ userId }: { userId: string }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueuedOrder[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setQueue(getQueue(userId)), [userId]);

  const sync = useCallback(async (silent = false) => {
    if (!navigator.onLine || !getQueue(userId).length) return;
    setBusy(true);
    const r = await syncQueue(userId);
    setBusy(false);
    refresh();
    if (r.synced) {
      toast.success(`${r.synced} offline order(s) synced`);
      router.refresh();
    } else if (!silent && r.failed) toast.error("Some orders could not be synced. Check the message and edit or discard them.");
  }, [userId, refresh, router]);

  useEffect(() => {
    refresh();
    void sync(true);
    const onOnline = () => void sync(true);
    window.addEventListener("online", onOnline);
    window.addEventListener(QUEUE_EVENT, refresh);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener(QUEUE_EVENT, refresh);
    };
  }, [refresh, sync]);

  if (!queue.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-warning">
        <CloudOff className="size-4" /> {queue.length} order(s) waiting to sync
      </div>
      <ul className="mt-2 space-y-1.5">
        {queue.map((q) => (
          <li key={q.clientRef} className="flex items-center justify-between gap-2 text-xs text-foreground">
            <span className="min-w-0 truncate">
              {q.customerName} · {q.payload.items.reduce((a, i) => a + Number(i.quantity), 0)} pkts
              {q.lastError && <span className="block text-destructive">{q.lastError}</span>}
            </span>
            {q.lastError && (
              <button className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeFromQueue(q.clientRef)} aria-label="Discard order">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void sync()}>
        <RefreshCw className={busy ? "animate-spin" : ""} /> Sync now
      </Button>
    </div>
  );
}
