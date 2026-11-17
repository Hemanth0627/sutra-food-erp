import { financialYear } from "@/lib/dates";
import type { Tx } from "./db";

export type DocumentPrefix = "SO" | "INV" | "CN" | "DSP" | "RCPT" | "PUR" | "PR" | "PRET" | "EXP" | "ADJ";

/**
 * Financial-year based document numbers, e.g. INV/2026-27/0001.
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING is atomic and row-locks the counter until the
 * surrounding transaction ends, so concurrent postings never get the same number and a rolled-back
 * posting releases its number.
 */
export async function nextDocumentNumber(tx: Tx, prefix: DocumentPrefix, date: Date) {
  const fy = financialYear(date);
  const key = `${prefix}:${fy}`;
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentSequence" ("key", "lastValue") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "lastValue" = "DocumentSequence"."lastValue" + 1
    RETURNING "lastValue"`;
  const seq = Number(rows[0].lastValue);
  return { number: `${prefix}/${fy}/${String(seq).padStart(4, "0")}`, financialYear: fy, sequence: seq };
}
