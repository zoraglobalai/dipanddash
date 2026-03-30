import { HStack, Text, VStack } from "@chakra-ui/react";

type RecentActivityListProps = {
  activities: Array<{ id: string; action: string; actor: string; time: string }>;
};

export const RecentActivityList = ({ activities }: RecentActivityListProps) => {
  return (
    <VStack spacing={3} align="stretch">
      {activities.map((activity) => (
        <HStack
          key={activity.id}
          justify="space-between"
          p={3}
          borderRadius="12px"
          border="1px solid"
          borderColor="rgba(133, 78, 48, 0.18)"
          bg="rgba(255, 252, 247, 0.72)"
        >
          <VStack align="start" spacing={0}>
            <Text fontWeight={700} color="#271A15">
              {activity.action}
            </Text>
            <Text fontSize="sm" color="#6F5A50">
              by {activity.actor}
            </Text>
          </VStack>
          <Text fontSize="sm" color="#7C695F">
            {activity.time}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
};
