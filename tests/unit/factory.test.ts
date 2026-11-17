import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  DEPARTMENT_IDS,
  STATUS_GLYPH,
  STATUS_LABEL,
  TOUR_ORDER,
  gaugeRatio,
  stockStatus,
  storageZoneFor,
  varianceStatus,
  worstStatus,
} from "@/lib/factory";
import { NAV } from "@/lib/nav";
import { hasPermission, ROLES, type Permission } from "@/lib/permissions";

describe("digital twin status rules", () => {
  it("rates stock against the reorder level", () => {
    expect(stockStatus(120, 50)).toBe("ok"); // benchmark flour closing
    expect(stockStatus(50, 50)).toBe("warning"); // at reorder level
    expect(stockStatus(24, 50)).toBe("critical"); // below half the reorder level
    expect(stockStatus(0, 0)).toBe("critical"); // out of stock
    expect(stockStatus(5, 0)).toBe("ok"); // no reorder level configured
  });

  it("treats over-use and yield shortfall as the adverse direction", () => {
    expect(varianceStatus(5, 3)).toBe("warning"); // benchmark oil +5%
    expect(varianceStatus(-6, 3, -1)).toBe("warning"); // benchmark yield −6% (exactly 2× tolerance)
    expect(varianceStatus(-6.5, 3, -1)).toBe("critical");
    expect(varianceStatus(7, 3)).toBe("critical"); // material over-use beyond 2× tolerance
    expect(varianceStatus(-10, 3)).toBe("warning"); // under-use (9 of 10 cartons) is not waste
    expect(varianceStatus(3, 3)).toBe("ok"); // tolerance is inclusive
    expect(varianceStatus(0, 3)).toBe("ok");
  });

  it("lets the worst status win and keeps idle lowest", () => {
    expect(worstStatus(["ok", "warning", "idle"])).toBe("warning");
    expect(worstStatus(["ok", "critical", "warning"])).toBe("critical");
    expect(worstStatus([])).toBe("idle");
  });

  it("scales gauges to three times the reorder level", () => {
    expect(gaugeRatio(150, 50)).toBe(1);
    expect(gaugeRatio(75, 50)).toBe(0.5);
    expect(gaugeRatio(0, 50)).toBe(0);
    expect(gaugeRatio(10, 0)).toBe(1);
  });

  it("puts each raw material in the right store", () => {
    expect(storageZoneFor({ name: "Flour", dimension: "MASS" })).toBe("flour");
    expect(storageZoneFor({ name: "Besan (Gram Flour)", dimension: "MASS" })).toBe("flour");
    expect(storageZoneFor({ name: "Cooking Oil", dimension: "VOLUME" })).toBe("oil");
    expect(storageZoneFor({ name: "Salt & Spice Mix", dimension: "MASS" })).toBe("spice");
    expect(storageZoneFor({ name: "Groundnuts", dimension: "MASS" })).toBe("general");
  });

  it("covers all 13 departments, in the tour and with text for every status", () => {
    expect(DEPARTMENT_IDS).toHaveLength(13);
    expect(new Set(DEPARTMENTS.map((d) => d.id))).toEqual(new Set(DEPARTMENT_IDS));
    expect(new Set(TOUR_ORDER)).toEqual(new Set(DEPARTMENT_IDS));
    for (const s of ["ok", "warning", "critical", "idle"] as const) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(STATUS_GLYPH[s]).toBeTruthy();
    }
  });
});

describe("authorization matrix", () => {
  const writes: Permission[] = ["orders:approve", "invoices:create", "invoices:cancel", "dispatch:create", "payments:create", "purchases:create", "inventory:adjust", "bom:manage", "production:manage", "expenses:manage", "customers:manage", "products:manage"];

  it("keeps the accountant read-only", () => {
    for (const p of writes) expect(hasPermission("ACCOUNTANT", p)).toBe(false);
    expect(hasPermission("ACCOUNTANT", "reports:export")).toBe(true);
    expect(hasPermission("ACCOUNTANT", "audit:view")).toBe(true);
  });

  it("restricts the salesman to ordering and viewing their own work", () => {
    expect(hasPermission("SALESMAN", "orders:create")).toBe(true);
    expect(hasPermission("SALESMAN", "orders:view-own")).toBe(true);
    expect(hasPermission("SALESMAN", "orders:view-all")).toBe(false);
    expect(hasPermission("SALESMAN", "factory:view")).toBe(false);
    for (const p of writes) expect(hasPermission("SALESMAN", p)).toBe(false);
  });

  it("gives production the factory floor but not sales or money", () => {
    expect(hasPermission("PRODUCTION_SUPERVISOR", "production:manage")).toBe(true);
    expect(hasPermission("PRODUCTION_SUPERVISOR", "bom:manage")).toBe(true);
    expect(hasPermission("PRODUCTION_SUPERVISOR", "purchases:create")).toBe(true);
    expect(hasPermission("PRODUCTION_SUPERVISOR", "invoices:create")).toBe(false);
    expect(hasPermission("PRODUCTION_SUPERVISOR", "payments:create")).toBe(false);
  });

  it("lets the admin run sales and the owner see everything without posting", () => {
    for (const p of ["orders:approve", "invoices:create", "dispatch:create", "payments:create"] as Permission[]) expect(hasPermission("ADMIN", p)).toBe(true);
    expect(hasPermission("OWNER", "dashboard:owner")).toBe(true);
    expect(hasPermission("OWNER", "factory:view")).toBe(true);
    expect(hasPermission("OWNER", "payments:create")).toBe(false);
  });

  it("only shows navigation the role can open", () => {
    const pagePermission: Record<string, Permission[]> = {
      "/factory": ["factory:view"],
      "/costing": ["production:view"],
      "/purchase-orders": ["purchases:view"],
      "/payments": ["payments:view"],
      "/audit": ["audit:view"],
    };
    for (const role of ROLES) {
      for (const item of NAV[role].flatMap((s) => s.items)) {
        const needed = pagePermission[item.href];
        if (needed) expect(needed.some((p) => hasPermission(role, p)), `${role} → ${item.href}`).toBe(true);
      }
    }
  });
});
