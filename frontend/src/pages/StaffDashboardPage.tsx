import { Alert, AlertIcon, Box, Text, VStack } from "@chakra-ui/react";

import { AppCard } from "@/components/ui/AppCard";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorFallback } from "@/components/feedback/ErrorFallback";
import { SkeletonWidget } from "@/components/feedback/SkeletonWidget";
import { useStaffDashboard } from "@/features/dashboard/hooks/useStaffDashboard";
import { StaffSummaryCards } from "@/features/dashboard/components/StaffSummaryCards";

export const StaffDashboardPage = () => {
  const { data, loading, error, refetch } = useStaffDashboard();

  if (error) {
    return <ErrorFallback title="Unable to Load Staff Dashboard" message={error} onRetry={() => void refetch()} />;
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Staff Dashboard"
        subtitle="Focused view for team members and operational tasks."
      />

      {loading ? (
        <SkeletonWidget />
      ) : (
        <AppCard title="Welcome Back">
          <Text fontSize="xl" fontWeight={800} color="#251712">
            {data?.welcomeTitle}
          </Text>
          <Text mt={2} color="#725D53">
            Keep your shift updates and actions synchronized from one place.
          </Text>
        </AppCard>
      )}

      {loading ? <SkeletonWidget /> : <StaffSummaryCards items={data?.summary ?? []} />}

      {loading ? (
        <SkeletonWidget />
      ) : (
        <AppCard title="Team Notes">
          <VStack align="stretch" spacing={3}>
            {(data?.notes ?? []).map((note) => (
              <Box
                key={note}
                p={3}
                border="1px solid"
                borderColor="rgba(133, 78, 48, 0.2)"
                borderRadius="12px"
                bg="rgba(255, 252, 246, 0.8)"
              >
                {note}
              </Box>
            ))}
          </VStack>
        </AppCard>
      )}

      <Alert
        borderRadius="14px"
        status="info"
        bg="linear-gradient(90deg, #FFF5E2 0%, #FFEBC9 100%)"
        border="1px solid"
        borderColor="rgba(195, 146, 53, 0.38)"
        color="#5B473D"
      >
        <AlertIcon />
        This dashboard is intentionally lightweight and designed for future POS/staff desktop alignment.
      </Alert>
    </VStack>
  );
};
  