import { Box, Heading, Text } from "@chakra-ui/react";
import { memo, type ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export const EmptyState = memo(({ title, description, icon, action }: EmptyStateProps) => {
  return (
    <Box
      border="1px dashed"
      borderColor="rgba(133, 78, 48, 0.28)"
      borderRadius="16px"
      py={12}
      px={6}
      textAlign="center"
      bg="linear-gradient(180deg, #FFFCF7 0%, #FFF5E6 100%)"
    >
      {icon ? <Box mb={4}>{icon}</Box> : null}
      <Heading size="md" color="#2D1D17">
        {title}
      </Heading>
      <Text mt={2} color="#6F5A50">
        {description}
      </Text>
      {action ? <Box mt={6}>{action}</Box> : null}
    </Box>
  );
});

EmptyState.displayName = "EmptyState";
