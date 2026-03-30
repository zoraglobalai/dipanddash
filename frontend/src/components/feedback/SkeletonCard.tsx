import { Box, Skeleton, SkeletonText } from "@chakra-ui/react";

export const SkeletonCard = () => {
  return (
    <Box className="premium-card" p={5}>
      <Skeleton height="12px" width="40%" />
      <Skeleton mt={4} height="24px" width="60%" />
      <Skeleton mt={4} height="24px" width="28%" borderRadius="999px" />
      <SkeletonText mt={5} noOfLines={2} spacing={2} />
    </Box>
  );
};

