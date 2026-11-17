import { apiRoute } from "@/server/api";
import { prisma } from "@/server/db";

/** Customers + active products for the salesman app (cached on the device for offline order capture). */
export const GET = apiRoute({ permission: "orders:create" }, async () => {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true, city: true, stateCode: true, salesmanId: true } }),
    prisma.product.findMany({
      where: { item: { isActive: true } },
      include: { item: { select: { name: true } }, category: { select: { name: true } } },
      orderBy: { sku: "asc" },
    }),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    customers,
    products: products.map((p) => ({ id: p.id, name: p.item.name, sku: p.sku, category: p.category.name, packSize: p.packSize, price: p.sellingPrice.toFixed(2), gstRate: p.gstRate.toFixed(2) })),
  };
});
