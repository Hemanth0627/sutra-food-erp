import { stateName, placeOfSupplyLabel } from "@/lib/gstin";
import type { CustomerInput, MaterialInput, ProductInput, SupplierInput } from "@/lib/validation";
import { audit, type Actor } from "../audit";
import { withTransaction } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { nextMasterCode } from "./common";

// ─────────────── Customers ───────────────

export async function createCustomer(actor: Actor, input: CustomerInput) {
  return withTransaction(async (tx) => {
    if (input.salesmanId) {
      const s = await tx.user.findUnique({ where: { id: input.salesmanId } });
      if (!s || s.role !== "SALESMAN") throw badRequest("Assigned salesman not found");
    }
    const code = await nextMasterCode(tx, "CUS");
    const customer = await tx.customer.create({
      data: {
        code,
        name: input.name,
        type: input.type,
        gstin: input.gstin ?? null,
        phone: input.phone,
        email: input.email ?? null,
        addressLine: input.addressLine,
        city: input.city,
        state: stateName(input.stateCode),
        stateCode: input.stateCode,
        pincode: input.pincode ?? null,
        placeOfSupply: placeOfSupplyLabel(input.stateCode),
        creditLimit: input.creditLimit,
        paymentTermsDays: input.paymentTermsDays,
        salesmanId: input.salesmanId ?? null,
      },
    });
    await audit(tx, actor, "customer.create", "Customer", customer.id, `Created customer ${customer.code} ${customer.name}`);
    return customer;
  });
}

export async function updateCustomer(actor: Actor, id: string, input: CustomerInput & { isActive?: boolean }) {
  return withTransaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw notFound("Customer");
    const customer = await tx.customer.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type,
        gstin: input.gstin ?? null,
        phone: input.phone,
        email: input.email ?? null,
        addressLine: input.addressLine,
        city: input.city,
        state: stateName(input.stateCode),
        stateCode: input.stateCode,
        pincode: input.pincode ?? null,
        placeOfSupply: placeOfSupplyLabel(input.stateCode),
        creditLimit: input.creditLimit,
        paymentTermsDays: input.paymentTermsDays,
        salesmanId: input.salesmanId ?? null,
        isActive: input.isActive ?? before.isActive,
      },
    });
    await audit(tx, actor, "customer.update", "Customer", id, `Updated customer ${customer.code}`, {
      before: { creditLimit: before.creditLimit.toString(), stateCode: before.stateCode, gstin: before.gstin },
      after: { creditLimit: customer.creditLimit.toString(), stateCode: customer.stateCode, gstin: customer.gstin },
    });
    return customer;
  });
}

// ─────────────── Suppliers ───────────────

export async function createSupplier(actor: Actor, input: SupplierInput) {
  return withTransaction(async (tx) => {
    const code = await nextMasterCode(tx, "SUP");
    const supplier = await tx.supplier.create({
      data: {
        code,
        name: input.name,
        gstin: input.gstin ?? null,
        phone: input.phone,
        email: input.email ?? null,
        addressLine: input.addressLine,
        city: input.city,
        state: stateName(input.stateCode),
        stateCode: input.stateCode,
        paymentTermsDays: input.paymentTermsDays,
      },
    });
    await audit(tx, actor, "supplier.create", "Supplier", supplier.id, `Created supplier ${supplier.code} ${supplier.name}`);
    return supplier;
  });
}

export async function updateSupplier(actor: Actor, id: string, input: SupplierInput & { isActive?: boolean }) {
  return withTransaction(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id } });
    if (!before) throw notFound("Supplier");
    const supplier = await tx.supplier.update({
      where: { id },
      data: {
        name: input.name,
        gstin: input.gstin ?? null,
        phone: input.phone,
        email: input.email ?? null,
        addressLine: input.addressLine,
        city: input.city,
        state: stateName(input.stateCode),
        stateCode: input.stateCode,
        paymentTermsDays: input.paymentTermsDays,
        isActive: input.isActive ?? before.isActive,
      },
    });
    await audit(tx, actor, "supplier.update", "Supplier", id, `Updated supplier ${supplier.code}`);
    return supplier;
  });
}

// ─────────────── Products (finished goods) ───────────────

export async function createProduct(actor: Actor, input: ProductInput) {
  return withTransaction(async (tx) => {
    const exists = await tx.item.findUnique({ where: { code: input.sku } });
    if (exists) throw conflict(`An item with code ${input.sku} already exists`);
    const unit = await tx.unit.findUnique({ where: { code: "PKT" } });
    if (!unit) throw notFound("Unit PKT");
    const product = await tx.product.create({
      data: {
        sku: input.sku,
        packSize: input.packSize,
        hsnCode: input.hsnCode,
        gstRate: input.gstRate,
        sellingPrice: input.sellingPrice,
        category: { connect: { id: input.categoryId } },
        item: {
          create: {
            code: input.sku,
            name: input.name,
            kind: "FINISHED_GOOD",
            unitId: unit.id,
            reorderLevel: input.reorderLevel,
            shelfLifeDays: input.shelfLifeDays ?? null,
            isActive: input.isActive,
          },
        },
      },
      include: { item: true },
    });
    await audit(tx, actor, "product.create", "Product", product.id, `Created product ${product.sku} ${product.item.name} at ₹${product.sellingPrice}`);
    return product;
  });
}

export async function updateProduct(actor: Actor, id: string, input: ProductInput) {
  return withTransaction(async (tx) => {
    const before = await tx.product.findUnique({ where: { id }, include: { item: true } });
    if (!before) throw notFound("Product");
    if (input.sku !== before.sku) throw badRequest("SKU cannot be changed after creation");
    const product = await tx.product.update({
      where: { id },
      data: {
        packSize: input.packSize,
        hsnCode: input.hsnCode,
        gstRate: input.gstRate,
        sellingPrice: input.sellingPrice,
        category: { connect: { id: input.categoryId } },
        item: {
          update: {
            name: input.name,
            reorderLevel: input.reorderLevel,
            shelfLifeDays: input.shelfLifeDays ?? null,
            isActive: input.isActive,
          },
        },
      },
      include: { item: true },
    });
    await audit(tx, actor, "product.update", "Product", id, `Updated product ${product.sku}`, {
      before: { sellingPrice: before.sellingPrice.toString(), gstRate: before.gstRate.toString(), hsnCode: before.hsnCode },
      after: { sellingPrice: product.sellingPrice.toString(), gstRate: product.gstRate.toString(), hsnCode: product.hsnCode },
    });
    return product;
  });
}

// ─────────────── Materials (raw + packaging) ───────────────

export async function createMaterial(actor: Actor, input: MaterialInput) {
  return withTransaction(async (tx) => {
    const exists = await tx.item.findUnique({ where: { code: input.code } });
    if (exists) throw conflict(`An item with code ${input.code} already exists`);
    const item = await tx.item.create({
      data: {
        code: input.code,
        name: input.name,
        kind: input.kind,
        unitId: input.unitId,
        reorderLevel: input.reorderLevel,
        description: input.description ?? null,
        isActive: input.isActive,
      },
    });
    await audit(tx, actor, "material.create", "Item", item.id, `Created ${input.kind === "RAW_MATERIAL" ? "raw" : "packaging"} material ${item.code} ${item.name}`);
    return item;
  });
}

export async function updateMaterial(actor: Actor, id: string, input: MaterialInput) {
  return withTransaction(async (tx) => {
    const before = await tx.item.findUnique({ where: { id }, include: { _count: { select: { ledger: true } } } });
    if (!before || before.kind === "FINISHED_GOOD") throw notFound("Material");
    if (before.unitId !== input.unitId && before._count.ledger > 0) {
      throw badRequest("The stock unit cannot change once the material has stock movements");
    }
    const item = await tx.item.update({
      where: { id },
      data: {
        name: input.name,
        unitId: input.unitId,
        reorderLevel: input.reorderLevel,
        description: input.description ?? null,
        isActive: input.isActive,
      },
    });
    await audit(tx, actor, "material.update", "Item", id, `Updated material ${item.code}`);
    return item;
  });
}
