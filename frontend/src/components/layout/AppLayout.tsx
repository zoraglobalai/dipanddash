import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  useDisclosure
} from "@chakra-ui/react";
import { Outlet } from "react-router-dom";
import { useCallback, useMemo, useState } from "react";

import { getNavItemsByRole } from "@/utils/nav";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AppLogo } from "./AppLogo";

const SIDEBAR_EXPANDED_WIDTH = "280px";
const SIDEBAR_COLLAPSED_WIDTH = "94px";
const toRoleLabel = (role: string) =>
  role
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export const AppLayout = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const navItems = useMemo(() => getNavItemsByRole(user?.role), [user?.role]);
  const sidebarWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const toggleSidebar = useCallback(() => setIsSidebarCollapsed((previous) => !previous), []);

  if (!user) {
    return null;
  }

  const roleLabel = toRoleLabel(user.role);

  return (
    <Box
      minH="100vh"
      bg="radial-gradient(circle at top right, #FFF3DE 0%, #FFF8F0 24%, #FFFDF9 54%, #FFFFFF 100%)"
    >
      <Box
        display={{ base: "none", lg: "block" }}
        position="fixed"
        left={0}
        top={0}
        w={sidebarWidth}
        transition="width 0.24s ease"
        zIndex={25}
      >
        <Sidebar
          navItems={navItems}
          onLogout={() => void logout()}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          roleLabel={roleLabel}
        />
      </Box>

      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent maxW="280px" bg="#FFFDF8">
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px" borderColor="rgba(120, 73, 53, 0.18)">
            <AppLogo compact />
          </DrawerHeader>
          <DrawerBody p={0}>
            <Sidebar navItems={navItems} onLogout={() => void logout()} isMobile roleLabel={roleLabel} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Box ml={{ base: 0, lg: sidebarWidth }} transition="margin-left 0.24s ease">
        <Topbar
          user={user}
          roleLabel={roleLabel}
          onOpenMobileNav={onOpen}
          onLogout={() => void logout()}
        />
        <Box px={{ base: 4, md: 6, xl: 8 }} py={{ base: 4, md: 6 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};
