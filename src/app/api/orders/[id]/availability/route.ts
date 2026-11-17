import { apiRoute } from "@/server/api";
import { prisma } from "@/server/db";
import { orderAvailability } from "@/server/services/availability";

export const GET = apiRoute({ permission: "orders:approve" }, async ({ params }) => ({ lines: await orderAvailability(prisma, params.id) }));
