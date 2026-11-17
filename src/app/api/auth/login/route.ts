import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import { clientIp, errorResponse } from "@/server/api";
import { verifyPassword } from "@/server/auth/password";
import { cookieSecure, createSession, SESSION_COOKIE } from "@/server/auth/session";
import { AppError, badRequest } from "@/server/errors";

// Simple in-memory brute-force throttle (per IP + email). Use a shared store (Redis) when scaling out.
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function POST(req: NextRequest) {
  try {
    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw badRequest("Enter your email and password");
    const { email, password } = parsed.data;
    const ip = clientIp(req) ?? "local";
    const key = `${ip}:${email}`;
    const now = Date.now();
    const a = attempts.get(key);
    if (a && now - a.first < WINDOW_MS && a.count >= MAX_ATTEMPTS) {
      throw new AppError(429, "RATE_LIMITED", "Too many failed attempts. Try again in 15 minutes.");
    }
    const user = await prisma.user.findUnique({ where: { email } });
    // Always run a hash comparison so response time does not reveal whether the email exists.
    const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    if (!user || !ok || !user.isActive) {
      const entry = a && now - a.first < WINDOW_MS ? a : { count: 0, first: now };
      entry.count += 1;
      attempts.set(key, entry);
      await prisma.auditLog.create({ data: { userId: user?.id ?? null, action: "auth.login.failed", entityType: "User", entityId: email, summary: `Failed sign-in for ${email}`, ipAddress: ip } });
      throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
    }
    attempts.delete(key);
    const { token, expiresAt } = await createSession(user.id, { userAgent: req.headers.get("user-agent"), ipAddress: ip });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, summary: `${user.name} signed in`, ipAddress: ip } });
    const res = NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", expires: expiresAt });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
