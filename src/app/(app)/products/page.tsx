import { D, formatINR, formatQty } from "@/lib/decimal";
import { hasPermission } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { MaterialFormDialog, ProductFormDialog } from "@/components/forms/master-forms";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const user = await requirePageUser("products:view");
  const canManage = hasPermission(user.role, "products:manage");
  const canManageMaterials = canManage || hasPermission(user.role, "bom:manage");
  const isSalesman = user.role === "SALESMAN";
  const [products, categories, materials, units] = await Promise.all([
    prisma.product.findMany({ where: isSalesman ? { item: { isActive: true } } : {}, include: { item: { include: { balance: true } }, category: true }, orderBy: { sku: "asc" } }),
    prisma.productCategory.findMany({ orderBy: { name: "asc" } }),
    isSalesman ? Promise.resolve([]) : prisma.item.findMany({ where: { kind: { not: "FINISHED_GOOD" } }, include: { unit: true, balance: true }, orderBy: [{ kind: "asc" }, { code: "asc" }] }),
    prisma.unit.findMany({ orderBy: { code: "asc" } }),
  ]);

  if (isSalesman) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Product catalogue" description="Prices are before GST (5% unless shown otherwise)." />
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="font-medium">{p.item.name}</div>
                <div className="text-xs text-muted-foreground">{p.category.name} · {p.packSize} · HSN {p.hsnCode} · GST {D(p.gstRate).toFixed(0)}%</div>
              </div>
              <div className="tabular text-right text-lg font-semibold">{formatINR(p.sellingPrice)}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Products & materials" description="Finished-goods masters (sales) and the raw and packaging materials used in BOMs." actions={canManage && <ProductFormDialog categories={categories} />} />
      <Card>
        <CardHeader><CardTitle>Finished products</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR><TH>Product</TH><TH>Category</TH><TH>HSN</TH><TH className="text-right">GST</TH><TH className="text-right">Price</TH><TH className="text-right">Stock</TH><TH className="text-right">Reorder</TH><TH>Status</TH>{canManage && <TH />}</TR>
            </THead>
            <TBody>
              {products.map((p) => (
                <TR key={p.id}>
                  <TD><div className="font-medium">{p.item.name}</div><div className="text-[11px] text-muted-foreground">{p.sku} · {p.packSize} · shelf life {p.item.shelfLifeDays ?? "—"} days</div></TD>
                  <TD>{p.category.name}</TD>
                  <TD className="font-mono text-xs">{p.hsnCode}</TD>
                  <TD className="tabular text-right">{D(p.gstRate).toFixed(2)}%</TD>
                  <TD className="tabular text-right font-medium">{formatINR(p.sellingPrice)}</TD>
                  <TD className="tabular text-right">{formatQty(p.item.balance?.quantity ?? 0)} PKT</TD>
                  <TD className="tabular text-right">{formatQty(p.item.reorderLevel)}</TD>
                  <TD>{p.item.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                  {canManage && (
                    <TD className="text-right">
                      <ProductFormDialog
                        categories={categories}
                        product={{ id: p.id, name: p.item.name, sku: p.sku, categoryId: p.categoryId, packSize: p.packSize, hsnCode: p.hsnCode, gstRate: D(p.gstRate).toFixed(2), sellingPrice: p.sellingPrice.toFixed(2), reorderLevel: D(p.item.reorderLevel).toFixed(), shelfLifeDays: p.item.shelfLifeDays ?? undefined, isActive: p.item.isActive }}
                      />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Raw & packaging materials</CardTitle>
          {canManageMaterials && <MaterialFormDialog units={units} />}
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Material</TH><TH>Category</TH><TH>Unit</TH><TH className="text-right">On hand</TH><TH className="text-right">Avg cost</TH><TH className="text-right">Reorder</TH>{canManageMaterials && <TH />}</TR></THead>
            <TBody>
              {materials.map((m) => (
                <TR key={m.id}>
                  <TD><div className="font-medium">{m.name}</div><div className="text-[11px] text-muted-foreground">{m.code}</div></TD>
                  <TD>{m.kind === "RAW_MATERIAL" ? "Raw material" : "Packaging"}</TD>
                  <TD>{m.unit.code}</TD>
                  <TD className="tabular text-right">{formatQty(m.balance?.quantity ?? 0)}</TD>
                  <TD className="tabular text-right">{formatINR(D(m.balance?.avgCost ?? 0).toDecimalPlaces(3).toFixed(3), 3)}</TD>
                  <TD className="tabular text-right">{formatQty(m.reorderLevel)}</TD>
                  {canManageMaterials && (
                    <TD className="text-right">
                      <MaterialFormDialog units={units} material={{ id: m.id, name: m.name, code: m.code, kind: m.kind as "RAW_MATERIAL" | "PACKAGING_MATERIAL", unitId: m.unitId, reorderLevel: D(m.reorderLevel).toFixed(), description: m.description ?? "", isActive: m.isActive }} />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
