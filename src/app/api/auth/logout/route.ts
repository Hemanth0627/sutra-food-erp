import { NextResponse, type NextRequest } from "next/server";
import { destroySession, SESSION_COOKIE, userFromToken } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = await userFromToken(token);
  await destroySession(token);
  if (user) await prisma.auditLog.create({ data: { userId: user.id, action: "auth.logout", entityType: "User", entityId: user.id, summary: `${user.name} signed out` } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
