import { addIstMonths, isoDateIst, parseIsoDateIst, startOfIstMonth } from "@/lib/dates";

export interface ReportFilters {
  from: Date; // inclusive (start of IST day)
  to: Date; // exclusive (start of the IST day after the "to" date)
  fromStr: string;
  toStr: string;
  customerId?: string;
  productId?: string;
  type?: string;
}

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD&customerId=&productId=&type= (defaults to the current month, IST). */
export function parseReportFilters(params: Record<string, string | string[] | undefined>): ReportFilters {
  const get = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const monthStart = startOfIstMonth(new Date());
  const defaultTo = new Date(addIstMonths(monthStart, 1).getTime() - 86400000);
  const from = parseIsoDateIst(get("from") ?? "") ?? monthStart;
  const toDay = parseIsoDateIst(get("to") ?? "") ?? defaultTo;
  const to = new Date(toDay.getTime() + 86400000);
  return {
    from,
    to: to > from ? to : new Date(from.getTime() + 86400000),
    fromStr: isoDateIst(from),
    toStr: isoDateIst(toDay),
    customerId: get("customerId"),
    productId: get("productId"),
    type: get("type"),
  };
}

export function filtersToQuery(f: Partial<ReportFilters>): string {
  const q = new URLSearchParams();
  if (f.fromStr) q.set("from", f.fromStr);
  if (f.toStr) q.set("to", f.toStr);
  if (f.customerId) q.set("customerId", f.customerId);
  if (f.productId) q.set("productId", f.productId);
  if (f.type) q.set("type", f.type);
  return q.toString();
}
