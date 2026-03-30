import { Box, Button, Heading, Text, VStack } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";

type ErrorFallbackProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export const ErrorFallback = ({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry
}: ErrorFallbackProps) => {
  const navigate = useNavigate();

  return (
    <Box minH="70vh" display="grid" placeItems="center" px={4}>
      <VStack spacing={4} className="premium-card" p={8} maxW="520px" textAlign="center">
        <Heading size="md">{title}</Heading>
        <Text color="gray.500">{message}</Text>
        <VStack w="full" spacing={2}>
          {onRetry ? (
            <Button w="full" colorScheme="brand" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
          <Button w="full" variant="outline" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
          <Button w="full" variant="ghost" onClick={() => navigate("/login")}>
            Back to Login
          </Button>
        </VStack>
      </VStack>
    </Box>
  );
};

