import { Box, Text, VStack } from "@chakra-ui/react";

import { PosProvider } from "@/app/PosContext";
import { PosLoginPage } from "@/app/PosLoginPage";
import { StaffDesktopShell } from "@/app/StaffDesktopShell";
import { usePosAuth } from "@/app/PosAuthContext";

const BootLoader = () => (
  <VStack minH="100vh" justify="center" spacing={3} bg="linear-gradient(160deg, #FFF6E6 0%, #FFFDF9 48%, #FFFFFF 100%)">
    <Box w="42px" h="42px" borderRadius="full" border="4px solid rgba(197, 135, 36, 0.2)" borderTopColor="#C58724" />
    <Text color="#6D584E" fontWeight={600}>
      Restoring staff session...
    </Text>
  </VStack>
);

export const App = () => {
  const { session, isBootstrapping } = usePosAuth();

  if (isBootstrapping) {
    return <BootLoader />;
  }

  if (!session) {
    return <PosLoginPage />;
  }

  return (
    <PosProvider>
      <StaffDesktopShell />
    </PosProvider>
  );
};
