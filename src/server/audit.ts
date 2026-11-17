import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

export interface Actor {
  id: string;
  name: string;
  role: string;
  ipAddress?: string | null;
}

/** Writes an audit-trail row inside the caller's transaction (so it commits or rolls back with the change). */
export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  data?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: { userId: actor.id, action, entityType, entityId, summary, data, ipAddress: actor.ipAddress ?? null },
  });
}
