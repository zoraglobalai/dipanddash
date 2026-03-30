import { UserRole } from "./role";

export type Staff = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  assignedReports: string[];
  assignedModules: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateStaffPayload = {
  username: string;
  fullName: string;
  email?: string;
  password: string;
  role: UserRole;
  assignedReports?: string[];
  assignedModules?: string[];
};

export type UpdateStaffPayload = {
  fullName?: string;
  email?: string;
  role?: UserRole;
  assignedReports?: string[];
  assignedModules?: string[];
};
