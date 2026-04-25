import { UserRole } from "../../constants/roles";
import { AppError } from "../../errors/app-error";
import { hashPassword } from "../../utils/password";
import { UserService } from "../users/user.service";
import { REPORT_KEYS, type ReportKey } from "../reports/reports.constants";
import { STAFF_ASSIGNABLE_MODULE_KEYS, type StaffAssignableModuleKey } from "../users/user-access.constants";

export class StaffService {
  private readonly userService = new UserService();

  private isPosDesktopRole(role: UserRole) {
    return role === UserRole.STAFF || role === UserRole.SNOOKER_STAFF;
  }

  private sanitizeAssignedReports(assignedReports?: string[]): ReportKey[] {
    if (!assignedReports?.length) {
      return [];
    }

    const allowed = new Set(REPORT_KEYS);
    const unique = new Set<ReportKey>();
    assignedReports.forEach((key) => {
      if (allowed.has(key as ReportKey)) {
        unique.add(key as ReportKey);
      }
    });
    return [...unique];
  }

  private sanitizeAssignedModules(assignedModules?: string[]): StaffAssignableModuleKey[] {
    if (!assignedModules?.length) {
      return [];
    }

    const allowed = new Set(STAFF_ASSIGNABLE_MODULE_KEYS);
    const unique = new Set<StaffAssignableModuleKey>();
    assignedModules.forEach((key) => {
      if (allowed.has(key as StaffAssignableModuleKey)) {
        unique.add(key as StaffAssignableModuleKey);
      }
    });
    return [...unique];
  }

  async listStaff(search?: string) {
    const users = await this.userService.listStaff(search);
    return users.map((user) => ({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      assignedReports: user.assignedReports ?? [],
      assignedModules: user.assignedModules ?? [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
  }

  async createStaff(payload: {
    username: string;
    fullName: string;
    password: string;
    email?: string;
    role: UserRole;
    assignedReports?: string[];
    assignedModules?: string[];
  }) {
    const passwordHash = await hashPassword(payload.password);
    const isPosDesktopUser = this.isPosDesktopRole(payload.role);
    const assignedReports = isPosDesktopUser ? [] : this.sanitizeAssignedReports(payload.assignedReports);
    const assignedModules = isPosDesktopUser ? [] : this.sanitizeAssignedModules(payload.assignedModules);

    if (payload.role === UserRole.ADMIN && assignedModules.length === 0) {
      throw new AppError(422, "At least one admin frontend module access must be selected.");
    }

    return this.userService.createStaff({
      username: payload.username.toLowerCase(),
      fullName: payload.fullName,
      email: payload.email ? payload.email.toLowerCase() : null,
      passwordHash,
      role: payload.role,
      isActive: true,
      assignedReports,
      assignedModules
    });
  }

  async updateStaff(
    id: string,
    payload: {
      fullName?: string;
      email?: string;
      role?: UserRole;
      assignedReports?: string[];
      assignedModules?: string[];
    }
  ) {
    const isPosDesktopUser = payload.role ? this.isPosDesktopRole(payload.role) : false;
    const assignedReports =
      payload.assignedReports === undefined
        ? undefined
        : isPosDesktopUser
          ? []
          : this.sanitizeAssignedReports(payload.assignedReports);
    const assignedModules =
      payload.assignedModules === undefined
        ? undefined
        : isPosDesktopUser
          ? []
          : this.sanitizeAssignedModules(payload.assignedModules);

    if (payload.role === UserRole.ADMIN && assignedModules !== undefined && assignedModules.length === 0) {
      throw new AppError(422, "At least one admin frontend module access must be selected.");
    }

    return this.userService.updateStaff(id, {
      fullName: payload.fullName,
      email: payload.email ? payload.email.toLowerCase() : payload.email,
      role: payload.role,
      assignedReports,
      assignedModules
    });
  }

  async updateStatus(id: string, isActive: boolean) {
    return this.userService.updateStaffStatus(id, isActive);
  }

  async resetPassword(id: string, password: string) {
    const passwordHash = await hashPassword(password);
    return this.userService.resetStaffPassword(id, passwordHash);
  }

  async deleteStaff(id: string, options?: { permanent?: boolean }) {
    return this.userService.deleteStaff(id, options);
  }
}
