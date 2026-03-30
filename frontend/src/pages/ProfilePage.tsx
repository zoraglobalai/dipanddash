import { HStack, Text, VStack } from "@chakra-ui/react";

import { PageHeader } from "@/components/common/PageHeader";
import { AppCard } from "@/components/ui/AppCard";
import { useAuth } from "@/context/AuthContext";
import { ProfileSummary } from "@/features/profile/components/ProfileSummary";

export const ProfilePage = () => {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader title="Profile" subtitle="Account identity and access role details." />

      <AppCard>
        <ProfileSummary user={user} />
      </AppCard>

      <AppCard title="Account Summary">
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text color="#725D53">Username</Text>
            <Text fontWeight={700} color="#281A15">
              @{user.username}
            </Text>
          </HStack>
          <HStack justify="space-between">
            <Text color="#725D53">Email</Text>
            <Text fontWeight={700} color="#281A15">
              {user.email ?? "Not provided"}
            </Text>
          </HStack>
          <HStack justify="space-between">
            <Text color="#725D53">Role</Text>
            <Text fontWeight={700} textTransform="capitalize" color="#281A15">
              {user.role.replace("_", " ")}
            </Text>
          </HStack>
        </VStack>
      </AppCard>
    </VStack>
  );
};
