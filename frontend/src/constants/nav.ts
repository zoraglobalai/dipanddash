import type { IconType } from "react-icons";
import {
  FiBarChart2,
  FiBox,
  FiClipboard,
  FiCoffee,
  FiDollarSign,
  FiFileText,
  FiGift,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiMapPin,
  FiPackage,
  FiPieChart,
  FiShield,
  FiShoppingBag,
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
  {
    label: "Dip & Dash",
    icon: FiCoffee,
    children: [
      { label: "Dashboard", path: "/dashboard/admin?business=dip_and_dash", icon: FiGrid, moduleKey: "dashboard" },
      { label: "Sales Statics", path: "/sales-statics?business=dip_and_dash", icon: FiBarChart2, roles: [UserRole.ADMIN], moduleKey: "sales-statics" },
      { label: "Orders", path: "/orders?business=dip_and_dash", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "orders" },
      { label: "Reports", path: "/reports?business=dip_and_dash", icon: FiPieChart, roles: [UserRole.ADMIN], moduleKey: "reports" },
      { label: "Invoices", path: "/invoices?business=dip_and_dash", icon: FiFileText, roles: [UserRole.ADMIN], moduleKey: "invoices" },
      { label: "Dump Wastage", path: "/dump-wastage?business=dip_and_dash", icon: FiTrash2, roles: [UserRole.ADMIN], moduleKey: "dump-wastage" },
      { label: "Cash Audit", path: "/cash-audit?business=dip_and_dash", icon: FiDollarSign, roles: [UserRole.ADMIN], moduleKey: "cash-audit" },
      { label: "Stock Audit", path: "/stock-audit?business=dip_and_dash", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "stock-audit" },
      { label: "Suppliers", path: "/suppliers?business=dip_and_dash", icon: FiTruck, roles: [UserRole.ADMIN], moduleKey: "suppliers" },
      { label: "Purchase", path: "/purchase?business=dip_and_dash", icon: FiFileText, roles: [UserRole.ADMIN], moduleKey: "purchase" },
      { label: "Ingredient Entry", path: "/ingredient-entry?business=dip_and_dash", icon: FiLayers, roles: [UserRole.ADMIN], moduleKey: "ingredient-entry" },
      { label: "Additional Entry", path: "/additional-entry?business=dip_and_dash", icon: FiBox, roles: [UserRole.ADMIN], moduleKey: "additional-entry" },
      { label: "Items Entry", path: "/items-entry?business=dip_and_dash", icon: FiTag, roles: [UserRole.ADMIN], moduleKey: "items-entry" },
      { label: "Offers", path: "/offers?business=dip_and_dash", icon: FiGift, roles: [UserRole.ADMIN], moduleKey: "offers" },
      { label: "Customer Data", path: "/customer-data?business=dip_and_dash", icon: FiUsers, roles: [UserRole.ADMIN], moduleKey: "customer-data" },
      { label: "Pending", path: "/pending?business=dip_and_dash", icon: FiDollarSign, roles: [UserRole.ADMIN], moduleKey: "pending" },
      { label: "Assets", path: "/assets-entry?business=dip_and_dash", icon: FiShield, roles: [UserRole.ADMIN], moduleKey: "assets-entry" },
      { label: "Outlets", path: "/outlets?business=dip_and_dash", icon: FiMapPin, roles: [UserRole.ADMIN], moduleKey: "outlets" },
      { label: "Attendance", path: "/attendance?business=dip_and_dash", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "attendance" }
    ]
  },
  {
    label: "Snooker",
    icon: RiGamepadLine,
    children: [
      { label: "Dashboard", path: "/dashboard/admin?business=snooker", icon: FiGrid, moduleKey: "dashboard" },
      { label: "Sales Statics", path: "/sales-statics?business=snooker", icon: FiBarChart2, roles: [UserRole.ADMIN], moduleKey: "sales-statics" },
      { label: "Gaming", path: "/gaming?business=snooker", icon: RiGamepadLine, roles: [UserRole.ADMIN], moduleKey: "gaming" },
      { label: "Reports", path: "/reports?business=snooker", icon: FiPieChart, roles: [UserRole.ADMIN], moduleKey: "reports" },
      { label: "Products", path: "/purchase-products?business=snooker", icon: FiPackage, roles: [UserRole.ADMIN], moduleKey: "purchase" },
      { label: "Consumption", path: "/products-consumption?business=snooker", icon: FiShoppingBag, roles: [UserRole.ADMIN], moduleKey: "gaming" },
      { label: "Cash Audit", path: "/cash-audit?business=snooker", icon: FiDollarSign, roles: [UserRole.ADMIN], moduleKey: "cash-audit" },
      { label: "Stock Audit", path: "/stock-audit?business=snooker", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "stock-audit" },
      { label: "Suppliers", path: "/suppliers?business=snooker", icon: FiTruck, roles: [UserRole.ADMIN], moduleKey: "suppliers" },
      { label: "Purchase", path: "/purchase?business=snooker", icon: FiFileText, roles: [UserRole.ADMIN], moduleKey: "purchase" },
      { label: "Offers", path: "/offers?business=snooker", icon: FiGift, roles: [UserRole.ADMIN], moduleKey: "offers" },
      { label: "Customer Data", path: "/customer-data?business=snooker", icon: FiUsers, roles: [UserRole.ADMIN], moduleKey: "customer-data" },
      { label: "Pending", path: "/pending?business=snooker", icon: FiDollarSign, roles: [UserRole.ADMIN], moduleKey: "pending" },
      { label: "Assets", path: "/assets-entry?business=snooker", icon: FiShield, roles: [UserRole.ADMIN], moduleKey: "assets-entry" },
      { label: "Attendance", path: "/attendance?business=snooker", icon: FiClipboard, roles: [UserRole.ADMIN], moduleKey: "attendance" }
    ]
  },
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
