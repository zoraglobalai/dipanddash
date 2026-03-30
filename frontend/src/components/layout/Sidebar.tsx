import { Box, Button, VStack, Text, Flex, Tooltip, HStack } from "@chakra-ui/react";
import { useEffect, useState, type ReactNode } from "react";
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { NavLink, useLocation } from "react-router-dom";

import type { NavItem } from "@/constants/nav";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppLogo } from "./AppLogo";

type SidebarProps = {
  navItems: NavItem[];
  onLogout: () => void;
  isMobile?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  roleLabel?: string;
};

const SIDEBAR_EXPANDED_WIDTH = "280px";
const SIDEBAR_COLLAPSED_WIDTH = "94px";

export const Sidebar = ({
  navItems,
  onLogout,
  isMobile,
  isCollapsed = false,
  onToggleCollapse,
  roleLabel = "Admin"
}: SidebarProps) => {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const compactMode = Boolean(!isMobile && isCollapsed);
  const sidebarWidth = isMobile
    ? "100%"
    : compactMode
      ? SIDEBAR_COLLAPSED_WIDTH
      : SIDEBAR_EXPANDED_WIDTH;

  const isItemActive = (item: NavItem): boolean => {
    const isCurrent =
      !item.isLogout &&
      Boolean(item.path) &&
      (location.pathname === item.path ||
        (item.path === "/dashboard" && location.pathname.startsWith("/dashboard")));

    if (isCurrent) {
      return true;
    }

    if (!item.children?.length) {
      return false;
    }

    return item.children.some((child) => isItemActive(child));
  };

  useEffect(() => {
    const activeGroupKeys: string[] = [];

    const collectActiveGroupKeys = (items: NavItem[], keyPrefix = "nav") => {
      items.forEach((item) => {
        const itemKey = `${keyPrefix}-${item.label}-${item.path ?? "group"}`;
        if (item.children?.length) {
          if (isItemActive(item)) {
            activeGroupKeys.push(itemKey);
          }
          collectActiveGroupKeys(item.children, itemKey);
        }
      });
    };

    collectActiveGroupKeys(navItems);

    if (!activeGroupKeys.length) {
      return;
    }

    setExpandedGroups((previous) => {
      let changed = false;
      const next = { ...previous };

      activeGroupKeys.forEach((key) => {
        if (!next[key]) {
          next[key] = true;
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [location.pathname, navItems]);

  const buildButtonNode = (item: NavItem, depth: number, key: string): ReactNode => {
    const isActive = isItemActive(item);
    const ItemIcon = item.icon;
    const isLogoutItem = Boolean(item.isLogout);
    const leftPad = compactMode ? 2 : Math.max(3, 3 + depth * 1.5);

    const baseStyles = {
      justifyContent: compactMode ? "center" : "flex-start",
      borderRadius: "14px",
      py: 5.5,
      px: compactMode ? 2 : leftPad,
      minH: "48px",
      fontWeight: 700,
      color: isLogoutItem ? (compactMode ? "#8E0909" : "#6E2C25") : isActive ? "white" : "#452E27",
      bg: isLogoutItem
        ? "transparent"
        : isActive
          ? "linear-gradient(92deg, #8E0909 0%, #B42626 44%, #D1A13D 100%)"
          : "transparent",
      _hover: {
        bg: isLogoutItem
          ? "rgba(193, 14, 14, 0.08)"
          : isActive
            ? "linear-gradient(92deg, #7A0707 0%, #A31F1F 44%, #BB8E35 100%)"
            : "rgba(193, 14, 14, 0.08)",
        color: isLogoutItem ? "#8E0909" : undefined
      }
    };

    const content = (
      <Flex align="center" gap={compactMode ? 0 : 3}>
        <Box
          minW="30px"
          h="30px"
          borderRadius="9px"
          display="grid"
          placeItems="center"
          bg={
            isLogoutItem
              ? "rgba(193, 14, 14, 0.08)"
              : isActive
                ? "rgba(255, 255, 255, 0.22)"
                : "rgba(193, 14, 14, 0.09)"
          }
          color={isActive ? "white" : isLogoutItem ? "#8E0909" : "#7A2620"}
        >
          <ItemIcon size={18} />
        </Box>
        {!compactMode ? <Text>{item.label}</Text> : null}
      </Flex>
    );

    let node: ReactNode = null;

    if (isLogoutItem) {
      node = (
        <Button key={key} variant="ghost" onClick={onLogout} {...baseStyles}>
          {content}
        </Button>
      );
    } else if (item.path) {
      node = (
        <Button key={key} as={NavLink} to={item.path} variant="ghost" {...baseStyles}>
          {content}
        </Button>
      );
    }

    if (!node) {
      return null;
    }

    if (compactMode) {
      return (
        <Tooltip key={key} label={item.label} placement="right" hasArrow openDelay={180}>
          {node}
        </Tooltip>
      );
    }

    return node;
  };

  const renderNavItem = (item: NavItem, depth = 0, keyPrefix = "nav"): ReactNode => {
    const itemKey = `${keyPrefix}-${item.label}-${item.path ?? "group"}`;

    if (item.children?.length) {
      const isGroupActive = isItemActive(item);
      const GroupIcon = item.icon;
      const isExpanded = expandedGroups[itemKey] ?? isGroupActive;

      const toggleGroup = () => {
        setExpandedGroups((previous) => ({
          ...previous,
          [itemKey]: !(previous[itemKey] ?? isGroupActive)
        }));
      };

      if (compactMode) {
        const groupButton = (
          <Button
            key={itemKey}
            variant="ghost"
            onClick={toggleGroup}
            justifyContent="center"
            borderRadius="14px"
            py={5.5}
            px={2}
            minH="48px"
            fontWeight={700}
            color={isGroupActive || isExpanded ? "#7A2620" : "#452E27"}
            bg={isGroupActive || isExpanded ? "rgba(193, 14, 14, 0.1)" : "transparent"}
            _hover={{ bg: "rgba(193, 14, 14, 0.08)" }}
          >
            <Box
              minW="30px"
              h="30px"
              borderRadius="9px"
              display="grid"
              placeItems="center"
              bg={isGroupActive || isExpanded ? "rgba(193, 14, 14, 0.16)" : "rgba(193, 14, 14, 0.09)"}
              color="#7A2620"
            >
              <GroupIcon size={18} />
            </Box>
          </Button>
        );

        return (
          <VStack key={itemKey} align="stretch" spacing={1}>
            <Tooltip label={item.label} placement="right" hasArrow openDelay={180}>
              {groupButton}
            </Tooltip>
            {isExpanded ? item.children.map((child) => renderNavItem(child, depth + 1, itemKey)) : null}
          </VStack>
        );
      }

      return (
        <VStack key={itemKey} align="stretch" spacing={1}>
          <Button
            variant="ghost"
            onClick={toggleGroup}
            justifyContent="space-between"
            borderRadius="14px"
            px={3}
            py={5.5}
            minH="48px"
            color={isGroupActive || isExpanded ? "#7A2620" : "#5C3E33"}
            fontWeight={800}
            bg={isGroupActive || isExpanded ? "rgba(193, 14, 14, 0.08)" : "transparent"}
            _hover={{ bg: "rgba(193, 14, 14, 0.08)" }}
          >
            <Flex align="center" gap={3}>
              <Box
                minW="30px"
                h="30px"
                borderRadius="9px"
                display="grid"
                placeItems="center"
                bg={isGroupActive || isExpanded ? "rgba(193, 14, 14, 0.12)" : "rgba(193, 14, 14, 0.08)"}
                color="#7A2620"
              >
                <GroupIcon size={18} />
              </Box>
              <Text>{item.label}</Text>
            </Flex>
            <Box color="#7A2620">{isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}</Box>
          </Button>
          {isExpanded ? (
            <VStack align="stretch" spacing={1} pl={2}>
              {item.children.map((child) => renderNavItem(child, depth + 1, itemKey))}
            </VStack>
          ) : null}
        </VStack>
      );
    }

    return buildButtonNode(item, depth, itemKey);
  };

  return (
    <Box
      bg="linear-gradient(180deg, #FFFDF7 0%, #FFF8ED 100%)"
      borderRight={isMobile ? "none" : "1px solid"}
      borderColor="rgba(145, 87, 61, 0.15)"
      w={sidebarWidth}
      minW={sidebarWidth}
      h={isMobile ? "auto" : "100vh"}
      position={isMobile ? "relative" : "sticky"}
      top={isMobile ? "auto" : 0}
      p={compactMode ? 3 : 5}
      pr={compactMode ? 2.5 : 4}
      overflowY="auto"
      overflowX="hidden"
      transition="all 0.24s ease"
      display="flex"
      flexDirection="column"
      boxShadow={isMobile ? "none" : "4px 0 26px rgba(56, 21, 8, 0.05)"}
    >
      {!isMobile ? (
        compactMode ? (
          <>
            <AppLogo hideText roleLabel={roleLabel} />
            <HStack mt={1} mb={1} justify="center">
              <ActionIconButton
                aria-label="Expand sidebar"
                icon={<FiChevronRight size={18} />}
                onClick={onToggleCollapse}
                size="sm"
                variant="outline"
                borderColor="rgba(142, 9, 9, 0.22)"
                color="#7A2620"
                bg="rgba(255,255,255,0.9)"
                _hover={{ bg: "rgba(193, 14, 14, 0.08)" }}
              />
            </HStack>
          </>
        ) : (
          <HStack justify="space-between" align="center" mb={2}>
            <AppLogo roleLabel={roleLabel} />
              <ActionIconButton
                aria-label="Collapse sidebar"
                icon={<FiChevronLeft size={18} />}
                onClick={onToggleCollapse}
              size="sm"
              variant="outline"
              borderColor="rgba(142, 9, 9, 0.22)"
              color="#7A2620"
              bg="rgba(255,255,255,0.9)"
              _hover={{ bg: "rgba(193, 14, 14, 0.08)" }}
            />
          </HStack>
        )
      ) : (
        <AppLogo roleLabel={roleLabel} />
      )}
      <VStack mt={compactMode ? 2 : 4} spacing={2} align="stretch" flex={1}>
        {navItems.map((item) => renderNavItem(item))}
      </VStack>
    </Box>
  );
};
