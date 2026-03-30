import { Badge } from "@chakra-ui/react";

type StatusBadgeProps = {
  active: boolean;
};

export const StatusBadge = ({ active }: StatusBadgeProps) => {
  return (
    <Badge
      colorScheme={active ? "green" : "orange"}
      variant="solid"
      borderRadius="full"
      px={3}
      py={1}
      textTransform="capitalize"
      fontWeight={700}
      bg={active ? "green.100" : "orange.100"}
      color={active ? "green.700" : "#8A5400"}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  );
};
