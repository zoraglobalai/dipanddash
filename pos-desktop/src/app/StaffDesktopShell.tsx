import {
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
  useMediaQuery,
  useToast
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import {
  FiBarChart2,
  FiCheckCircle,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiClock,
  FiCoffee,
  FiFileText,
  FiGrid,
  FiHome,
  FiDollarSign,
  FiLogOut,
  FiPackage,
  FiPlusSquare,
  FiRepeat,
  FiShoppingBag,
  FiTrash2,
  FiTruck,
  FiUser,
  FiUsers
} from "react-icons/fi";
import type { IconType } from "react-icons";

import logo from "@/assets/logo.png";
import { usePosAuth } from "@/app/PosAuthContext";
import { ActionIconButton } from "@/components/common/ActionIconButton";
import { NewOrderPage } from "@/app/NewOrderPage";
import { StaffAttendancePage } from "@/app/StaffAttendancePage";
import { StaffDashboardPage } from "@/app/StaffDashboardPage";
import { StaffKitchenPage } from "@/app/StaffKitchenPage";
import { StaffClosingPage } from "@/app/StaffClosingPage";
import { StaffOrdersPage } from "@/app/StaffOrdersPage";
import { StaffPlaceholderPage } from "@/app/StaffPlaceholderPage";
import { StaffTablesPage } from "@/app/StaffTablesPage";
import { StaffGamingBookingPage } from "@/app/StaffGamingBookingPage";
import { SnookerDashboardPage } from "@/app/SnookerDashboardPage";
import { StaffCashAuditPage } from "@/app/StaffCashAuditPage";
import { StaffReportsPage } from "@/app/StaffReportsPage";
import { StaffDumpPage } from "@/app/StaffDumpPage";
import { StaffOutletTransferPage } from "@/app/StaffOutletTransferPage";
import { StaffPurchasePage } from "@/app/StaffPurchasePage";
import { PosTopBar } from "@/components/layout/PosTopBar";
import { ShortcutHelpModal } from "@/components/pos/ShortcutHelpModal";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSyncEngine } from "@/hooks/useSyncEngine";

type StaffViewKey =
  | "dashboard"
  | "new-order/dine-in"
  | "new-order/take-away"
  | "new-order/swiggy"
  | "new-order/zomato"
  | "tables"
  | "kitchen"
  | "order"
  | "attendance"
  | "closing"
  | "cash-audit"
  | "dump"
  | "outlet-transfer"
  | "purchase"
  | "reports"
  | "profile"
  | "gaming-booking";

type StaffMenuItem = {
  key: StaffViewKey;
  label: string;
  icon: IconType;
};

const SIDEBAR_EXPANDED_WIDTH = "280px";
const SIDEBAR_COLLAPSED_WIDTH = "94px";

const NEW_ORDER_CHILDREN: StaffMenuItem[] = [
  { key: "new-order/dine-in", label: "Dine In", icon: FiHome },
  { key: "new-order/take-away", label: "Take Away", icon: FiShoppingBag },
  { key: "new-order/swiggy", label: "Swiggy", icon: FiPackage },
  { key: "new-order/zomato", label: "Zomato", icon: FiTruck }
];

type StaffMenuGroup = { group: "new-order"; label: string; icon: IconType };
type StaffMenuConfig = StaffMenuItem | StaffMenuGroup;

const MAIN_MENUS: StaffMenuConfig[] = [
  { key: "dashboard", label: "Dashboard", icon: FiGrid },
  { group: "new-order", label: "New Order", icon: FiPlusSquare },
  { key: "tables", label: "Tables", icon: FiUsers },
  { key: "kitchen", label: "Kitchen", icon: FiCoffee },
  { key: "order", label: "Order", icon: FiClipboard },
  { key: "attendance", label: "Attendance", icon: FiClock },
  { key: "closing", label: "Closing", icon: FiCheckCircle },
  { key: "cash-audit", label: "Cash Audit", icon: FiDollarSign },
  { key: "dump", label: "Dump", icon: FiTrash2 },
  { key: "outlet-transfer", label: "Outlet Transfer", icon: FiRepeat },
  { key: "purchase", label: "Purchase", icon: FiFileText },
  { key: "reports", label: "Reports", icon: FiBarChart2 },
  { key: "profile", label: "Profile", icon: FiUser }
];

const SNOOKER_STAFF_MENUS: StaffMenuConfig[] = [
  { key: "dashboard", label: "Dashboard", icon: FiGrid },
  { key: "order", label: "Order", icon: FiClipboard },
  { key: "attendance", label: "Attendance", icon: FiClock },
  { key: "gaming-booking", label: "New Booking", icon: FiPlusSquare },
  { key: "cash-audit", label: "Cash Audit", icon: FiDollarSign },
  { key: "outlet-transfer", label: "Outlet Transfer", icon: FiRepeat },
  { key: "purchase", label: "Purchase", icon: FiFileText }
];

const SNOOKER_ALLOWED_VIEWS = new Set<StaffViewKey>([
  "dashboard",
  "order",
  "attendance",
  "gaming-booking",
  "cash-audit",
  "outlet-transfer",
  "purchase"
]);

const PAGE_TITLES: Record<StaffViewKey, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Staff Dashboard",
    subtitle: "Quick insights for shift operations and order pace."
  },
  "new-order/dine-in": {
    title: "New Order - Dine In",
    subtitle: "Fast dine-in billing with offline-safe order queue."
  },
  "new-order/take-away": {
    title: "New Order - Take Away",
    subtitle: "Counter-ready takeaway billing optimized for speed."
  },
  "new-order/swiggy": {
    title: "New Order - Swiggy",
    subtitle: "Capture delivery marketplace orders with local reliability."
  },
  "new-order/zomato": {
    title: "New Order - Zomato",
    subtitle: "Queue and bill Zomato orders with sync-safe workflow."
  },
  tables: {
    title: "Tables",
    subtitle: ""
  },
  kitchen: {
    title: "Kitchen",
    subtitle: "Live kitchen queue with item, combo, add-on and free-item details."
  },
  order: {
    title: "Orders",
    subtitle: "View completed invoices and reprint bills quickly."
  },
  attendance: {
    title: "Attendance",
    subtitle: "Punch in/out and review day-wise shift history."
  },
  closing: {
    title: "Closing",
    subtitle: "Submit end-of-day stock closing and lock/unlock billing with carry-forward rules."
  },
  "cash-audit": {
    title: "Cash Audit",
    subtitle: "Submit denomination cash counts with admin-password confirmation."
  },
  dump: {
    title: "Dump / Wastage",
    subtitle: "Record ingredient/item/product wastage with stock-linked deduction."
  },
  "outlet-transfer": {
    title: "Outlet Transfer",
    subtitle: "Move stock between outlets with source and destination updates."
  },
  purchase: {
    title: "Purchase",
    subtitle: "Create and manage supplier purchases with line-wise stock updates."
  },
  reports: {
    title: "Reports",
    subtitle: "View assigned report templates with date filters and export."
  },
  profile: {
    title: "Profile",
    subtitle: "Staff account and active session details."
  },
  "gaming-booking": {
    title: "New Booking",
    subtitle: "Create and manage snooker/console sessions with offline-safe sync."
  }
};

export const StaffDesktopShell = () => {
  const toast = useToast();
  const { session, logout, isOfflineSession } = usePosAuth();
  const syncState = useSyncEngine();
  const isOnline = useNetworkStatus();
  const shortcutsModal = useDisclosure();
  const [isCompactViewport] = useMediaQuery("(max-width: 1360px)");
  const [isSmallDesktopViewport] = useMediaQuery("(max-width: 1440px)");
  const [isNarrowDesktopViewport] = useMediaQuery("(max-width: 1600px)");

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNewOrderExpanded, setIsNewOrderExpanded] = useState(true);
  const [activeView, setActiveView] = useState<StaffViewKey>(
    session?.role === "snooker_staff" ? "dashboard" : "new-order/take-away"
  );
  const isSnookerStaff = session?.role === "snooker_staff";
  const canAccessPurchase =
    session?.role === "admin" || (session?.assignedModules ?? []).includes("purchase");
  const isSidebarCollapsedResolved = isSidebarCollapsed;
  const expandedSidebarWidth = isSmallDesktopViewport
    ? "236px"
    : isNarrowDesktopViewport
      ? "252px"
      : SIDEBAR_EXPANDED_WIDTH;
  const shouldUseCompactTopBar = isCompactViewport || (!isSidebarCollapsedResolved && isNarrowDesktopViewport);

  useEffect(() => {
    if (isCompactViewport) {
      setIsSidebarCollapsed(true);
    }
  }, [isCompactViewport]);

  useEffect(() => {
    if (isSnookerStaff) {
      if (!SNOOKER_ALLOWED_VIEWS.has(activeView)) {
        setActiveView("dashboard");
      }
      return;
    }

    if (activeView === "gaming-booking") {
      setActiveView("new-order/take-away");
    }
    if (activeView === "purchase" && !canAccessPurchase) {
      setActiveView("dashboard");
    }
  }, [activeView, canAccessPurchase, isSnookerStaff]);

  const visibleMenus = useMemo(() => {
    const menus = isSnookerStaff ? SNOOKER_STAFF_MENUS : MAIN_MENUS;
    if (canAccessPurchase) {
      return menus;
    }
    return menus.filter((menu) => !("key" in menu && menu.key === "purchase"));
  }, [canAccessPurchase, isSnookerStaff]);
  const titleMeta =
    isSnookerStaff && activeView === "dashboard"
      ? {
          title: "Snooker Staff Dashboard",
          subtitle: "Live playing status, ending slots, and upcoming bookings."
        }
      : PAGE_TITLES[activeView];

  const content = useMemo(() => {
    switch (activeView) {
      case "dashboard":
        return isSnookerStaff ? <SnookerDashboardPage /> : <StaffDashboardPage />;
      case "attendance":
        return <StaffAttendancePage />;
      case "gaming-booking":
        return <StaffGamingBookingPage />;
      case "new-order/dine-in":
        return <NewOrderPage channel="dine-in" />;
      case "new-order/take-away":
        return <NewOrderPage channel="take-away" />;
      case "new-order/swiggy":
        return <NewOrderPage channel="swiggy" />;
      case "new-order/zomato":
        return <NewOrderPage channel="zomato" />;
      case "profile":
        return (
          <StaffPlaceholderPage
            title="Profile"
            subtitle={`Signed in as ${session?.fullName ?? "Staff"} (@${session?.username ?? "-"})`}
            actionLabel="Sign Out"
            onAction={() => {
              void logout();
            }}
          />
        );
      case "order":
        return <StaffOrdersPage />;
      case "kitchen":
        return <StaffKitchenPage />;
      case "tables":
        return (
          <StaffTablesPage
            onResumeToBilling={() => {
              setIsNewOrderExpanded(true);
              setActiveView("new-order/dine-in");
            }}
          />
        );
      case "closing":
        return <StaffClosingPage />;
      case "cash-audit":
        return <StaffCashAuditPage />;
      case "dump":
        return <StaffDumpPage />;
      case "outlet-transfer":
        return <StaffOutletTransferPage />;
      case "reports":
        return <StaffReportsPage />;
      case "purchase":
        return <StaffPurchasePage />;
      default:
        return (
          <StaffPlaceholderPage
            title="Module"
            subtitle="This module is currently unavailable for your account."
          />
        );
    }
  }, [activeView, isSnookerStaff, logout, session?.fullName, session?.username]);

  return (
    <Box h="100vh" overflow="hidden" bg="linear-gradient(160deg, #FFF6E6 0%, #FFFDF9 48%, #FFFFFF 100%)">
      <HStack align="stretch" spacing={0} h="100%" w="100%" minW={0}>
        <Box
          w={isSidebarCollapsedResolved ? SIDEBAR_COLLAPSED_WIDTH : expandedSidebarWidth}
          minW={isSidebarCollapsedResolved ? SIDEBAR_COLLAPSED_WIDTH : expandedSidebarWidth}
          h="100%"
          transition="width 0.22s ease"
          bg="linear-gradient(180deg, #FFFDF7 0%, #FFF8ED 100%)"
          borderRight="1px solid rgba(145, 87, 61, 0.15)"
          p={isSidebarCollapsedResolved ? 3 : isSmallDesktopViewport ? 4 : 5}
          pr={isSidebarCollapsedResolved ? 2.5 : isSmallDesktopViewport ? 3.5 : 4}
          overflowY="auto"
          overflowX="hidden"
          boxShadow="4px 0 26px rgba(56, 21, 8, 0.05)"
        >
          <VStack align="stretch" spacing={2} flex={1}>
            {isSidebarCollapsedResolved ? (
              <>
                <Image src={logo} alt="Dip & Dash" h="42px" objectFit="contain" mx="auto" />
                <HStack justify="center" mt={1} mb={1}>
                  <ActionIconButton
                    aria-label="Expand sidebar"
                    icon={<FiChevronRight size={18} />}
                    onClick={() => setIsSidebarCollapsed(false)}
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
                <HStack spacing={3} align="center">
                  <Image src={logo} alt="Dip & Dash" h="44px" objectFit="contain" />
                  <Box display="flex" flexDirection="column" justifyContent="center" lineHeight={1}>
                    <Text fontWeight={900} color="#2A1A14" fontSize="2xl">
                      Dip & Dash
                    </Text>
                    <Text color="#705A51" fontSize="lg" fontWeight={700} mt={1}>
                      Staff POS
                    </Text>
                  </Box>
                </HStack>
                <ActionIconButton
                  aria-label="Collapse sidebar"
                  icon={<FiChevronLeft size={18} />}
                  size="sm"
                  variant="outline"
                  onClick={() => setIsSidebarCollapsed(true)}
                  borderColor="rgba(142, 9, 9, 0.22)"
                  color="#7A2620"
                  bg="rgba(255,255,255,0.9)"
                  _hover={{ bg: "rgba(193, 14, 14, 0.08)" }}
                />
              </HStack>
            )}

            {visibleMenus.map((menu) => {
              if ("group" in menu) {
                const isGroupActive = activeView.startsWith("new-order/");
                const isGroupExpanded = isNewOrderExpanded || isGroupActive;
                const GroupIcon = menu.icon;

                const groupButton = (
                  <Button
                    variant="ghost"
                    justifyContent={isSidebarCollapsedResolved ? "center" : "space-between"}
                    borderRadius="14px"
                    py={5.5}
                    px={isSidebarCollapsedResolved ? 2 : 3}
                    minH="48px"
                    fontWeight={800}
                    color={isGroupActive || isGroupExpanded ? "#7A2620" : "#5C3E33"}
                    bg={
                      isGroupActive
                        ? "linear-gradient(92deg, #8E0909 0%, #B42626 44%, #D1A13D 100%)"
                        : isGroupExpanded
                          ? "rgba(193, 14, 14, 0.08)"
                          : "transparent"
                    }
                    _hover={{
                      bg: isGroupActive
                        ? "linear-gradient(92deg, #7A0707 0%, #A31F1F 44%, #BB8E35 100%)"
                        : "rgba(193, 14, 14, 0.08)"
                    }}
                    onClick={() => setIsNewOrderExpanded((previous) => !previous)}
                  >
                    <Flex align="center" gap={isSidebarCollapsedResolved ? 0 : 3}>
                      <Box
                        minW="30px"
                        h="30px"
                        borderRadius="9px"
                        display="grid"
                        placeItems="center"
                        bg={isGroupActive ? "rgba(255, 255, 255, 0.22)" : "rgba(193, 14, 14, 0.12)"}
                        color={isGroupActive ? "white" : "#7A2620"}
                      >
                        <GroupIcon size={18} />
                      </Box>
                      {!isSidebarCollapsedResolved ? <Text color={isGroupActive ? "white" : undefined}>{menu.label}</Text> : null}
                    </Flex>
                    {!isSidebarCollapsedResolved ? (
                      <Box color={isGroupActive ? "white" : "#7A2620"}>
                        {isNewOrderExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                      </Box>
                    ) : null}
                  </Button>
                );

                return (
                  <VStack key={menu.group} align="stretch" spacing={2}>
                    {isSidebarCollapsedResolved ? (
                      <Tooltip label={menu.label} placement="right" hasArrow openDelay={180}>
                        {groupButton}
                      </Tooltip>
                    ) : (
                      groupButton
                    )}
                    {isNewOrderExpanded ? (
                      <VStack align="stretch" pl={isSidebarCollapsedResolved ? 0 : 2} spacing={1.5}>
                        {NEW_ORDER_CHILDREN.map((child) => {
                          const ChildIcon = child.icon;
                          const isActive = activeView === child.key;
                          const childButton = (
                            <Button
                              key={child.key}
                              variant="ghost"
                              justifyContent={isSidebarCollapsedResolved ? "center" : "flex-start"}
                              borderRadius="14px"
                              py={5.5}
                              px={isSidebarCollapsedResolved ? 2 : 3}
                              minH="48px"
                              fontWeight={700}
                              color={isActive ? "white" : "#452E27"}
                              bg={
                                isActive
                                  ? "linear-gradient(92deg, #8E0909 0%, #B42626 44%, #D1A13D 100%)"
                                  : "transparent"
                              }
                              _hover={{
                                bg: isActive
                                  ? "linear-gradient(92deg, #7A0707 0%, #A31F1F 44%, #BB8E35 100%)"
                                  : "rgba(193, 14, 14, 0.08)"
                              }}
                              onClick={() => setActiveView(child.key)}
                            >
                              <Flex align="center" gap={isSidebarCollapsedResolved ? 0 : 3}>
                                <Box
                                  minW="30px"
                                  h="30px"
                                  borderRadius="9px"
                                  display="grid"
                                  placeItems="center"
                                  bg={isActive ? "rgba(255, 255, 255, 0.22)" : "rgba(193, 14, 14, 0.09)"}
                                  color={isActive ? "white" : "#7A2620"}
                                >
                                  <ChildIcon size={18} />
                                </Box>
                                {!isSidebarCollapsedResolved ? <Text>{child.label}</Text> : null}
                              </Flex>
                            </Button>
                          );
                          return (
                            isSidebarCollapsedResolved ? (
                              <Tooltip key={child.key} label={child.label} placement="right" hasArrow openDelay={180}>
                                {childButton}
                              </Tooltip>
                            ) : (
                              childButton
                            )
                          );
                        })}
                      </VStack>
                    ) : null}
                  </VStack>
                );
              }

              const Icon = menu.icon;
              const isActive = activeView === menu.key;
              const menuButton = (
                <Button
                  key={menu.key}
                  variant="ghost"
                  justifyContent={isSidebarCollapsedResolved ? "center" : "flex-start"}
                  borderRadius="14px"
                  py={5.5}
                  px={isSidebarCollapsedResolved ? 2 : 3}
                  minH="48px"
                  fontWeight={800}
                  color={isActive ? "white" : "#452E27"}
                  bg={isActive ? "linear-gradient(92deg, #8E0909 0%, #B42626 44%, #D1A13D 100%)" : "transparent"}
                  _hover={{
                    bg: isActive
                      ? "linear-gradient(92deg, #7A0707 0%, #A31F1F 44%, #BB8E35 100%)"
                      : "rgba(193, 14, 14, 0.08)"
                  }}
                  onClick={() => setActiveView(menu.key)}
                >
                  <Flex align="center" gap={isSidebarCollapsedResolved ? 0 : 3}>
                    <Box
                      minW="30px"
                      h="30px"
                      borderRadius="9px"
                      display="grid"
                      placeItems="center"
                      bg={isActive ? "rgba(255, 255, 255, 0.22)" : "rgba(193, 14, 14, 0.09)"}
                      color={isActive ? "white" : "#7A2620"}
                    >
                      <Icon size={18} />
                    </Box>
                    {!isSidebarCollapsedResolved ? <Text>{menu.label}</Text> : null}
                  </Flex>
                </Button>
              );
              return (
                isSidebarCollapsedResolved ? (
                  <Tooltip key={menu.key} label={menu.label} placement="right" hasArrow openDelay={180}>
                    {menuButton}
                  </Tooltip>
                ) : (
                  menuButton
                )
              );
            })}

            <Button
              variant="ghost"
              justifyContent={isSidebarCollapsedResolved ? "center" : "flex-start"}
              borderRadius="14px"
              py={5.5}
              px={isSidebarCollapsedResolved ? 2 : 3}
              minH="48px"
              fontWeight={800}
              color="#7A2620"
              _hover={{ bg: "rgba(193, 14, 14, 0.08)" }}
              onClick={() => {
                void logout();
              }}
            >
              <Flex align="center" gap={isSidebarCollapsedResolved ? 0 : 3}>
                <Box
                  minW="30px"
                  h="30px"
                  borderRadius="9px"
                  display="grid"
                  placeItems="center"
                  bg="rgba(193, 14, 14, 0.09)"
                >
                  <FiLogOut size={18} />
                </Box>
                {!isSidebarCollapsedResolved ? <Text>Logout</Text> : null}
              </Flex>
            </Button>
          </VStack>
        </Box>

        <Box flex={1} minW={0} h="100%" display="flex" flexDirection="column" overflowX="hidden">
          <PosTopBar
            session={session}
            isOnline={isOnline}
            isSyncing={syncState.isSyncing}
            pendingSyncCount={syncState.pendingCount}
            failedSyncCount={syncState.failedCount}
            lastSyncedAt={syncState.lastSyncedAt}
            title={titleMeta.title}
            subtitle={isOfflineSession ? "Offline session active. Some actions need internet to sync." : titleMeta.subtitle}
            compactLayout={shouldUseCompactTopBar}
            onOpenShortcuts={shortcutsModal.onOpen}
            onSyncNow={() => {
              void syncState.syncNow();
              toast({
                status: "info",
                title: "Sync started"
              });
            }}
            onLogout={() => {
              void logout();
            }}
          />
          <Box flex={1} overflowY="auto" overflowX="auto">
            <Box p={{ base: 3, xl: 4 }} minW={0}>
              {content}
            </Box>
          </Box>
        </Box>
      </HStack>

      <ShortcutHelpModal isOpen={shortcutsModal.isOpen} onClose={shortcutsModal.onClose} />
    </Box>
  );
};
