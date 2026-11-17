import {
  Activity, BadgeCheck, BarChart3, Bell, Boxes, ClipboardList, Factory, FileBarChart, Flame, Gauge, History, Home,
  IndianRupee, LayoutDashboard, ListTree, Package, PlusCircle, Receipt, ScrollText, Settings, ShoppingCart, TrendingUp,
  Truck, Users, Wallet, Warehouse, Landmark, type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, analytics: BarChart3, inventory: Boxes, production: Factory, finance: IndianRupee,
  alerts: Bell, orders: ClipboardList, invoices: Receipt, receipt: Receipt, reports: FileBarChart, benchmark: BadgeCheck,
  audit: ScrollText, settings: Settings, customers: Users, products: Package, suppliers: Warehouse, purchases: ShoppingCart,
  dispatch: Truck, payments: Wallet, expenses: Flame, home: Home, new: PlusCircle, summary: TrendingUp, bom: ListTree,
  history: History, consumption: Gauge, variance: Activity, gst: Landmark,
};
