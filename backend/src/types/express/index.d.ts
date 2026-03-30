import { UserRole } from "../../constants/roles";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      username: string;
      fullName: string;
      role: UserRole;
      assignedReports: string[];
      assignedModules: string[];
    };
  }
}

export {};
