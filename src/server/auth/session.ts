import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hasPermission, type Permission, type Role } from "@/lib/permissions";
import { prisma } from "../db";

/**
 * Database-backed sessions. The browser holds a random 256-bit token in an httpOnly cookie; the DB
 * stores only HMAC-SHA256(token, SESSION_SECRET), so a leaked sessions table cannot be replayed.
 * Sessions can be revoked server-side (logout deletes the row; deactivated users are rejected).
 */
export const SESSION_COOKIE = "sutra_session";
const SESSION_HOURS = 12;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters (see .env.example)");
  return s;
}

export function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ipAddress?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300) ?? null, ipAddress: meta.ipAddress ?? null },
  });
  // Opportunistic cleanup of expired sessions.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { token, expiresAt };
}

export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role as Role };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Current user for server components (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return userFromToken(store.get(SESSION_COOKIE)?.value);
});

/** Server-page guard: redirects to /login when signed out and to /forbidden without permission. */
export async function requirePageUser(permission?: Permission | Permission[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => hasPermission(user.role, p))) redirect("/forbidden");
  }
  return user;
}
