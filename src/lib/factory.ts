/**
 * Factory digital-twin vocabulary shared by the server snapshot, the 3D scene, the live twin page and
 * the public landing tour. Client-safe: no server imports.
 *
 * Status colours always travel with a text label (statusText) so colour is never the only signal.
 */

export const DEPARTMENT_IDS = [
  "raw-warehouse",
  "flour",
  "oil",
  "spice",
  "packaging-store",
  "production",
  "mixing",
  "frying",
  "cooling",
  "packing",
  "qc",
  "fg-warehouse",
  "dispatch",
] as const;
export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export type DepartmentGroup = "Stores" | "Production line" | "Finished goods";

export interface DepartmentInfo {
  id: DepartmentId;
  name: string;
  /** Short name for 3D labels. */
  short: string;
  group: DepartmentGroup;
  /** One or two sentences for first-time visitors: what physically happens here. */
  whatHappens: string;
  /** Which ERP records drive this area of the twin. */
  dataSource: string;
  /** ERP pages that own this department's data (filtered by permission in the UI). */
  links: { label: string; href: string; permission: string }[];
}

export const DEPARTMENTS: DepartmentInfo[] = [
  {
    id: "raw-warehouse",
    short: "Raw materials",
    name: "Raw-material warehouse",
    group: "Stores",
    whatHappens: "Supplier deliveries are checked against the purchase order and put away. Each receipt adds stock through the ledger at weighted-average cost.",
    dataSource: "Raw-material balances, open purchase orders and recent purchase-receipt ledger entries.",
    links: [
      { label: "Purchase orders", href: "/purchase-orders", permission: "purchases:view" },
      { label: "Purchases", href: "/purchases", permission: "purchases:view" },
      { label: "Raw-material stock", href: "/inventory?tab=RAW_MATERIAL", permission: "inventory:view" },
    ],
  },
  {
    id: "flour",
    short: "Flour",
    name: "Flour storage",
    group: "Stores",
    whatHappens: "Rice flour and gram flour in sacks on pallets. One Murukku batch draws 40 kg.",
    dataSource: "Ledger balance of every flour item (sacks drawn at 10 kg each).",
    links: [{ label: "Stock ledger", href: "/reports/stock-ledger", permission: "reports:view" }],
  },
  {
    id: "oil",
    short: "Oil",
    name: "Oil storage",
    group: "Stores",
    whatHappens: "Cooking-oil and coconut-oil tanks that feed the fryer. Oil is issued by the litre and is the input most likely to overrun.",
    dataSource: "Ledger balance of every item measured in litres.",
    links: [{ label: "Stock ledger", href: "/reports/stock-ledger", permission: "reports:view" }],
  },
  {
    id: "spice",
    short: "Spices",
    name: "Spice storage",
    group: "Stores",
    whatHappens: "Salt, spice mix and sugar in sealed bins, weighed out for each batch.",
    dataSource: "Ledger balance of spice, salt and sugar items.",
    links: [{ label: "Stock ledger", href: "/reports/stock-ledger", permission: "reports:view" }],
  },
  {
    id: "packaging-store",
    short: "Packaging store",
    name: "Packaging-material store",
    group: "Stores",
    whatHappens: "Printed 200 g pouches and shipping cartons. One carton holds 20 packets; damaged pouches are written off and costed.",
    dataSource: "Packaging balances plus damaged quantities from production runs.",
    links: [
      { label: "Packaging stock", href: "/inventory?tab=PACKAGING_MATERIAL", permission: "inventory:view" },
      { label: "Packaging report", href: "/reports/packaging-stock", permission: "reports:view" },
    ],
  },
  {
    id: "production",
    short: "Production hall",
    name: "Production hall",
    group: "Production line",
    whatHappens: "A production run explodes the active BOM version into material requirements, issues the materials and posts the good output, all in one database transaction.",
    dataSource: "Production runs: status, planned vs good output, yield variance and cost per packet.",
    links: [
      { label: "Production runs", href: "/production", permission: "production:view" },
      { label: "Variance analysis", href: "/production/variance", permission: "production:view" },
      { label: "Costing", href: "/costing", permission: "production:view" },
    ],
  },
  {
    id: "mixing",
    short: "Mixing",
    name: "Mixing",
    group: "Production line",
    whatHappens: "Flour, spice mix and water are kneaded into dough in the quantities the BOM prescribes.",
    dataSource: "Flour and spice issues on the latest runs against BOM standard.",
    links: [{ label: "Material consumption", href: "/production/consumption", permission: "production:view" }],
  },
  {
    id: "frying",
    short: "Frying",
    name: "Cooking & frying",
    group: "Production line",
    whatHappens: "Dough is pressed into murukku spirals and fried in oil. Oil use is checked against the BOM standard.",
    dataSource: "Oil issued on the latest runs against BOM standard (±tolerance).",
    links: [{ label: "Planned vs actual", href: "/reports/planned-vs-actual", permission: "reports:view" }],
  },
  {
    id: "cooling",
    short: "Cooling",
    name: "Cooling",
    group: "Production line",
    whatHappens: "Fried snacks cool on a slow conveyor so the pouches do not sweat after sealing.",
    dataSource: "Runs currently in progress (the ERP does not record cooling separately).",
    links: [{ label: "Production runs", href: "/production", permission: "production:view" }],
  },
  {
    id: "packing",
    short: "Packing line",
    name: "Packaging line",
    group: "Production line",
    whatHappens: "A form-fill-seal machine fills 200 g pouches, which are boxed 20 to a carton.",
    dataSource: "Pouches and cartons consumed, and damaged pouches, on recent runs.",
    links: [{ label: "Yield & wastage", href: "/reports/yield-wastage", permission: "reports:view" }],
  },
  {
    id: "qc",
    short: "Quality control",
    name: "Quality control",
    group: "Production line",
    whatHappens: "Every completed run is compared with its BOM: yield and each material are checked against the variance tolerance.",
    dataSource: "Variance flags on completed runs in the last 30 days.",
    links: [{ label: "Variance analysis", href: "/production/variance", permission: "production:view" }],
  },
  {
    id: "fg-warehouse",
    short: "Finished goods",
    name: "Finished-goods warehouse",
    group: "Finished goods",
    whatHappens: "Packed cartons wait here by batch and expiry. Stock is reserved when an invoice is issued and leaves when it is dispatched.",
    dataSource: "Finished-goods balances, invoice reservations, production batches and open-order demand.",
    links: [
      { label: "Finished-goods stock", href: "/inventory?tab=FINISHED_GOOD", permission: "inventory:view" },
      { label: "Orders", href: "/orders", permission: "orders:view-all" },
    ],
  },
  {
    id: "dispatch",
    short: "Dispatch",
    name: "Dispatch & loading",
    group: "Finished goods",
    whatHappens: "Invoiced goods are loaded on to vehicles. Dispatch posts a sales-dispatch movement exactly once per invoice.",
    dataSource: "Invoices awaiting dispatch, recent dispatches and orders waiting for stock.",
    links: [
      { label: "Dispatch", href: "/dispatch", permission: "dispatch:view" },
      { label: "Invoices", href: "/invoices", permission: "invoices:view" },
    ],
  },
];

export const DEPARTMENT_BY_ID = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d])) as Record<DepartmentId, DepartmentInfo>;

/** Material flow order used by the guided tour. */
export const TOUR_ORDER: DepartmentId[] = [
  "raw-warehouse",
  "flour",
  "oil",
  "spice",
  "packaging-store",
  "production",
  "mixing",
  "frying",
  "cooling",
  "packing",
  "qc",
  "fg-warehouse",
  "dispatch",
];

export type DeptStatus = "ok" | "warning" | "critical" | "idle";
export type Tone = "ok" | "warning" | "critical" | "muted";

export const STATUS_LABEL: Record<DeptStatus, string> = {
  ok: "Normal",
  warning: "Attention",
  critical: "Critical",
  idle: "Idle / no data",
};

/** Shape-coded glyph shown with every status colour, so status never relies on colour alone. */
export const STATUS_GLYPH: Record<DeptStatus, string> = { ok: "✓", warning: "!", critical: "✕", idle: "–" };

export const STATUS_HEX: Record<DeptStatus, number> = {
  ok: 0x22c55e,
  warning: 0xf59e0b,
  critical: 0xef4444,
  idle: 0x71717a,
};

export interface DeptMetric {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

export interface DeptTable {
  title: string;
  columns: string[];
  rows: string[][];
  empty?: string;
}

export interface DeptGauge {
  label: string;
  /** 0–1, visual only: full = 3 × reorder level. The exact quantity is in `text`. */
  ratio: number;
  text: string;
  status: DeptStatus;
}

export interface DepartmentSnapshot {
  id: DepartmentId;
  status: DeptStatus;
  /** Plain-language status line, e.g. "Oil +5.00% over BOM on PR/2026-27/0001". */
  statusText: string;
  /** Is anything physically happening here right now (a run in progress, a vehicle loading)? */
  activity: "running" | "idle";
  metrics: DeptMetric[];
  tables: DeptTable[];
  visual: {
    gauges?: DeptGauge[];
    /** Countable props drawn in 3D (sacks, cartons, boxes); `unitLabel` explains the scale. */
    units?: number;
    unitLabel?: string;
    /** Dispatch: a vehicle is at the dock. */
    vehicle?: boolean;
  };
}

export interface FactorySnapshot {
  generatedAt: string;
  tolerancePct: string;
  activeRuns: number;
  departments: Record<DepartmentId, DepartmentSnapshot>;
}

const RANK: Record<DeptStatus, number> = { critical: 3, warning: 2, ok: 1, idle: 0 };

/** Worst status wins (critical > warning > ok > idle). */
export function worstStatus(statuses: DeptStatus[]): DeptStatus {
  return statuses.reduce<DeptStatus>((a, b) => (RANK[b] > RANK[a] ? b : a), "idle");
}

/**
 * Stock health of one stored item against its reorder level:
 * critical = out of stock or below half the reorder level, warning = at/below reorder level.
 */
export function stockStatus(quantity: number, reorderLevel: number): DeptStatus {
  if (quantity <= 0) return "critical";
  if (reorderLevel > 0 && quantity < reorderLevel / 2) return "critical";
  if (reorderLevel > 0 && quantity <= reorderLevel) return "warning";
  return "ok";
}

/**
 * Variance health. Any deviation beyond the tolerance is a warning; it becomes critical only when it is
 * more than 2× the tolerance in the adverse direction: material over-use (adverse = +1) or a yield
 * shortfall (adverse = −1). Using fewer cartons because fewer packets were made is not waste.
 */
export function varianceStatus(variancePct: number, tolerancePct: number, adverse: 1 | -1 = 1): DeptStatus {
  if (variancePct * adverse > tolerancePct * 2) return "critical";
  if (Math.abs(variancePct) > tolerancePct) return "warning";
  return "ok";
}

/** Visual fill for a storage gauge: full at 3 × reorder level (or any stock when no reorder level). */
export function gaugeRatio(quantity: number, reorderLevel: number): number {
  if (quantity <= 0) return 0;
  if (reorderLevel <= 0) return 1;
  return Math.min(1, quantity / (reorderLevel * 3));
}

export type StorageZone = "flour" | "oil" | "spice" | "general";

/**
 * Which store a raw material lives in. Oils are anything stocked by volume; flours and spices are
 * recognised by name. Everything else (produce, nuts, ghee) is kept in the general raw-material store.
 */
export function storageZoneFor(item: { name: string; dimension: string }): StorageZone {
  if (item.dimension === "VOLUME") return "oil";
  if (/flour|besan|atta|maida|rava|rice/i.test(item.name)) return "flour";
  if (/spice|salt|chilli|chili|masala|sugar|jeera|pepper/i.test(item.name)) return "spice";
  return "general";
}
