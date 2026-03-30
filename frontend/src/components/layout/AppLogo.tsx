import { Box, HStack, Image, Text } from "@chakra-ui/react";

import logo from "@/assets/logo.png";

type AppLogoProps = {
  compact?: boolean;
  hideText?: boolean;
  roleLabel?: string;
};

export const AppLogo = ({ compact, hideText = false, roleLabel = "Admin" }: AppLogoProps) => {
  if (compact) {
    return <Image src={logo} alt="Dip & Dash" h="40px" objectFit="contain" />;
  }

  if (hideText) {
    return <Image src={logo} alt="Dip & Dash" h="40px" objectFit="contain" mx="auto" />;
  }

  return (
    <HStack spacing={3} align="center">
      <Image src={logo} alt="Dip & Dash" h="44px" objectFit="contain" />
      <Box display="flex" flexDirection="column" justifyContent="center" lineHeight={1}>
        <Text fontWeight={800} fontFamily="heading" letterSpacing="0.2px" color="#2B1914">
          Dip & Dash
        </Text>
        <Text fontWeight={700} fontSize="xs" color="#7B6157" letterSpacing="0.25px">
          {roleLabel}
        </Text>
      </Box>
    </HStack>
  );
};
