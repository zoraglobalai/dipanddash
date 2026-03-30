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

import { UserRole } from "@/types/role";

export type NavItem = {
  label: string;
  path?: string;
  icon: IconType;
  roles?: UserRole[];
  isLogout?: boolean;
  children?: NavItem[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: FiGrid },
  { label: "Sales Statics", path: "/sales-statics", icon: FiBarChart2, roles: [UserRole.ADMIN] },
  { label: "Orders", path: "/orders", icon: FiClipboard, roles: [UserRole.ADMIN] },
  { label: "Invoices", path: "/invoices", icon: FiFileText, roles: [UserRole.ADMIN] },
  { label: "Dump Wastage", path: "/dump-wastage", icon: FiTrash2, roles: [UserRole.ADMIN] },
  { label: "Cash Audit", path: "/cash-audit", icon: FiDollarSign, roles: [UserRole.ADMIN] },
  { label: "Stock Audit", path: "/stock-audit", icon: FiClipboard, roles: [UserRole.ADMIN] },
  { label: "Reports", path: "/reports", icon: FiPieChart, roles: [UserRole.ADMIN] },
  { label: "Gaming", path: "/gaming", icon: RiGamepadLine, roles: [UserRole.ADMIN] },
  { label: "Suppliers", path: "/suppliers", icon: FiTruck, roles: [UserRole.ADMIN] },
  { label: "Purchase", path: "/purchase", icon: FiFileText, roles: [UserRole.ADMIN] },
  { label: "Ingredient Entry", path: "/ingredient-entry", icon: FiLayers, roles: [UserRole.ADMIN] },
  { label: "Items Entry", path: "/items-entry", icon: FiTag, roles: [UserRole.ADMIN] },
  { label: "Offers", path: "/offers", icon: FiGift, roles: [UserRole.ADMIN] },
  { label: "Customer Data", path: "/customer-data", icon: FiUsers, roles: [UserRole.ADMIN] },
  { label: "Assets Entry", path: "/assets-entry", icon: FiShield, roles: [UserRole.ADMIN] },
  { label: "Outlets", path: "/outlets", icon: FiMapPin, roles: [UserRole.ADMIN] },
  { label: "Attendance", path: "/attendance", icon: FiClipboard, roles: [UserRole.ADMIN] },
  {
    label: "Staff Management",
    path: "/staff-management",
    icon: FiUserCheck,
    roles: [UserRole.ADMIN]
  },
  { label: "Profile", path: "/profile", icon: FiUser },
  { label: "Logout", path: "/logout", icon: FiLogOut, isLogout: true }
];
