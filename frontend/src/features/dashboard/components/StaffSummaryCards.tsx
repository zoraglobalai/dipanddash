import { SimpleGrid } from "@chakra-ui/react";

import { StatCard } from "@/components/ui/StatCard";

type StaffSummaryCardsProps = {
  items: Array<{ label: string; value: string | number }>;
};

export const StaffSummaryCards = ({ items }: StaffSummaryCardsProps) => {
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} />
      ))}
    </SimpleGrid>
  );
};

