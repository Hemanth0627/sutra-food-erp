import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { Actor } from "./audit";
import { SESSION_COOKIE, userFromToken, type SessionUser } from "./auth/session";
import { AppError, badRequest, forbidden, unauthorized } from "./errors";

/**
 * Wrapper for every API route: authentication, server-side permission check, same-origin check for
 * state-changing requests (CSRF defence on top of SameSite cookies), Zod validation and consistent
 * JSON errors. Permission checks here are authoritative; hidden buttons in the UI are only cosmetic.
 */
export interface ApiContext<B> {
  req: NextRequest;
  user: SessionUser;
  actor: Actor;
  body: B;
  params: Record<string, string>;
}

type RouteCtx = { params: Promise<Record<string, string>> };

export function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, server-to-server) do not send Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Invalid origin");
  }
  if (originHost !== host) throw forbidden("Cross-site request blocked");
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details ?? null } }, { status: e.status });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return NextResponse.json({ error: { code: "CONFLICT", message: "A record with these details already exists" } }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: { code: "NOT_FOUND", message: "Record not found" } }, { status: 404 });
    if (e.code === "P2010" || e.code === "P2034") {
      return NextResponse.json({ error: { code: "CONFLICT", message: "The record changed concurrently; please retry" } }, { status: 409 });
    }
  }
  const message = e instanceof Error ? e.message : "";
  if (/append-only|cannot be edited|cannot be deleted|check constraint/i.test(message)) {
    return NextResponse.json({ error: { code: "INTEGRITY", message: "Blocked by a data-integrity rule" } }, { status: 409 });
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. The change was not saved." } }, { status: 500 });
}

export function apiRoute<S extends z.ZodType | undefined = undefined>(
  opts: { permission?: Permission | Permission[]; schema?: S },
  handler: (ctx: ApiContext<S extends z.ZodType ? z.output<S> : undefined>) => Promise<unknown>,
) {
  return async (req: NextRequest, routeCtx: RouteCtx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
      if (!user) throw unauthorized();
      if (opts.permission) {
        const list = Array.isArray(opts.permission) ? opts.permission : [opts.permission];
        if (!list.some((p) => hasPermission(user.role, p))) throw forbidden();
      }
      let body: unknown = undefined;
      if (opts.schema) {
        let json: unknown;
        try {
          json = await req.json();
        } catch {
          throw badRequest("Request body must be valid JSON");
        }
        const parsed = opts.schema.safeParse(json);
        if (!parsed.success) {
          const flat = z.flattenError(parsed.error);
          const first = parsed.error.issues[0];
          throw new AppError(400, "VALIDATION_ERROR", first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input", flat);
        }
        body = parsed.data;
      }
      const params = routeCtx?.params ? await routeCtx.params : {};
      const actor: Actor = { id: user.id, name: user.name, role: user.role, ipAddress: clientIp(req) };
      const result = await handler({ req, user, actor, body: body as never, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
