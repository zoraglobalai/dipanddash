import { Alert, AlertIcon, Box, SimpleGrid, Text, VStack, useToast } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { staffDashboardService } from "@/services/staff-dashboard.service";
import type { StaffDashboardData } from "@/types/dashboard";

export const StaffDashboardPage = () => {
  const toast = useToast();
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await staffDashboardService.getDashboard();
        setData(response.data);
        setFromCache(response.fromCache);
      } catch (error) {
        toast({
          status: "error",
          title: "Unable to load dashboard",
          description: error instanceof Error ? error.message : "Please retry."
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [toast]);

  return (
    <VStack spacing={4} align="stretch">
      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <Text fontSize="2xl" fontWeight={900} color="#2A1A14">
          {loading ? "Loading dashboard..." : data?.welcomeTitle ?? "Welcome"}
        </Text>
        <Text mt={1.5} color="#725D53">
          Keep your shift updates and actions synchronized from one place.
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 2, xl: 4 }} spacing={3}>
        {(loading ? [] : data?.summary ?? []).map((entry) => (
          <Box
            key={entry.label}
            p={3}
            borderRadius="12px"
            border="1px solid rgba(132, 79, 52, 0.2)"
            bg="white"
          >
            <Text color="#725D53" fontSize="sm" fontWeight={700}>
              {entry.label}
            </Text>
            <Text mt={2} fontWeight={900} fontSize="2xl" color="#2A1A14">
              {entry.value}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <Text fontWeight={800} mb={3}>
          Team Notes
        </Text>
        <VStack align="stretch" spacing={2}>
          {(loading ? [] : data?.notes ?? []).map((note) => (
            <Box
              key={note}
              p={3}
              border="1px solid rgba(132, 79, 52, 0.18)"
              borderRadius="10px"
              bg="rgba(255, 252, 246, 0.85)"
              color="#4F3A32"
            >
              {note}
            </Box>
          ))}
          {!loading && !(data?.notes?.length ?? 0) ? (
            <Text color="#725D53" fontSize="sm">
              No notes available for this shift.
            </Text>
          ) : null}
        </VStack>
      </Box>

      {fromCache ? (
        <Alert
          borderRadius="14px"
          status="warning"
          bg="rgba(255, 238, 205, 0.65)"
          border="1px solid"
          borderColor="rgba(195, 146, 53, 0.42)"
          color="#5B473D"
        >
          <AlertIcon />
          Offline mode: dashboard is showing last synced snapshot.
        </Alert>
      ) : null}
    </VStack>
  );
};

