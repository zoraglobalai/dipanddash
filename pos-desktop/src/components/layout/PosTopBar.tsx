import { Box, Button, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import { FiLogOut, FiRefreshCw, FiWifi, FiWifiOff } from "react-icons/fi";

import { StatusBadge } from "@/components/common/StatusBadge";
import type { StaffSession } from "@/types/pos";

type PosTopBarProps = {
  session: StaffSession | null;
  isOnline: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;
  failedSyncCount: number;
  lastSyncedAt: string | null;
  title?: string;
  subtitle?: string;
  compactLayout?: boolean;
  onOpenShortcuts: () => void;
  onSyncNow: () => void;
  onLogout?: () => void;
};

export const PosTopBar = ({
  session,
  isOnline,
  isSyncing,
  pendingSyncCount,
  failedSyncCount,
  lastSyncedAt,
  title,
  subtitle,
  compactLayout = false,
  onOpenShortcuts,
  onSyncNow,
  onLogout
}: PosTopBarProps) => {
  return (
    <Box
      px={{ base: 3, lg: 5 }}
      py={3}
      borderBottom="1px solid"
      borderColor="rgba(121, 74, 51, 0.15)"
      bg="rgba(255,255,255,0.9)"
      backdropFilter="blur(8px)"
      position="sticky"
      top={0}
      zIndex={30}
      overflowX="hidden"
    >
      <Flex
        justify="space-between"
        align={compactLayout ? "stretch" : { base: "stretch", xl: "center" }}
        direction={compactLayout ? "column" : { base: "column", xl: "row" }}
        gap={3}
      >
        <VStack align="start" spacing={0} minW={0}>
          <Text fontWeight={900} color="#2A1A14">
            {title ?? "Dip & Dash POS"}
          </Text>
          <Text
            fontSize={{ base: "xs", md: "sm" }}
            color="#7A6258"
            noOfLines={compactLayout ? 2 : { base: 2, xl: 1 }}
          >
            {subtitle ?? "Offline-first billing console"}
          </Text>
        </VStack>

        <HStack
          spacing={2}
          flexWrap="wrap"
          justify={compactLayout ? "flex-start" : { base: "flex-start", xl: "flex-end" }}
          align="center"
        >
          <StatusBadge
            label={isOnline ? "Online" : "Offline"}
            tone={isOnline ? "success" : "danger"}
          />
          <StatusBadge
            label={
              failedSyncCount > 0
                ? `${failedSyncCount} failed`
                : pendingSyncCount > 0
                  ? `${pendingSyncCount} pending`
                  : "Queue clear"
            }
            tone={failedSyncCount > 0 ? "danger" : pendingSyncCount > 0 ? "warning" : "info"}
          />
          <HStack
            spacing={1}
            color={isOnline ? "green.600" : "red.500"}
            display={compactLayout ? "none" : { base: "none", md: "inline-flex" }}
          >
            {isOnline ? <FiWifi /> : <FiWifiOff />}
            <Text fontSize="sm">{isOnline ? "Network" : "No network"}</Text>
          </HStack>
          <Button
            size={{ base: "xs", md: "sm" }}
            variant="outline"
            leftIcon={<FiRefreshCw />}
            isLoading={isSyncing}
            onClick={onSyncNow}
          >
            Sync
          </Button>
          <Button size={{ base: "xs", md: "sm" }} variant="outline" onClick={onOpenShortcuts}>
            Shortcuts
          </Button>
          {onLogout ? (
            <Button size={{ base: "xs", md: "sm" }} variant="outline" leftIcon={<FiLogOut />} onClick={onLogout}>
              Logout
            </Button>
          ) : null}
          <VStack align={compactLayout ? "start" : { base: "start", xl: "end" }} spacing={0}>
            <Text fontWeight={700} fontSize="sm">
              {session?.fullName ?? "Staff"}
            </Text>
            <Text fontSize="xs" color="#7A6258">
              {lastSyncedAt ? `Last sync ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
            </Text>
          </VStack>
        </HStack>
      </Flex>
    </Box>
  );
};
