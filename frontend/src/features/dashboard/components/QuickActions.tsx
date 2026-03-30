import { Button, HStack } from "@chakra-ui/react";

type QuickActionsProps = {
  actions: Array<{ id: string; label: string }>;
};

export const QuickActions = ({ actions }: QuickActionsProps) => {
  return (
    <HStack spacing={3} wrap="wrap">
      {actions.map((action) => (
        <Button
          key={action.id}
          variant="outline"
          borderColor="rgba(133, 78, 48, 0.24)"
          color="#4B3026"
          _hover={{ bg: "rgba(218, 164, 56, 0.14)", borderColor: "rgba(133, 78, 48, 0.35)" }}
        >
          {action.label}
        </Button>
      ))}
    </HStack>
  );
};
