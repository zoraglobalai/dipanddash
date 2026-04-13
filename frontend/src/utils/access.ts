import { ADMIN_MODULE_KEYS, ADMIN_MODULE_ROUTE_MAP, type AdminModuleKey } from "@/constants/modules";
import { APP_ROUTES } from "@/constants/routes";
import { UserRole } from "@/types/role";
import type { AuthUser } from "@/types/auth";

export const isSuperAdmin = (user?: AuthUser | null) =>
  Boolean(user?.role === UserRole.ADMIN && user.isSuperAdmin);

export const isScopedAdmin = (user?: AuthUser | null) =>
  Boolean(user?.role === UserRole.ADMIN && (user.assignedModules?.length ?? 0) > 0);

export const hasAdminModuleAccess = (user: AuthUser | null | undefined, moduleKey: AdminModuleKey) => {
  if (!user || user.role !== UserRole.ADMIN) {
    return false;
  }

  if (moduleKey === "dashboard") {
    return isSuperAdmin(user);
  }

  if (!isScopedAdmin(user)) {
    return true;
  }

  return user.assignedModules.includes(moduleKey);
};

export const hasAnyAdminModuleAccess = (
  user: AuthUser | null | undefined,
  moduleKeys: readonly AdminModuleKey[]
) => moduleKeys.some((moduleKey) => hasAdminModuleAccess(user, moduleKey));

export const getFirstAccessibleAdminRoute = (user: AuthUser | null | undefined) => {
  if (!user || user.role !== UserRole.ADMIN) {
    return APP_ROUTES.LOGIN;
  }

  if (isSuperAdmin(user)) {
    return APP_ROUTES.ADMIN_DASHBOARD;
  }

  const firstAccessibleModule = ADMIN_MODULE_KEYS.find(
    (moduleKey) => moduleKey !== "dashboard" && hasAdminModuleAccess(user, moduleKey)
  );
  if (!firstAccessibleModule) {
    return APP_ROUTES.PROFILE;
  }

  return ADMIN_MODULE_ROUTE_MAP[firstAccessibleModule];
};
