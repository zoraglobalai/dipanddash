import { Box, Button, Text, VStack } from "@chakra-ui/react";

type StaffPlaceholderPageProps = {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
};

export const StaffPlaceholderPage = ({
  title,
  subtitle,
  actionLabel,
  onAction
}: StaffPlaceholderPageProps) => (
  <Box
    p={8}
    borderRadius="16px"
    border="1px solid rgba(132, 79, 52, 0.2)"
    bg="white"
    minH="320px"
    display="flex"
    alignItems="center"
    justifyContent="center"
  >
    <VStack spacing={3}>
      <Text fontSize="2xl" fontWeight={900} color="#2A1A14">
        {title}
      </Text>
      <Text color="#705A51" textAlign="center" maxW="640px">
        {subtitle}
      </Text>
      {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </VStack>
  </Box>
);

