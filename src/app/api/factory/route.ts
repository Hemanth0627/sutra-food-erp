import { apiRoute } from "@/server/api";
import { getFactorySnapshot } from "@/server/queries/factory";

export const dynamic = "force-dynamic";

/** Live state of every factory department for the 3D digital twin (polled by the client). */
export const GET = apiRoute({ permission: "factory:view" }, async () => {
  const snapshot = await getFactorySnapshot();
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
});
