import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { OrderEntry } from "./order-entry";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  const user = await requirePageUser("orders:create");
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true, city: true, stateCode: true, salesmanId: true } }),
    prisma.product.findMany({ where: { item: { isActive: true } }, include: { item: true, category: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <OrderEntry
      userId={user.id}
      initialCatalog={{
        fetchedAt: new Date().toISOString(),
        customers,
        products: products.map((p) => ({ id: p.id, name: p.item.name, sku: p.sku, category: p.category.name, packSize: p.packSize, price: p.sellingPrice.toFixed(2), gstRate: p.gstRate.toFixed(2) })),
      }}
    />
  );
}
