/**
 * Role-based access control. The same matrix drives server-side checks (API routes, server
 * pages) and the client navigation, but only the server-side checks are authoritative.
 */
export type Role = "OWNER" | "ADMIN" | "SALESMAN" | "PRODUCTION_SUPERVISOR" | "ACCOUNTANT";

export const ROLES: Role[] = ["OWNER", "ADMIN", "SALESMAN", "PRODUCTION_SUPERVISOR", "ACCOUNTANT"];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  SALESMAN: "Salesman",
  PRODUCTION_SUPERVISOR: "Production Supervisor",
  ACCOUNTANT: "Accountant",
};

export const PERMISSIONS = [
  "dashboard:owner",
  "analytics:view",
  "alerts:view",
  "orders:create",
  "orders:view-own",
  "orders:view-all",
  "orders:approve",
  "customers:view",
  "customers:manage",
  "products:view",
  "products:manage",
  "suppliers:view",
  "suppliers:manage",
  "purchases:view",
  "purchases:create",
  "invoices:view",
  "invoices:create",
  "invoices:cancel",
  "dispatch:view",
  "dispatch:create",
  "payments:view",
  "payments:create",
  "inventory:view",
  "inventory:adjust",
  "bom:view",
  "bom:manage",
  "production:view",
  "production:manage",
  "expenses:view",
  "expenses:manage",
  "reports:view",
  "reports:export",
  "audit:view",
  "settings:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_VIEW: Permission[] = [
  "dashboard:owner",
  "analytics:view",
  "alerts:view",
  "orders:view-all",
  "customers:view",
  "products:view",
  "suppliers:view",
  "purchases:view",
  "invoices:view",
  "dispatch:view",
  "payments:view",
  "inventory:view",
  "bom:view",
  "production:view",
  "expenses:view",
  "reports:view",
  "reports:export",
  "audit:view",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...ALL_VIEW, "settings:manage"],
  ADMIN: [
    "alerts:view",
    "orders:create",
    "orders:view-all",
    "orders:approve",
    "customers:view",
    "customers:manage",
    "products:view",
    "products:manage",
    "suppliers:view",
    "suppliers:manage",
    "purchases:view",
    "purchases:create",
    "invoices:view",
    "invoices:create",
    "invoices:cancel",
    "dispatch:view",
    "dispatch:create",
    "payments:view",
    "payments:create",
    "inventory:view",
    "inventory:adjust",
    "bom:view",
    "production:view",
    "expenses:view",
    "expenses:manage",
    "reports:view",
    "reports:export",
    "audit:view",
    "settings:manage",
  ],
  SALESMAN: ["orders:create", "orders:view-own", "customers:view", "products:view"],
  PRODUCTION_SUPERVISOR: [
    "alerts:view",
    "bom:view",
    "bom:manage",
    "production:view",
    "production:manage",
    "inventory:view",
    "products:view",
    "suppliers:view",
    "purchases:view",
    "purchases:create",
    "expenses:view",
    "expenses:manage",
  ],
  ACCOUNTANT: [
    "orders:view-all",
    "customers:view",
    "products:view",
    "suppliers:view",
    "purchases:view",
    "invoices:view",
    "dispatch:view",
    "payments:view",
    "inventory:view",
    "production:view",
    "bom:view",
    "expenses:view",
    "reports:view",
    "reports:export",
    "audit:view",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
