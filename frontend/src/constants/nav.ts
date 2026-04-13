import type { IconType } from "react-icons";
import {
  FiBarChart2,
  FiClipboard,
  FiDollarSign,
  FiFileText,
  FiGift,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiMapPin,
  FiPieChart,
  FiShield,
  FiTag,
  FiTrash2,
  FiTruck,
  FiUser,
  FiUserCheck,
  FiUsers
} from "react-icons/fi";
import { RiGamepadLine } from "react-icons/ri";

import type { AdminModuleKey } from "@/constants/modules";
import { UserRole } from "@/types/role";

export type NavItem = {
  label: string;
  path?: string;
  icon: IconType;
  roles?: UserRole[];
  moduleKey?: AdminModuleKey;
  isLogout?: boolean;
  children?: NavItem[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: FiGrid, moduleKey: "dashboard" },
  { label: "Sales Statics", path: "/sales-statics", icon: FiBarChart2, roles: [UserRole.ADMIN], moduleKey: "sales-statics" },
  { label: "Orders", path: "/orders", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "orders" },
  { label: "Invoices", path: "/invoices", icon: FiFileText, roles: [UserRole.ADMIN], moduleKey: "invoices" },
  { label: "Dump Wastage", path: "/dump-wastage", icon: FiTrash2, roles: [UserRole.ADMIN], moduleKey: "dump-wastage" },
  { label: "Cash Audit", path: "/cash-audit", icon: FiDollarSign, roles: [UserRole.ADMIN], moduleKey: "cash-audit" },
  { label: "Stock Audit", path: "/stock-audit", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "stock-audit" },
  { label: "Reports", path: "/reports", icon: FiPieChart, roles: [UserRole.ADMIN], moduleKey: "reports" },
  { label: "Gaming", path: "/gaming", icon: RiGamepadLine, roles: [UserRole.ADMIN], moduleKey: "gaming" },
  { label: "Suppliers", path: "/suppliers", icon: FiTruck, roles: [UserRole.ADMIN], moduleKey: "suppliers" },
  { label: "Purchase", path: "/purchase", icon: FiFileText, roles: [UserRole.ADMIN], moduleKey: "purchase" },
  { label: "Ingredient Entry", path: "/ingredient-entry", icon: FiLayers, roles: [UserRole.ADMIN], moduleKey: "ingredient-entry" },
  { label: "Items Entry", path: "/items-entry", icon: FiTag, roles: [UserRole.ADMIN], moduleKey: "items-entry" },
  { label: "Offers", path: "/offers", icon: FiGift, roles: [UserRole.ADMIN], moduleKey: "offers" },
  { label: "Customer Data", path: "/customer-data", icon: FiUsers, roles: [UserRole.ADMIN], moduleKey: "customer-data" },
  { label: "Assets Entry", path: "/assets-entry", icon: FiShield, roles: [UserRole.ADMIN], moduleKey: "assets-entry" },
  { label: "Outlets", path: "/outlets", icon: FiMapPin, roles: [UserRole.ADMIN], moduleKey: "outlets" },
  { label: "Attendance", path: "/attendance", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "attendance" },
  {
    label: "Staff Management",
    path: "/staff-management",
    icon: FiUserCheck,
    roles: [UserRole.ADMIN],
    moduleKey: "staff-management"
  },
  { label: "Profile", path: "/profile", icon: FiUser },
  { label: "Logout", path: "/logout", icon: FiLogOut, isLogout: true }
];
