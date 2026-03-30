import { Avatar, HStack, Text, VStack } from "@chakra-ui/react";

import type { AuthUser } from "@/types/auth";

type ProfileSummaryProps = {
  user: AuthUser;
};

export const ProfileSummary = ({ user }: ProfileSummaryProps) => {
  return (
    <HStack spacing={4}>
      <Avatar size="lg" name={user.fullName} bg="brand.400" color="white" />
      <VStack align="start" spacing={0}>
        <Text fontSize="xl" fontWeight={800}>
          {user.fullName}
        </Text>
        <Text color="gray.500">@{user.username}</Text>
        <Text textTransform="capitalize" color="gray.500">
          {user.role.replace("_", " ")}
        </Text>
      </VStack>
    </HStack>
  );
};

