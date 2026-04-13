import { NAV_ITEMS } from "@/constants/nav";
import type { AuthUser } from "@/types/auth";
import { UserRole } from "@/types/role";
import { hasAdminModuleAccess } from "@/utils/access";

const filterNavByRoleAndModule = (items: typeof NAV_ITEMS, user: AuthUser) =>
  items.reduce<typeof NAV_ITEMS>((accumulator, item) => {
    const hasRoleAccess = !item.roles || item.roles.includes(user.role as UserRole);
    const hasModulePermission = !item.moduleKey || hasAdminModuleAccess(user, item.moduleKey);

    if (item.children?.length) {
      const filteredChildren = filterNavByRoleAndModule(item.children, user);
      if ((hasRoleAccess && hasModulePermission) || filteredChildren.length) {
        accumulator.push({
          ...item,
          children: filteredChildren
        });
      }
      return accumulator;
    }

    if (hasRoleAccess && hasModulePermission) {
      accumulator.push(item);
    }

    return accumulator;
  }, []);

export const getNavItemsByRole = (user?: AuthUser | null) => {
  if (!user) {
    return [];
  }

  return filterNavByRoleAndModule(NAV_ITEMS, user);
};
