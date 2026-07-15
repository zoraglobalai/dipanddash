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
  useMediaQuery
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import {
  FiCheckCircle,
  FiCalendar,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiClock,
  FiCoffee,
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
import { StaffGamingHistoryPage } from "@/app/StaffGamingHistoryPage";
import { SnookerDashboardPage } from "@/app/SnookerDashboardPage";
import { StaffCashAuditPage } from "@/app/StaffCashAuditPage";
import { StaffDumpPage } from "@/app/StaffDumpPage";
import { StaffOutletTransferPage } from "@/app/StaffOutletTransferPage";
import { StaffSnookerProductSalesPage } from "@/app/StaffSnookerProductSalesPage";
import { StaffPendingPage } from "@/app/StaffPendingPage";
import { PosTopBar } from "@/components/layout/PosTopBar";
import { ShortcutHelpModal } from "@/components/pos/ShortcutHelpModal";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

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
  | "pending"
  | "profile"
  | "gaming-booking"
  | "gaming-product-sale"
  | "gaming-history";

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
  { key: "pending", label: "Pending", icon: FiDollarSign },
  { key: "attendance", label: "Attendance", icon: FiClock },
  { key: "closing", label: "Closing", icon: FiCheckCircle },
  { key: "cash-audit", label: "Cash Audit", icon: FiDollarSign },
  { key: "dump", label: "Dump", icon: FiTrash2 },
  { key: "outlet-transfer", label: "Outlet Transfer", icon: FiRepeat },
  { key: "profile", label: "Profile", icon: FiUser }
];

const SNOOKER_STAFF_MENUS: StaffMenuConfig[] = [
  { key: "dashboard", label: "Dashboard", icon: FiGrid },
  { key: "gaming-booking", label: "New Booking", icon: FiPlusSquare },
  { key: "gaming-history", label: "Booking History", icon: FiCalendar },
  { key: "gaming-product-sale", label: "Product Sale", icon: FiShoppingBag },
  { key: "pending", label: "Pending", icon: FiDollarSign },
  { key: "cash-audit", label: "Cash Audit", icon: FiDollarSign },
  { key: "attendance", label: "Attendance", icon: FiClock }
];

const SNOOKER_ALLOWED_VIEWS = new Set<StaffViewKey>([
  "dashboard",
  "attendance",
  "pending",
  "gaming-booking",
  "gaming-product-sale",
  "gaming-history",
  "cash-audit"
]);

const PAGE_TITLES: Record<StaffViewKey, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Staff Dashboard",
    subtitle: "Quick insights for shift operations and order pace."
  },
  "new-order/dine-in": {
    title: "New Order - Dine In",
    subtitle: "Fast dine-in billing with centralized records."
  },
  "new-order/take-away": {
    title: "New Order - Take Away",
    subtitle: "Counter-ready takeaway billing optimized for speed."
  },
  "new-order/swiggy": {
    title: "New Order - Swiggy",
    subtitle: "Capture delivery marketplace orders in real time."
  },
  "new-order/zomato": {
    title: "New Order - Zomato",
    subtitle: "Queue and bill Zomato orders from a single source of truth."
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
    subtitle: "Submit one stock closing report per business day. Pending previous day close must be submitted first."
  },
  "cash-audit": {
    title: "Cash Audit",
    subtitle: "Submit denomination cash counts with admin-password confirmation."
  },
  dump: {
    title: "Dump / Wastage",
    subtitle: "Record ingredient/item/product wastage with stock-linked deduction."
  },
  pending: {
    title: "Pending Collections",
    subtitle: "Track customer pending dues and collect payments with history."
  },
  "outlet-transfer": {
    title: "Outlet Transfer",
    subtitle: "Move stock between outlets with source and destination updates."
  },
  profile: {
    title: "Profile",
    subtitle: "Staff account and active session details."
  },
  "gaming-booking": {
    title: "New Booking",
    subtitle: "Create and manage snooker/console sessions centrally."
  },
  "gaming-product-sale": {
    title: "Product Sale",
    subtitle: "Direct product billing for snooker counter sales with payment capture."
  },
  "gaming-history": {
    title: "Booking History",
    subtitle: "Date-wise view of all bookings with payment status and amounts."
  }
};

export const StaffDesktopShell = () => {
  const { session, logout } = usePosAuth();
  const isOnline = useNetworkStatus();
  const shortcutsModal = useDisclosure();
  const [isMobileViewport] = useMediaQuery("(max-width: 767px)");
  const [isCompactViewport] = useMediaQuery("(max-width: 1360px)");
  const [isSmallDesktopViewport] = useMediaQuery("(max-width: 1440px)");
  const [isNarrowDesktopViewport] = useMediaQuery("(max-width: 1600px)");

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNewOrderExpanded, setIsNewOrderExpanded] = useState(true);
  const [activeView, setActiveView] = useState<StaffViewKey>(
    session?.role === "snooker_staff" ? "dashboard" : "new-order/take-away"
  );
  const isSnookerStaff = session?.role === "snooker_staff";
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

    if (activeView === "gaming-booking" || activeView === "gaming-product-sale" || activeView === "gaming-history") {
      setActiveView("new-order/take-away");
    }
  }, [activeView, isSnookerStaff]);

  const visibleMenus = useMemo(() => {
    return isSnookerStaff ? SNOOKER_STAFF_MENUS : MAIN_MENUS;
  }, [isSnookerStaff]);
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
      case "gaming-product-sale":
        return <StaffSnookerProductSalesPage />;
      case "gaming-history":
        return <StaffGamingHistoryPage />;
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
      case "pending":
        return <StaffPendingPage />;
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
    <Box h="100dvh" overflow="hidden" bg="linear-gradient(160deg, #FFF6E6 0%, #FFFDF9 48%, #FFFFFF 100%)">
      <HStack align="stretch" spacing={0} h="100%" w="100%" minW={0}>
        <Box
          display={isMobileViewport ? "none" : "block"}
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
            title={titleMeta.title}
            subtitle={titleMeta.subtitle}
            compactLayout={shouldUseCompactTopBar}
            mobileLayout={isMobileViewport}
            onOpenShortcuts={shortcutsModal.onOpen}
            onLogout={() => {
              void logout();
            }}
          />
          <Box flex={1} overflowY="auto" overflowX="hidden" pb={isMobileViewport ? "78px" : 0}>
            <Box p={{ base: 3, xl: 4 }} minW={0} w="100%">
              {content}
            </Box>
          </Box>
        </Box>
      </HStack>

      {isMobileViewport ? (
        <HStack
          position="fixed"
          left={0}
          right={0}
          bottom={0}
          zIndex={100}
          spacing={1}
          px={2}
          pt={2}
          pb="calc(8px + env(safe-area-inset-bottom))"
          bg="rgba(255, 253, 247, 0.98)"
          borderTop="1px solid rgba(145, 87, 61, 0.2)"
          boxShadow="0 -8px 24px rgba(56, 21, 8, 0.1)"
          overflowX="auto"
          align="stretch"
          sx={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
        >
          {visibleMenus.map((menu) => {
            const isGroup = "group" in menu;
            const Icon = menu.icon;
            const isActive = isGroup ? activeView.startsWith("new-order/") : activeView === menu.key;
            return (
              <Button
                key={isGroup ? menu.group : menu.key}
                variant="ghost"
                minW="74px"
                h="58px"
                px={2}
                py={1}
                borderRadius="12px"
                color={isActive ? "white" : "#6F3028"}
                bg={isActive ? "linear-gradient(135deg, #9C0B0B, #CC9B31)" : "transparent"}
                _hover={{ bg: isActive ? "linear-gradient(135deg, #8B0909, #B9892A)" : "rgba(193, 14, 14, 0.08)" }}
                onClick={() => {
                  if (isGroup) {
                    setIsNewOrderExpanded(true);
                    setActiveView("new-order/dine-in");
                  } else {
                    setActiveView(menu.key);
                  }
                }}
              >
                <VStack spacing={1}>
                  <Icon size={20} />
                  <Text fontSize="10px" fontWeight={800} noOfLines={1} maxW="68px">
                    {menu.label}
                  </Text>
                </VStack>
              </Button>
            );
          })}
          <Button
            variant="ghost"
            minW="74px"
            h="58px"
            px={2}
            py={1}
            borderRadius="12px"
            color="#7A2620"
            onClick={() => void logout()}
          >
            <VStack spacing={1}>
              <FiLogOut size={20} />
              <Text fontSize="10px" fontWeight={800}>Logout</Text>
            </VStack>
          </Button>
        </HStack>
      ) : null}

      <ShortcutHelpModal isOpen={shortcutsModal.isOpen} onClose={shortcutsModal.onClose} />
    </Box>
  );
};
