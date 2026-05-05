import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

type PosLoadingStateProps = {
  message?: string;
  detail?: string;
  minH?: string | number;
  compact?: boolean;
};

const roll = keyframes`
  0% { transform: translateX(-18px) rotate(0deg); }
  50% { transform: translateX(18px) rotate(180deg); }
  100% { transform: translateX(-18px) rotate(360deg); }
`;

const steam = keyframes`
  0% { opacity: 0.2; transform: translateY(8px) scaleY(0.7); }
  50% { opacity: 0.85; transform: translateY(-4px) scaleY(1); }
  100% { opacity: 0.2; transform: translateY(8px) scaleY(0.7); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(197, 135, 36, 0.24); }
  50% { box-shadow: 0 0 0 8px rgba(197, 135, 36, 0.04); }
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
    <Box position="relative" w={compact ? "92px" : "128px"} h={compact ? "46px" : "62px"}>
      <Box
        position="absolute"
        left="50%"
        top={compact ? "16px" : "22px"}
        w={compact ? "68px" : "94px"}
        h={compact ? "18px" : "24px"}
        transform="translateX(-50%)"
        borderRadius="999px"
        bg="linear-gradient(90deg, #244C3A 0%, #2F6B50 48%, #244C3A 100%)"
        border="2px solid rgba(42, 26, 20, 0.16)"
        animation={`${glow} 1.8s ease-in-out infinite`}
      />
      <Box
        position="absolute"
        left="50%"
        top={compact ? "19px" : "26px"}
        w={compact ? "13px" : "17px"}
        h={compact ? "13px" : "17px"}
        ml={compact ? "-6.5px" : "-8.5px"}
        borderRadius="full"
        bg="#FFFDF7"
        border="2px solid #A93D2B"
        animation={`${roll} 1.45s ease-in-out infinite`}
      />
      <HStack position="absolute" right={compact ? "2px" : "0"} top={compact ? "3px" : "4px"} spacing={compact ? 0.5 : 1}>
        {[0, 1, 2].map((item) => (
          <Box
            key={item}
            w={compact ? "3px" : "4px"}
            h={compact ? "16px" : "22px"}
            borderRadius="full"
            bg="rgba(197, 135, 36, 0.58)"
            animation={`${steam} ${1.1 + item * 0.16}s ease-in-out infinite`}
          />
        ))}
      </HStack>
      <Box
        position="absolute"
        right={compact ? "12px" : "18px"}
        bottom={compact ? "2px" : "0"}
        w={compact ? "28px" : "38px"}
        h={compact ? "8px" : "10px"}
        borderRadius="0 0 999px 999px"
        bg="#C58724"
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
