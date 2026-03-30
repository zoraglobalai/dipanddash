import { Box, Skeleton, VStack } from "@chakra-ui/react";

export const SidebarSkeleton = () => {
  return (
    <Box w="260px" p={4} borderRight="1px solid" borderColor="gray.100">
      <Skeleton height="54px" borderRadius="10px" />
      <VStack mt={8} align="stretch" spacing={3}>
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} height="38px" borderRadius="10px" />
        ))}
      </VStack>
    </Box>
  );
};

