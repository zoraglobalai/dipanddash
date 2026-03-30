import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Box, Text, VStack } from "@chakra-ui/react";

import { AppCard } from "@/components/ui/AppCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

const titleMap: Record<string, string> = {
  "/sales-statics": "Sales Statics",
  "/items-entry": "Items Entry",
  "/ingredient-entry": "Ingredient Entry",
  "/offers": "Offers",
  "/customer-data": "Customer Data",
  "/suppliers": "Suppliers",
  "/purchase": "Purchase",
  "/reports": "Reports",
  "/assets-entry": "Assets Entry",
  "/stock-audit": "Stock Audit",
  "/gaming": "Gaming"
};

export const ModulePlaceholderPage = () => {
  const location = useLocation();
  const moduleName = useMemo(() => titleMap[location.pathname] ?? "Module", [location.pathname]);

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader title={moduleName} subtitle="Module scaffold is ready for real API integration." />
      <AppCard>
        <EmptyState
          title={`${moduleName} Coming Soon`}
          description="This module has a premium placeholder and is architecture-ready for upcoming implementation."
          action={
            <Box
              px={4}
              py={2}
              borderRadius="10px"
              bg="linear-gradient(90deg, #FFF5E2 0%, #FFE9C5 100%)"
              border="1px solid"
              borderColor="rgba(195, 146, 53, 0.34)"
            >
              <Text color="#6A4F1B" fontWeight={700}>
                API-ready placeholder state
              </Text>
            </Box>
          }
        />
      </AppCard>
    </VStack>
  );
};
