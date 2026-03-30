import { UserRole } from "@/types/role";

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.MANAGER]: "Manager",
  [UserRole.ACCOUNTANT]: "Accountant",
  [UserRole.STAFF]: "Staff",
  [UserRole.SNOOKER_STAFF]: "Snooker Staff"
};

