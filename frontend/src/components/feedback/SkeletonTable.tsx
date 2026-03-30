import { Box, Skeleton, VStack } from "@chakra-ui/react";

type SkeletonTableProps = {
  rows?: number;
};

export const SkeletonTable = ({ rows = 6 }: SkeletonTableProps) => {
  return (
    <Box className="premium-card" p={5}>
      <VStack spacing={3} align="stretch">
        <Skeleton height="14px" width="35%" />
        <Skeleton height="40px" />
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} height="34px" />
        ))}
      </VStack>
    </Box>
  );
};

