import { Box, Skeleton, VStack } from "@chakra-ui/react";

export const SkeletonForm = () => {
  return (
    <Box className="premium-card" p={5}>
      <VStack spacing={4} align="stretch">
        <Skeleton height="14px" width="28%" />
        <Skeleton height="42px" />
        <Skeleton height="14px" width="28%" />
        <Skeleton height="42px" />
        <Skeleton height="14px" width="28%" />
        <Skeleton height="42px" />
        <Skeleton height="42px" width="160px" />
      </VStack>
    </Box>
  );
};

