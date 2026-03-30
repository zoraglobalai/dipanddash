import { Box, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { gamingBookingsService } from "@/services/gaming-bookings.service";
import type { GamingBooking } from "@/types/pos";
import { formatINR } from "@/utils/currency";

const formatTime = (value: string) => new Date(value).toLocaleString("en-IN");

const getElapsedMinutes = (checkInAt: string) => {
  const diffMs = Date.now() - new Date(checkInAt).getTime();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
};

type DashboardSnapshot = {
  ongoingCount: number;
  upcomingCount: number;
  completedCount: number;
  pendingPaymentsCount: number;
  activePlayers: number;
  endingSoonCount: number;
  upcomingBookings: GamingBooking[];
  ongoingBookings: GamingBooking[];
};

const StatCard = ({ label, value, helper }: { label: string; value: string | number; helper?: string }) => (
  <Box p={4} borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)" bg="white">
    <Text color="#725D53" fontSize="sm" fontWeight={700}>
      {label}
    </Text>
    <Text mt={1} fontWeight={900} fontSize="2xl" color="#2A1A14">
      {value}
    </Text>
    {helper ? (
      <Text mt={1} fontSize="xs" color="#7A6358">
        {helper}
      </Text>
    ) : null}
  </Box>
);

export const SnookerDashboardPage = () => {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const data = await gamingBookingsService.getDashboardSnapshot();
      if (mounted) {
        setSnapshot(data);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const ongoingRows = useMemo(() => snapshot?.ongoingBookings ?? [], [snapshot]);
  const upcomingRows = useMemo(() => snapshot?.upcomingBookings ?? [], [snapshot]);

  return (
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 2, xl: 4 }} spacing={3}>
        <StatCard label="Active Sessions" value={snapshot?.ongoingCount ?? 0} helper={`${snapshot?.activePlayers ?? 0} players`} />
        <StatCard label="Upcoming Bookings" value={snapshot?.upcomingCount ?? 0} />
        <StatCard label="Ending Soon" value={snapshot?.endingSoonCount ?? 0} helper="Sessions over 45 mins" />
        <StatCard label="Pending Payments" value={snapshot?.pendingPaymentsCount ?? 0} />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
        <Box p={4} borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)" bg="white">
          <Text fontWeight={900} mb={3}>
            Currently Playing
          </Text>
          <VStack align="stretch" spacing={2}>
            {ongoingRows.map((booking) => (
              <Box key={booking.localBookingId} p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.16)">
                <HStack justify="space-between">
                  <Text fontWeight={800}>{booking.resourceLabel}</Text>
                  <Text color="#7A6358" fontSize="sm">
                    {getElapsedMinutes(booking.checkInAt)} mins
                  </Text>
                </HStack>
                <Text mt={1} color="#4A332A">
                  {booking.primaryCustomerName} ({booking.primaryCustomerPhone})
                </Text>
                <Text mt={1} fontSize="sm" color="#6D584E">
                  Players: {booking.playerCount}
                </Text>
                <Text mt={1} fontSize="sm" color="#6D584E">
                  Live: {formatINR(gamingBookingsService.getLiveAmount(booking))}
                </Text>
              </Box>
            ))}
            {!ongoingRows.length ? <Text color="#6D584E">No active sessions right now.</Text> : null}
          </VStack>
        </Box>

        <Box p={4} borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)" bg="white">
          <Text fontWeight={900} mb={3}>
            Upcoming Bookings
          </Text>
          <VStack align="stretch" spacing={2}>
            {upcomingRows.map((booking) => (
              <Box key={booking.localBookingId} p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.16)">
                <HStack justify="space-between">
                  <Text fontWeight={800}>{booking.resourceLabel}</Text>
                  <Text color="#7A6358" fontSize="sm">
                    {formatTime(booking.checkInAt)}
                  </Text>
                </HStack>
                <Text mt={1} color="#4A332A">
                  {booking.primaryCustomerName} ({booking.primaryCustomerPhone})
                </Text>
                <Text mt={1} fontSize="sm" color="#6D584E">
                  Players: {booking.playerCount}
                </Text>
              </Box>
            ))}
            {!upcomingRows.length ? <Text color="#6D584E">No upcoming bookings in queue.</Text> : null}
          </VStack>
        </Box>
      </SimpleGrid>
    </VStack>
  );
};
