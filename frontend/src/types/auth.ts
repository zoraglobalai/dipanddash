import { UserRole } from "./role";

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  isSuperAdmin: boolean;
  isActive: boolean;
  assignedReports: string[];
  assignedModules: string[];
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};
