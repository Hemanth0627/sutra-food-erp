"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => ({}))) as ApiErrorBody & T;
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? "ERROR", json.error?.message ?? `Request failed (${res.status})`, json.error?.details);
  return json;
}

/** Mutation helper: calls an API route, shows a toast and refreshes server components on success. */
export function useApi() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const call = useCallback(
    async <T,>(url: string, body?: unknown, opts: { method?: string; success?: string | ((r: T) => string); refresh?: boolean } = {}) => {
      setPending(true);
      try {
        const result = await apiFetch<T>(url, { method: opts.method ?? "POST", body });
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(result) : opts.success);
        if (opts.refresh !== false) router.refresh();
        return result;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          toast.error("Your session has expired. Please sign in again.");
          router.push("/login");
        } else {
          toast.error(e instanceof Error ? e.message : "Request failed");
        }
        throw e;
      } finally {
        setPending(false);
      }
    },
    [router],
  );
  return { call, pending };
}
