import { hasPermission } from "@/lib/permissions";
import { apiRoute } from "@/server/api";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

interface Hit {
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Global search across documents and masters, limited to what the caller's role may see. */
export const GET = apiRoute({}, async ({ req, user }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return { hits: [] };
  const like = { contains: q, mode: "insensitive" as const };
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user.role, p);
  const isSalesman = user.role === "SALESMAN";
  const hits: Hit[] = [];
  const [customers, products, orders, invoices, pos, runs, suppliers] = await Promise.all([
    can("customers:view") ? prisma.customer.findMany({ where: { OR: [{ name: like }, { code: like }, { gstin: like }, { city: like }], ...(isSalesman ? { salesmanId: user.id } : {}) }, take: 5 }) : [],
    can("products:view") ? prisma.product.findMany({ where: { OR: [{ sku: like }, { item: { name: like } }, { hsnCode: like }] }, include: { item: true }, take: 5 }) : [],
    can("orders:view-all") || can("orders:view-own")
      ? prisma.salesOrder.findMany({ where: { OR: [{ orderNo: like }, { customer: { name: like } }], ...(can("orders:view-all") ? {} : { salesmanId: user.id }) }, include: { customer: true }, orderBy: { orderDate: "desc" }, take: 5 })
      : [],
    can("invoices:view") ? prisma.invoice.findMany({ where: { OR: [{ invoiceNo: like }, { customerName: like }] }, orderBy: { invoiceDate: "desc" }, take: 5 }) : [],
    can("purchases:view") ? prisma.purchaseOrder.findMany({ where: { OR: [{ poNo: like }, { supplier: { name: like } }] }, include: { supplier: true }, take: 4 }) : [],
    can("production:view") ? prisma.productionRun.findMany({ where: { OR: [{ runNo: like }, { batchNo: like }, { product: { item: { name: like } } }] }, include: { product: { include: { item: true } } }, orderBy: { plannedDate: "desc" }, take: 4 }) : [],
    can("suppliers:view") ? prisma.supplier.findMany({ where: { OR: [{ name: like }, { code: like }] }, take: 3 }) : [],
  ]);
  for (const c of customers) hits.push({ type: "Customer", title: c.name, subtitle: `${c.code} · ${c.city}, ${c.state}`, href: can("customers:manage") || can("payments:view") || can("invoices:view") ? `/customers/${c.id}` : "/customers" });
  for (const p of products) hits.push({ type: "Product", title: p.item.name, subtitle: `${p.sku} · HSN ${p.hsnCode}`, href: "/products" });
  for (const o of orders) hits.push({ type: "Order", title: o.orderNo, subtitle: `${o.customer.name} · ${o.status.toLowerCase().replace(/_/g, " ")}`, href: `/orders/${o.id}` });
  for (const i of invoices) hits.push({ type: "Invoice", title: i.invoiceNo, subtitle: `${i.customerName} · ₹${i.grandTotal.toString()}`, href: `/invoices/${i.id}` });
  for (const p of pos) hits.push({ type: "Purchase order", title: p.poNo, subtitle: `${p.supplier.name} · ${p.status.toLowerCase().replace(/_/g, " ")}`, href: `/purchase-orders/${p.id}` });
  for (const r of runs) hits.push({ type: "Production run", title: r.runNo, subtitle: `${r.product.item.name} · ${r.status.toLowerCase().replace(/_/g, " ")}`, href: `/production/${r.id}` });
  for (const s of suppliers) hits.push({ type: "Supplier", title: s.name, subtitle: `${s.code} · ${s.city}`, href: "/suppliers" });
  return { hits };
});
