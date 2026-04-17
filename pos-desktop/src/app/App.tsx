import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack
} from "@chakra-ui/react";

import { PosProvider } from "@/app/PosContext";
import { PosLoginPage } from "@/app/PosLoginPage";
import { StaffDesktopShell } from "@/app/StaffDesktopShell";
import { usePosAuth } from "@/app/PosAuthContext";
import { checkForDesktopUpdates, type UpdateConfirmInput } from "@/lib/updater";

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
  const [updateConfirm, setUpdateConfirm] = useState<(UpdateConfirmInput & { resolve: (confirmed: boolean) => void }) | null>(null);

  const requestUpdateConfirmation = useCallback(
    (input: UpdateConfirmInput) =>
      new Promise<boolean>((resolve) => {
        setUpdateConfirm({ ...input, resolve });
      }),
    []
  );

  const handleUpdateConfirmClose = useCallback((confirmed: boolean) => {
    setUpdateConfirm((previous) => {
      if (!previous) {
        return previous;
      }
      previous.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    void checkForDesktopUpdates(requestUpdateConfirmation);
  }, [requestUpdateConfirmation]);

  let content = null;
  if (isBootstrapping) {
    content = <BootLoader />;
  } else if (!session) {
    content = <PosLoginPage />;
  } else {
    content = (
      <PosProvider>
        <StaffDesktopShell />
      </PosProvider>
    );
  }

  return (
    <>
      {content}
      <Modal isOpen={Boolean(updateConfirm)} onClose={() => handleUpdateConfirmClose(false)} isCentered closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{updateConfirm?.title ?? "Confirmation"}</ModalHeader>
          <ModalBody>
            <Text color="#6D584E">{updateConfirm?.description}</Text>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="outline" onClick={() => handleUpdateConfirmClose(false)}>
                {updateConfirm?.cancelLabel ?? "Cancel"}
              </Button>
              <Button onClick={() => handleUpdateConfirmClose(true)}>{updateConfirm?.confirmLabel ?? "Confirm"}</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};
