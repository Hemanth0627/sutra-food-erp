import type { Tx } from "../db";
import { prisma } from "../db";
import { notFound } from "../errors";

/** Sequential master codes (CUS-0001, SUP-0001…), not financial-year based. */
export async function nextMasterCode(tx: Tx, prefix: string): Promise<string> {
  const key = `CODE:${prefix}`;
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentSequence" ("key", "lastValue") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "lastValue" = "DocumentSequence"."lastValue" + 1
    RETURNING "lastValue"`;
  return `${prefix}-${String(Number(rows[0].lastValue)).padStart(4, "0")}`;
}

export async function getCompanySettings(tx: Tx | typeof prisma = prisma) {
  const settings = await tx.companySettings.findUnique({ where: { id: 1 } });
  if (!settings) throw notFound("Company settings (run the seed)");
  return settings;
}

export function sellerAddress(s: { addressLine1: string; addressLine2: string | null; city: string; state: string; pincode: string }) {
  return [s.addressLine1, s.addressLine2, `${s.city}, ${s.state} ${s.pincode}`].filter(Boolean).join(", ");
}

export function parseDateInput(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  // Business dates entered as yyyy-MM-dd are stored at 12:00 IST to avoid any day shift.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return fallback;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 6, 30));
}
