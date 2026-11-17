import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : process.env.NODE_ENV === "test" ? [] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/**
 * Runs a unit of work atomically. Every posting that touches more than one record (stock ledger +
 * balance + document + audit log) goes through here, so any failure rolls everything back.
 */
export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  // Generous timeout: a posting is ~10–80 queries and cloud databases add network latency per query.
  return prisma.$transaction(fn, { maxWait: 15_000, timeout: 60_000 });
}
