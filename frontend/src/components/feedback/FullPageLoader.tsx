import { Box, Center, Image, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

import logo from "@/assets/logo.png";

const pulse = keyframes`
  0% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 0.85; }
`;

type FullPageLoaderProps = {
  message?: string;
};

export const FullPageLoader = ({ message = "Loading Dip & Dash..." }: FullPageLoaderProps) => {
  return (
    <Center minH="100vh" className="soft-grid-bg">
      <Box textAlign="center" px={4}>
        <Image
          src={logo}
          alt="Dip & Dash"
          mx="auto"
          maxW={{ base: "220px", md: "320px" }}
          animation={`${pulse} 2s ease-in-out infinite`}
        />
        <Text mt={4} fontWeight={700} color="gray.700">
          {message}
        </Text>
      </Box>
    </Center>
  );
};
