import type { Role } from "./permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Role-based navigation. Every entry points to a working page; access is re-checked on the server. */
export const NAV: Record<Role, NavSection[]> = {
  OWNER: [
    { items: [
      { href: "/dashboard", label: "Overview", icon: "dashboard" },
      { href: "/analytics", label: "Analytics", icon: "analytics" },
      { href: "/inventory", label: "Inventory overview", icon: "inventory" },
      { href: "/production", label: "Production overview", icon: "production" },
      { href: "/finance", label: "Financial overview", icon: "finance" },
      { href: "/alerts", label: "Alerts", icon: "alerts" },
    ] },
    { title: "Records", items: [
      { href: "/orders", label: "Orders", icon: "orders" },
      { href: "/invoices", label: "Invoices", icon: "invoices" },
      { href: "/reports", label: "Reports", icon: "reports" },
      { href: "/benchmark", label: "Benchmark check", icon: "benchmark" },
      { href: "/audit", label: "Audit log", icon: "audit" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ] },
  ],
  ADMIN: [
    { items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/orders", label: "Orders", icon: "orders" },
      { href: "/customers", label: "Customers", icon: "customers" },
      { href: "/products", label: "Products", icon: "products" },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
      { href: "/purchases", label: "Purchases", icon: "purchases" },
      { href: "/invoices", label: "Invoices", icon: "invoices" },
      { href: "/dispatch", label: "Dispatch", icon: "dispatch" },
      { href: "/payments", label: "Payments", icon: "payments" },
      { href: "/inventory", label: "Inventory", icon: "inventory" },
      { href: "/reports", label: "Reports", icon: "reports" },
    ] },
    { title: "Control", items: [
      { href: "/expenses", label: "Production expenses", icon: "expenses" },
      { href: "/alerts", label: "Alerts", icon: "alerts" },
      { href: "/benchmark", label: "Benchmark check", icon: "benchmark" },
      { href: "/audit", label: "Audit log", icon: "audit" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ] },
  ],
  SALESMAN: [
    { items: [
      { href: "/dashboard", label: "Home", icon: "home" },
      { href: "/orders/new", label: "New order", icon: "new" },
      { href: "/orders", label: "My orders", icon: "orders" },
      { href: "/customers", label: "Customers", icon: "customers" },
      { href: "/products", label: "Products", icon: "products" },
      { href: "/sales-summary", label: "Sales summary", icon: "summary" },
    ] },
  ],
  PRODUCTION_SUPERVISOR: [
    { items: [
      { href: "/dashboard", label: "Production dashboard", icon: "dashboard" },
      { href: "/bom", label: "Bill of materials", icon: "bom" },
      { href: "/production/new", label: "New production run", icon: "new" },
      { href: "/production", label: "Production history", icon: "history" },
      { href: "/production/consumption", label: "Material consumption", icon: "consumption" },
      { href: "/production/variance", label: "Variance analysis", icon: "variance" },
      { href: "/inventory?tab=RAW_MATERIAL", label: "Raw-material inventory", icon: "inventory" },
    ] },
    { title: "Stores", items: [
      { href: "/purchases", label: "Material receipts", icon: "purchases" },
      { href: "/expenses", label: "Production expenses", icon: "expenses" },
      { href: "/alerts", label: "Alerts", icon: "alerts" },
    ] },
  ],
  ACCOUNTANT: [
    { items: [
      { href: "/dashboard", label: "Accounting dashboard", icon: "dashboard" },
      { href: "/reports/sales-register", label: "Sales register", icon: "invoices" },
      { href: "/reports/purchase-register", label: "Purchase register", icon: "purchases" },
      { href: "/reports/gst-summary", label: "GST reports", icon: "gst" },
      { href: "/reports?group=Inventory", label: "Stock reports", icon: "inventory" },
      { href: "/reports?group=Production", label: "Production reports", icon: "production" },
      { href: "/reports/collections", label: "Collections", icon: "payments" },
      { href: "/reports/outstanding", label: "Outstanding", icon: "finance" },
      { href: "/reports/monthly-audit", label: "Audit reports", icon: "audit" },
    ] },
    { title: "Records", items: [
      { href: "/invoices", label: "Invoices", icon: "receipt" },
      { href: "/reports", label: "All reports", icon: "reports" },
      { href: "/audit", label: "Audit log", icon: "history" },
      { href: "/benchmark", label: "Benchmark check", icon: "benchmark" },
    ] },
  ],
};

/** Bottom tab bar for the salesman mobile app. */
export const SALESMAN_TABS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/orders/new", label: "New", icon: "new" },
  { href: "/orders", label: "Orders", icon: "orders" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/sales-summary", label: "Summary", icon: "summary" },
];

const LABELS: Record<string, string> = {
  dashboard: "Dashboard", analytics: "Analytics", finance: "Finance", alerts: "Alerts", orders: "Orders", new: "New",
  customers: "Customers", products: "Products", suppliers: "Suppliers", purchases: "Purchases", invoices: "Invoices",
  dispatch: "Dispatch", payments: "Payments", inventory: "Inventory", reports: "Reports", bom: "Bill of materials",
  production: "Production", variance: "Variance analysis", consumption: "Material consumption", expenses: "Expenses",
  audit: "Audit log", settings: "Settings", benchmark: "Benchmark", "sales-summary": "Sales summary",
  "gst-summary": "GST summary", "monthly-audit": "Monthly audit", "sales-register": "Sales register",
  "purchase-register": "Purchase register", "planned-vs-actual": "Planned vs actual", "cost-per-packet": "Cost per packet",
  "receivables-ageing": "Receivables ageing", edit: "Edit",
};

export function breadcrumbLabel(segment: string): string {
  if (LABELS[segment]) return LABELS[segment];
  if (segment.length > 20) return "Details";
  const text = decodeURIComponent(segment).replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
