"use client";
/**
 * Offline order capture. Orders are queued in localStorage with a client-generated UUID (clientRef).
 * The server treats clientRef as an idempotency key, so a queued order can be retried any number of
 * times without creating duplicates. Each entry records the user who captured it and only that user's
 * session will sync it.
 */
export interface QueuedOrder {
  clientRef: string;
  userId: string;
  customerName: string;
  createdAt: string;
  payload: { clientRef: string; customerId: string; notes?: string; capturedOffline: boolean; orderDate: string; items: { productId: string; quantity: string }[] };
  lastError?: string;
}

const QUEUE_KEY = "sutra.orderQueue.v1";
const CATALOG_KEY = "sutra.catalog.v1";
export const QUEUE_EVENT = "sutra-queue-changed";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

export function getQueue(userId: string): QueuedOrder[] {
  return read<QueuedOrder[]>(QUEUE_KEY, []).filter((q) => q.userId === userId);
}

export function enqueue(order: QueuedOrder) {
  const all = read<QueuedOrder[]>(QUEUE_KEY, []);
  if (!all.some((q) => q.clientRef === order.clientRef)) all.push(order);
  write(QUEUE_KEY, all);
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

function update(fn: (all: QueuedOrder[]) => QueuedOrder[]) {
  write(QUEUE_KEY, fn(read<QueuedOrder[]>(QUEUE_KEY, [])));
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function removeFromQueue(clientRef: string) {
  update((all) => all.filter((q) => q.clientRef !== clientRef));
}

export interface Catalog {
  fetchedAt: string;
  customers: { id: string; name: string; type: string; city: string; stateCode: string; salesmanId: string | null }[];
  products: { id: string; name: string; sku: string; category: string; packSize: string; price: string; gstRate: string }[];
}

export function saveCatalog(c: Catalog) {
  write(CATALOG_KEY, c);
}
export function loadCatalog(): Catalog | null {
  return read<Catalog | null>(CATALOG_KEY, null);
}

export function newClientRef(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Sends every queued order for this user. Stops at the first network failure; keeps validation failures with their message. */
export async function syncQueue(userId: string): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  for (const q of getQueue(userId)) {
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q.payload) });
      if (res.ok) {
        removeFromQueue(q.clientRef);
        synced++;
      } else if (res.status === 401) {
        break;
      } else {
        const body = await res.json().catch(() => ({}));
        update((all) => all.map((x) => (x.clientRef === q.clientRef ? { ...x, lastError: body?.error?.message ?? `HTTP ${res.status}` } : x)));
        failed++;
      }
    } catch {
      break; // still offline
    }
  }
  return { synced, failed };
}
