import { Box, Text } from "@chakra-ui/react";
import { memo } from "react";

import { AppCard } from "./AppCard";

type StatCardProps = {
  label: string;
  value: string | number;
  change?: string;
};

export const StatCard = memo(({ label, value, change }: StatCardProps) => {
  const isPositive = change?.startsWith("+");

  return (
    <AppCard bg="linear-gradient(160deg, #FFFFFF 0%, #FFF7E8 100%)">
      <Text fontSize="sm" color="#745F56" fontWeight={700}>
        {label}
      </Text>
      <Text mt={2} fontSize="2xl" fontWeight={800} color="#251712">
        {value}
      </Text>
      {change ? (
        <Box
          mt={3}
          w="fit-content"
          px={2}
          py={1}
          borderRadius="full"
          fontSize="xs"
          fontWeight={700}
          bg={isPositive ? "green.100" : "red.100"}
          color={isPositive ? "green.700" : "accentRed.700"}
        >
          {change}
        </Box>
      ) : null}
    </AppCard>
  );
});

StatCard.displayName = "StatCard";
