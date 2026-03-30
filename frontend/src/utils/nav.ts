import { NAV_ITEMS } from "@/constants/nav";
import { UserRole } from "@/types/role";

const filterNavByRole = (items: typeof NAV_ITEMS, role: UserRole) =>
  items.reduce<typeof NAV_ITEMS>((accumulator, item) => {
    const hasRoleAccess = !item.roles || item.roles.includes(role);

    if (item.children?.length) {
      const filteredChildren = filterNavByRole(item.children, role);
      if (hasRoleAccess || filteredChildren.length) {
        accumulator.push({
          ...item,
          children: filteredChildren
        });
      }
      return accumulator;
    }

    if (hasRoleAccess) {
      accumulator.push(item);
    }

    return accumulator;
  }, []);

export const getNavItemsByRole = (role?: UserRole) => {
  if (!role) {
    return [];
  }

  return filterNavByRole(NAV_ITEMS, role);
};
