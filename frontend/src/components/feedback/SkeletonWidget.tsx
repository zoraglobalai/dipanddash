import { Box, Skeleton, VStack } from "@chakra-ui/react";

export const SkeletonWidget = () => {
  return (
    <Box className="premium-card" p={5}>
      <VStack spacing={3} align="stretch">
        <Skeleton height="12px" width="32%" />
        <Skeleton height="22px" width="50%" />
        <Skeleton height="70px" />
      </VStack>
    </Box>
  );
};

