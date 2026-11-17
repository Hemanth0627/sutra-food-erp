/**
 * Master data for the demo company. ALL OF THIS DATA IS FICTIONAL: company, people, GSTINs, PANs,
 * phone numbers and addresses are invented for the internship benchmark and do not refer to real
 * businesses. GSTINs are syntactically valid (correct checksum) but are not registered.
 */
import type { PrismaClient } from "@prisma/client";
import { makeDemoGstin, placeOfSupplyLabel, stateName } from "../../src/lib/gstin";
import { STANDARD_UNITS } from "../../src/lib/units";
import { hashPassword } from "../../src/server/auth/password";
import { postMovement } from "../../src/server/inventory";
import { activateBomVersion, createBom } from "../../src/server/services/bom";
import type { Actor } from "../../src/server/audit";
import { startOfIstMonth } from "../../src/lib/dates";

export const DEMO_USERS = [
  { key: "owner", email: "owner@sutra-erp.test", name: "Meenakshi Sundaram (Owner)", role: "OWNER" },
  { key: "admin", email: "admin@sutra-erp.test", name: "Karthik Rajan (Admin)", role: "ADMIN" },
  { key: "salesmanA", email: "salesman.a@sutra-erp.test", name: "Salesman A", role: "SALESMAN" },
  { key: "salesmanB", email: "salesman.b@sutra-erp.test", name: "Salesman B", role: "SALESMAN" },
  { key: "supervisor", email: "production@sutra-erp.test", name: "Selvi Murugan (Production)", role: "PRODUCTION_SUPERVISOR" },
  { key: "accountant", email: "accounts@sutra-erp.test", name: "Priya Venkatesh (Accounts)", role: "ACCOUNTANT" },
] as const;

export type DemoUserKey = (typeof DEMO_USERS)[number]["key"];
export type Actors = Record<DemoUserKey, Actor>;

export const SELLER_GSTIN = makeDemoGstin("33", "AAKCT4821M");

interface MaterialSeed {
  code: string;
  name: string;
  kind: "RAW_MATERIAL" | "PACKAGING_MATERIAL";
  unit: string;
  reorder: string;
  opening: string;
  rate: string;
}

/** Benchmark materials first (opening stock per section 6.1), then other fictional materials. */
export const MATERIALS: MaterialSeed[] = [
  { code: "RM-FLOUR", name: "Flour", kind: "RAW_MATERIAL", unit: "KG", reorder: "50", opening: "100", rate: "42" },
  { code: "RM-OIL", name: "Cooking Oil", kind: "RAW_MATERIAL", unit: "L", reorder: "15", opening: "30", rate: "140" },
  { code: "RM-SPICE", name: "Salt & Spice Mix", kind: "RAW_MATERIAL", unit: "KG", reorder: "2", opening: "5", rate: "200" },
  { code: "PK-POUCH200", name: "200 g Pouch", kind: "PACKAGING_MATERIAL", unit: "PCS", reorder: "250", opening: "500", rate: "2.50" },
  { code: "PK-CARTON", name: "Carton (20 × 200 g)", kind: "PACKAGING_MATERIAL", unit: "PCS", reorder: "15", opening: "30", rate: "15" },
  { code: "RM-BESAN", name: "Besan (Gram Flour)", kind: "RAW_MATERIAL", unit: "KG", reorder: "30", opening: "80", rate: "95" },
  { code: "RM-PEANUT", name: "Groundnuts", kind: "RAW_MATERIAL", unit: "KG", reorder: "15", opening: "40", rate: "120" },
  { code: "RM-BANANA", name: "Raw Nendran Banana", kind: "RAW_MATERIAL", unit: "KG", reorder: "40", opening: "100", rate: "30" },
  { code: "RM-COCOIL", name: "Coconut Oil", kind: "RAW_MATERIAL", unit: "L", reorder: "15", opening: "40", rate: "210" },
  { code: "RM-POTATO", name: "Potatoes", kind: "RAW_MATERIAL", unit: "KG", reorder: "60", opening: "150", rate: "25" },
  { code: "RM-SUGAR", name: "Sugar", kind: "RAW_MATERIAL", unit: "KG", reorder: "25", opening: "60", rate: "45" },
  { code: "RM-GHEE", name: "Ghee", kind: "RAW_MATERIAL", unit: "KG", reorder: "8", opening: "20", rate: "600" },
];

interface ProductSeed {
  sku: string;
  name: string;
  category: string;
  hsn: string;
  price: string;
  reorder: string;
  shelfLife: number;
  opening: string;
  openingRate: string;
}

export const PRODUCTS: ProductSeed[] = [
  { sku: "FG-MURUKKU-200", name: "Murukku 200 g", category: "Savouries", hsn: "2106", price: "50.00", reorder: "100", shelfLife: 90, opening: "50", openingRate: "30.00" },
  { sku: "FG-MIXTURE-200", name: "Mixture 200 g", category: "Savouries", hsn: "2106", price: "55.00", reorder: "80", shelfLife: 90, opening: "120", openingRate: "34.00" },
  { sku: "FG-BANANA-200", name: "Banana Chips 200 g", category: "Chips", hsn: "2008", price: "60.00", reorder: "80", shelfLife: 60, opening: "90", openingRate: "38.00" },
  { sku: "FG-POTATO-200", name: "Potato Chips 200 g", category: "Chips", hsn: "2005", price: "45.00", reorder: "100", shelfLife: 60, opening: "150", openingRate: "28.00" },
  { sku: "FG-SWEETS-200", name: "Traditional Sweets 200 g", category: "Sweets", hsn: "1704", price: "80.00", reorder: "50", shelfLife: 30, opening: "60", openingRate: "52.00" },
];

/** BOMs per batch. Murukku is exactly the benchmark recipe (section 6.1). Others are plausible fictional recipes. */
const BOMS: { sku: string; code: string; name: string; batchSize: string; lines: [string, string, string][] }[] = [
  {
    sku: "FG-MURUKKU-200",
    code: "BOM-MURUKKU",
    name: "Murukku 200 g – standard batch",
    batchSize: "200",
    lines: [["RM-FLOUR", "40", "KG"], ["RM-OIL", "10", "L"], ["RM-SPICE", "1.2", "KG"], ["PK-POUCH200", "200", "PCS"], ["PK-CARTON", "10", "PCS"]],
  },
  {
    sku: "FG-MIXTURE-200",
    code: "BOM-MIXTURE",
    name: "Mixture 200 g – standard batch",
    batchSize: "200",
    lines: [["RM-BESAN", "26", "KG"], ["RM-PEANUT", "8", "KG"], ["RM-OIL", "12", "L"], ["RM-SPICE", "1500", "G"], ["PK-POUCH200", "200", "PCS"], ["PK-CARTON", "10", "PCS"]],
  },
  {
    sku: "FG-BANANA-200",
    code: "BOM-BANANA",
    name: "Banana Chips 200 g – standard batch",
    batchSize: "200",
    lines: [["RM-BANANA", "110", "KG"], ["RM-COCOIL", "14", "L"], ["RM-SPICE", "0.8", "KG"], ["PK-POUCH200", "200", "PCS"], ["PK-CARTON", "10", "PCS"]],
  },
  {
    sku: "FG-POTATO-200",
    code: "BOM-POTATO",
    name: "Potato Chips 200 g – standard batch",
    batchSize: "200",
    lines: [["RM-POTATO", "160", "KG"], ["RM-OIL", "15", "L"], ["RM-SPICE", "1", "KG"], ["PK-POUCH200", "200", "PCS"], ["PK-CARTON", "10", "PCS"]],
  },
  {
    sku: "FG-SWEETS-200",
    code: "BOM-SWEETS",
    name: "Traditional Sweets 200 g – standard batch",
    batchSize: "200",
    lines: [["RM-BESAN", "14", "KG"], ["RM-SUGAR", "20", "KG"], ["RM-GHEE", "9000", "G"], ["PK-POUCH200", "200", "PCS"], ["PK-CARTON", "10", "PCS"]],
  },
];

export async function seedMasterData(prisma: PrismaClient, demoPassword: string): Promise<Actors> {
  // Company (seller) settings – Tamil Nadu factory.
  await prisma.companySettings.create({
    data: {
      id: 1,
      legalName: "Thenmalai Snack Works Pvt. Ltd. (fictional)",
      tradeName: "Thenmalai Snacks",
      gstin: SELLER_GSTIN,
      pan: "AAKCT4821M",
      addressLine1: "Plot 14, SIDCO Industrial Estate",
      addressLine2: "Kurichi",
      city: "Coimbatore",
      state: stateName("33"),
      stateCode: "33",
      pincode: "641021",
      phone: "+91 90000 00000",
      email: "accounts@thenmalai-snacks.test",
      bankDetails: "Demo Bank, A/c 000000000000, IFSC DEMO0000001 (fictional)",
      varianceTolerancePct: "3",
    },
  });

  for (const u of STANDARD_UNITS) await prisma.unit.create({ data: u });
  const units = Object.fromEntries((await prisma.unit.findMany()).map((u) => [u.code, u]));

  const passwordHash = await hashPassword(demoPassword);
  const actors = {} as Actors;
  for (const u of DEMO_USERS) {
    const user = await prisma.user.create({ data: { email: u.email, name: u.name, role: u.role, passwordHash, phone: null } });
    actors[u.key] = { id: user.id, name: user.name, role: user.role, ipAddress: "seed" };
  }

  const categories: Record<string, string> = {};
  for (const [name, description] of [
    ["Savouries", "Murukku, mixture and other fried savouries"],
    ["Chips", "Banana and potato chips"],
    ["Sweets", "Traditional South Indian sweets"],
  ]) {
    categories[name] = (await prisma.productCategory.create({ data: { name, description } })).id;
  }

  const items: Record<string, string> = {};
  for (const m of MATERIALS) {
    const item = await prisma.item.create({ data: { code: m.code, name: m.name, kind: m.kind, unitId: units[m.unit].id, reorderLevel: m.reorder } });
    items[m.code] = item.id;
  }
  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        sku: p.sku,
        packSize: "200 g",
        hsnCode: p.hsn,
        gstRate: "5",
        sellingPrice: p.price,
        category: { connect: { id: categories[p.category] } },
        item: { create: { code: p.sku, name: p.name, kind: "FINISHED_GOOD", unitId: units.PKT.id, reorderLevel: p.reorder, shelfLifeDays: p.shelfLife } },
      },
    });
    items[p.sku] = product.itemId;
  }

  // Suppliers (fictional).
  await prisma.supplier.createMany({
    data: [
      { code: "SUP-0001", name: "Sri Lakshmi Flour Mills (fictional)", gstin: makeDemoGstin("33", "ABCFS1234L"), phone: "+91 90000 11111", addressLine: "12 Mill Road", city: "Erode", state: stateName("33"), stateCode: "33", paymentTermsDays: 30 },
      { code: "SUP-0002", name: "Kongu Oil Traders (fictional)", gstin: makeDemoGstin("33", "ABCFK5678K"), phone: "+91 90000 22222", addressLine: "4 Oil Bazaar", city: "Tiruppur", state: stateName("33"), stateCode: "33", paymentTermsDays: 15 },
      { code: "SUP-0003", name: "PackWell Flexibles (fictional)", gstin: makeDemoGstin("29", "ABCFP9012P"), phone: "+91 90000 33333", addressLine: "88 Peenya Industrial Area", city: "Bengaluru", state: stateName("29"), stateCode: "29", paymentTermsDays: 45 },
    ],
  });
  await prisma.documentSequence.create({ data: { key: "CODE:SUP", lastValue: 3 } });

  // Customers: Retailer A (Tamil Nadu, intra-state) and Distributor B (Karnataka, inter-state).
  await prisma.customer.create({
    data: {
      code: "CUS-0001",
      name: "Retailer A",
      type: "RETAILER",
      gstin: makeDemoGstin("33", "AAAPR1111A"),
      phone: "+91 90000 44444",
      email: "retailer.a@example.test",
      addressLine: "21 Big Bazaar Street",
      city: "Coimbatore",
      state: stateName("33"),
      stateCode: "33",
      pincode: "641001",
      placeOfSupply: placeOfSupplyLabel("33"),
      creditLimit: "25000",
      paymentTermsDays: 15,
      salesmanId: actors.salesmanA.id,
    },
  });
  await prisma.customer.create({
    data: {
      code: "CUS-0002",
      name: "Distributor B",
      type: "DISTRIBUTOR",
      gstin: makeDemoGstin("29", "AAAFD2222B"),
      phone: "+91 90000 55555",
      email: "distributor.b@example.test",
      addressLine: "7 Chickpet Main Road",
      city: "Bengaluru",
      state: stateName("29"),
      stateCode: "29",
      pincode: "560053",
      placeOfSupply: placeOfSupplyLabel("29"),
      creditLimit: "100000",
      paymentTermsDays: 30,
      salesmanId: actors.salesmanB.id,
    },
  });
  await prisma.documentSequence.create({ data: { key: "CODE:CUS", lastValue: 2 } });

  // Opening stock through the ledger (OPENING_STOCK movements), dated one minute before the current
  // month starts, so the month's reports show it as the opening balance.
  const openingDate = new Date(startOfIstMonth(new Date()).getTime() - 60_000);
  await prisma.$transaction(async (tx) => {
    for (const m of MATERIALS) {
      await postMovement(tx, {
        itemId: items[m.code],
        movementType: "OPENING_STOCK",
        quantity: m.opening,
        unitCost: m.rate,
        sourceType: "OPENING",
        sourceId: "OPENING",
        sourceLineId: items[m.code],
        sourceRef: "Opening stock",
        txnDate: openingDate,
        userId: actors.admin.id,
        batchNo: "OPENING",
      });
    }
    for (const p of PRODUCTS) {
      await postMovement(tx, {
        itemId: items[p.sku],
        movementType: "OPENING_STOCK",
        quantity: p.opening,
        unitCost: p.openingRate,
        sourceType: "OPENING",
        sourceId: "OPENING",
        sourceLineId: items[p.sku],
        sourceRef: "Opening stock",
        txnDate: openingDate,
        userId: actors.admin.id,
        batchNo: "OPENING",
      });
    }
    await tx.auditLog.create({ data: { userId: actors.admin.id, action: "stock.opening", entityType: "Inventory", entityId: "OPENING", summary: "Posted opening stock for all items (fictional seed data)" } });
  });

  // BOMs (activated after opening stock so the standard cost snapshot uses the opening rates).
  const products = await prisma.product.findMany();
  for (const b of BOMS) {
    const product = products.find((p) => p.sku === b.sku)!;
    const bomId = await createBom(
      actors.supervisor,
      { productId: product.id, name: b.name, code: b.code },
      {
        batchSize: b.batchSize,
        expectedYieldPct: "100",
        notes: b.code === "BOM-MURUKKU" ? "Benchmark recipe: one batch = 200 packets" : "Fictional demo recipe",
        items: b.lines.map(([code, qty, unit]) => ({ itemId: items[code], unitId: units[unit].id, quantity: qty, notes: undefined })),
      },
    );
    const v1 = await prisma.bomVersion.findFirstOrThrow({ where: { bomId, versionNo: 1 } });
    await activateBomVersion(actors.supervisor, v1.id);
  }

  return actors;
}
