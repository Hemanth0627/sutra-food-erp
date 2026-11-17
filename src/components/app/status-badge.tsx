import { Badge, type BadgeProps } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";

const MAP: Record<string, BadgeProps["variant"]> = {
  PENDING: "warning",
  APPROVED: "info",
  PARTIALLY_FULFILLED: "brand",
  FULFILLED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
  ISSUED: "info",
  DISPATCHED: "success",
  PLANNED: "neutral",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  DRAFT: "warning",
  ACTIVE: "success",
  ARCHIVED: "neutral",
  PAID: "success",
  PARTIAL: "warning",
  UNPAID: "danger",
  OVERDUE: "danger",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant={MAP[status] ?? "neutral"}>{label ?? titleCase(status)}</Badge>;
}
