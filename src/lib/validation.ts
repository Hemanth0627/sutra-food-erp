import { z } from "zod";
import { validateGstin } from "./gstin";

/**
 * Shared input schemas (API validation on the server, form validation on the client).
 * Decimal fields are accepted as strings or numbers and normalised to plain decimal strings so the
 * server converts them straight to exact decimals.
 */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function decimalField(opts: { min?: number; max?: number; positive?: boolean; dp?: number; label?: string } = {}) {
  const label = opts.label ?? "Value";
  return z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => DECIMAL_RE.test(v), { message: `${label} must be a number` })
    .refine((v) => opts.dp === undefined || (v.split(".")[1]?.length ?? 0) <= opts.dp, {
      message: `${label} allows at most ${opts.dp} decimal places`,
    })
    .refine((v) => !opts.positive || Number(v) > 0, { message: `${label} must be greater than zero` })
    .refine((v) => opts.min === undefined || Number(v) >= opts.min, { message: `${label} must be at least ${opts.min}` })
    .refine((v) => opts.max === undefined || Number(v) <= opts.max, { message: `${label} must be at most ${opts.max}` });
}

const id = z.string().min(1, "Required");
const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v ? v : undefined))
  .superRefine((v, ctx) => {
    if (!v) return;
    const check = validateGstin(v);
    if (!check.valid) ctx.addIssue({ code: "custom", message: check.reason });
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(200),
});

export const customerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(["RETAILER", "DISTRIBUTOR"]),
    gstin: gstinField,
    phone: z.string().trim().regex(/^[0-9+\-\s]{8,15}$/, "Enter a valid phone number"),
    email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
    addressLine: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(80),
    stateCode: z.string().regex(/^\d{2}$/, "Select a state"),
    pincode: z.string().trim().regex(/^\d{6}$/, "6-digit PIN").optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
    creditLimit: decimalField({ min: 0, dp: 2, label: "Credit limit" }),
    paymentTermsDays: z.coerce.number().int().min(0).max(365),
    salesmanId: z.string().optional().transform((v) => (v ? v : undefined)),
  })
  .refine((c) => !c.gstin || c.gstin.slice(0, 2) === c.stateCode, {
    message: "GSTIN state code must match the customer's state",
    path: ["gstin"],
  });
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  gstin: gstinField,
  phone: z.string().trim().regex(/^[0-9+\-\s]{8,15}$/, "Enter a valid phone number"),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  addressLine: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  stateCode: z.string().regex(/^\d{2}$/, "Select a state"),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, "3–30 letters, digits or dashes"),
  categoryId: id,
  packSize: z.string().trim().min(1).max(30),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/, "HSN must be 4–8 digits"),
  gstRate: decimalField({ min: 0, max: 28, dp: 2, label: "GST rate" }),
  sellingPrice: decimalField({ positive: true, dp: 2, label: "Selling price" }),
  reorderLevel: decimalField({ min: 0, dp: 3, label: "Reorder level" }),
  shelfLifeDays: z.coerce.number().int().min(1).max(3650).optional(),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productSchema>;

export const materialSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, "3–30 letters, digits or dashes"),
  kind: z.enum(["RAW_MATERIAL", "PACKAGING_MATERIAL"]),
  unitId: id,
  reorderLevel: decimalField({ min: 0, dp: 3, label: "Reorder level" }),
  description: optionalText,
  isActive: z.boolean().default(true),
});
export type MaterialInput = z.infer<typeof materialSchema>;

export const purchaseSchema = z.object({
  supplierId: id,
  /** Set when the goods are received against a purchase order. */
  purchaseOrderId: z.string().min(1).optional(),
  supplierInvoiceNo: z.string().trim().min(1).max(40),
  invoiceDate: isoDate,
  receivedDate: isoDate,
  notes: optionalText,
  items: z
    .array(
      z.object({
        itemId: id,
        unitId: id,
        quantity: decimalField({ positive: true, dp: 3, label: "Quantity" }),
        rate: decimalField({ min: 0, dp: 4, label: "Rate" }),
        gstRate: decimalField({ min: 0, max: 28, dp: 2, label: "GST rate" }),
        batchNo: optionalText,
        expiryDate: isoDate.optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
        purchaseOrderItemId: z.string().min(1).optional(),
      }),
    )
    .min(1, "Add at least one item"),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const purchaseOrderSchema = z.object({
  supplierId: id,
  orderDate: isoDate,
  expectedDate: isoDate.optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  notes: optionalText,
  items: z
    .array(
      z.object({
        itemId: id,
        unitId: id,
        quantity: decimalField({ positive: true, dp: 3, label: "Quantity" }),
        rate: decimalField({ min: 0, dp: 4, label: "Rate" }),
        gstRate: decimalField({ min: 0, max: 28, dp: 2, label: "GST rate" }),
      }),
    )
    .min(1, "Add at least one item"),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const purchaseOrderCancelSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const purchaseReturnSchema = z.object({
  purchaseItemId: id,
  quantity: decimalField({ positive: true, dp: 3, label: "Quantity" }),
  reason: z.string().trim().min(3).max(300),
});

export const bomCreateSchema = z.object({
  productId: id,
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/),
});

export const bomVersionSchema = z.object({
  batchSize: decimalField({ positive: true, dp: 3, label: "Batch size" }),
  expectedYieldPct: decimalField({ positive: true, max: 100, dp: 2, label: "Expected yield" }),
  notes: optionalText,
  items: z
    .array(
      z.object({
        itemId: id,
        unitId: id,
        quantity: decimalField({ positive: true, dp: 4, label: "Quantity" }),
        notes: optionalText,
      }),
    )
    .min(1, "A BOM needs at least one material"),
});
export type BomVersionInput = z.infer<typeof bomVersionSchema>;

export const productionCreateSchema = z.object({
  productId: id,
  bomVersionId: id,
  plannedBatches: decimalField({ positive: true, max: 1000, dp: 3, label: "Batches" }),
  plannedDate: isoDate,
  notes: optionalText,
});

export const productionStartSchema = z.object({
  materials: z
    .array(z.object({ itemId: id, actualQty: decimalField({ min: 0, dp: 3, label: "Issued quantity" }) }))
    .min(1),
});

export const productionCompleteSchema = z.object({
  actualGoodOutput: decimalField({ min: 0, dp: 3, label: "Good output" }),
  scrapQty: decimalField({ min: 0, dp: 3, label: "Scrap" }).optional(),
  scrapNotes: optionalText,
  materials: z
    .array(
      z.object({
        itemId: id,
        actualQty: decimalField({ min: 0, dp: 3, label: "Actual quantity" }),
        damagedQty: decimalField({ min: 0, dp: 3, label: "Damaged quantity" }),
      }),
    )
    .min(1),
});
export type ProductionCompleteInput = z.infer<typeof productionCompleteSchema>;

export const expenseSchema = z
  .object({
    expenseDate: isoDate,
    category: z.enum(["LABOUR", "GAS", "ELECTRICITY", "GAS_AND_POWER", "OTHER_OVERHEAD"]),
    amount: decimalField({ positive: true, dp: 2, label: "Amount" }),
    description: z.string().trim().min(3).max(300),
    allocationMethod: z.enum(["DIRECT", "OUTPUT_QUANTITY"]),
    productionRunId: z.string().optional().transform((v) => (v ? v : undefined)),
  })
  .refine((e) => e.allocationMethod !== "DIRECT" || !!e.productionRunId, {
    message: "Select the production run for a direct expense",
    path: ["productionRunId"],
  });
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const orderCreateSchema = z.object({
  clientRef: z.string().uuid("clientRef must be a UUID"),
  customerId: id,
  notes: optionalText,
  capturedOffline: z.boolean().optional().default(false),
  orderDate: z.string().datetime().optional(),
  items: z
    .array(z.object({ productId: id, quantity: decimalField({ positive: true, dp: 0, max: 100000, label: "Quantity" }) }))
    .min(1, "Add at least one product"),
});
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/** Admin correction of a pending/approved (not yet invoiced) order. Every change is audited. */
export const orderAmendSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for the change").max(300),
  lines: z
    .array(
      z.object({
        orderItemId: id,
        quantity: decimalField({ positive: true, dp: 0, max: 100000, label: "Quantity" }),
        rate: decimalField({ positive: true, dp: 2, max: 1000000, label: "Rate" }),
      }),
    )
    .min(1),
});
export type OrderAmendInput = z.infer<typeof orderAmendSchema>;

export const orderDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  reason: optionalText,
});

export const invoiceCreateSchema = z.object({
  orderId: id,
  invoiceDate: isoDate.optional(),
  notes: optionalText,
  lines: z
    .array(z.object({ orderItemId: id, quantity: decimalField({ positive: true, dp: 0, label: "Quantity" }) }))
    .min(1),
});

export const invoiceCancelSchema = z.object({
  reason: z.string().trim().min(5).max(300),
  returnStock: z.boolean().default(false),
});

export const dispatchSchema = z.object({
  invoiceId: id,
  dispatchDate: isoDate.optional(),
  vehicleNo: optionalText,
  transporter: optionalText,
  notes: optionalText,
});

export const paymentSchema = z.object({
  customerId: id,
  paymentDate: isoDate,
  amount: decimalField({ positive: true, dp: 2, label: "Amount" }),
  mode: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]),
  reference: optionalText,
  notes: optionalText,
  autoAllocate: z.boolean().default(true),
  allocations: z
    .array(z.object({ invoiceId: id, amount: decimalField({ positive: true, dp: 2, label: "Allocation" }) }))
    .default([]),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const stockAdjustmentSchema = z.object({
  itemId: id,
  type: z.enum(["STOCK_ADJUSTMENT", "DAMAGED_MATERIAL"]),
  direction: z.enum(["INCREASE", "DECREASE"]),
  quantity: decimalField({ positive: true, dp: 3, label: "Quantity" }),
  unitCost: decimalField({ min: 0, dp: 4, label: "Unit cost" }).optional(),
  reason: z.string().trim().min(5).max(300),
});

export const settingsSchema = z.object({
  legalName: z.string().trim().min(3).max(150),
  tradeName: z.string().trim().min(2).max(150),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => validateGstin(v).valid, "Invalid GSTIN"),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: optionalText,
  city: z.string().trim().min(2).max(80),
  stateCode: z.string().regex(/^\d{2}$/),
  pincode: z.string().trim().regex(/^\d{6}$/),
  phone: optionalText,
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  bankDetails: optionalText,
  varianceTolerancePct: decimalField({ min: 0, max: 50, dp: 2, label: "Variance tolerance" }),
});
