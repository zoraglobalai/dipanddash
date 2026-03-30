import { Box, HStack, Skeleton, VStack } from "@chakra-ui/react";

type SkeletonListProps = {
  rows?: number;
};

export const SkeletonList = ({ rows = 5 }: SkeletonListProps) => {
  return (
    <Box className="premium-card" p={5}>
      <VStack spacing={3} align="stretch">
        {Array.from({ length: rows }).map((_, index) => (
          <HStack key={index} spacing={3}>
            <Skeleton boxSize="36px" borderRadius="full" />
            <VStack align="start" spacing={2} flex={1}>
              <Skeleton height="10px" width="40%" />
              <Skeleton height="10px" width="65%" />
            </VStack>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
};

