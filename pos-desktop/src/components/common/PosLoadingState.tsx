import { Box, Text, VStack } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

type PosLoadingStateProps = {
  message?: string;
  detail?: string;
  minH?: string | number;
  compact?: boolean;
};

const spinColor = keyframes`
  0% {
    transform: rotate(0deg);
    border-top-color: #1f7a5a;
    border-right-color: #d99a2b;
  }
  33% {
    border-top-color: #d94f35;
    border-right-color: #1f7a5a;
  }
  66% {
    border-top-color: #2f6fd6;
    border-right-color: #d94f35;
  }
  100% {
    transform: rotate(360deg);
    border-top-color: #1f7a5a;
    border-right-color: #d99a2b;
  }
`;

const pulseRing = keyframes`
  0%, 100% {
    transform: scale(0.92);
    opacity: 0.36;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.12;
  }
`;

export const PosLoadingState = ({
  message = "Loading records...",
  detail = "Syncing live snooker and food orders",
  minH = "220px",
  compact = false
}: PosLoadingStateProps) => (
  <VStack
    minH={compact ? "auto" : minH}
    py={compact ? 3 : 8}
    px={compact ? 3 : 6}
    justify="center"
    spacing={compact ? 2 : 4}
    color="#4B352C"
  >
    <Box
      position="relative"
      display="grid"
      placeItems="center"
      w={compact ? "42px" : "58px"}
      h={compact ? "42px" : "58px"}
    >
      <Box
        position="absolute"
        inset={0}
        borderRadius="full"
        bg="rgba(31, 122, 90, 0.18)"
        animation={`${pulseRing} 1.4s ease-in-out infinite`}
      />
      <Box
        w={compact ? "30px" : "40px"}
        h={compact ? "30px" : "40px"}
        borderRadius="full"
        border={compact ? "3px solid" : "4px solid"}
        borderColor="rgba(75, 53, 44, 0.14)"
        borderTopColor="#1f7a5a"
        borderRightColor="#d99a2b"
        animation={`${spinColor} 0.9s linear infinite`}
      />
    </Box>
    <VStack spacing={1}>
      <Text fontWeight={900} fontSize={compact ? "sm" : "md"} textAlign="center">
        {message}
      </Text>
      {detail ? (
        <Text color="#725D53" fontSize={compact ? "xs" : "sm"} textAlign="center">
          {detail}
        </Text>
      ) : null}
    </VStack>
  </VStack>
);
