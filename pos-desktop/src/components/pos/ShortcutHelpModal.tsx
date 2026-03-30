import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Button,
  HStack,
  Text,
  VStack
} from "@chakra-ui/react";

const SHORTCUTS = [
  { key: "Ctrl + N", action: "New Order" },
  { key: "Ctrl + F", action: "Focus item search" },
  { key: "Ctrl + B", action: "Open customer modal" },
  { key: "Ctrl + 1", action: "Set order type: Takeaway" },
  { key: "Ctrl + 2", action: "Set order type: Dine In" },
  { key: "Ctrl + 3", action: "Set order type: Delivery" },
  { key: "Ctrl + P", action: "Open payment" },
  { key: "Ctrl + S", action: "Save pending" },
  { key: "Ctrl + O", action: "Open pending bills" },
  { key: "Esc", action: "Close modal/panel" }
];

type ShortcutHelpModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const ShortcutHelpModal = ({ isOpen, onClose }: ShortcutHelpModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Keyboard Shortcuts</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={2}>
            {SHORTCUTS.map((entry) => (
              <HStack
                key={entry.key}
                justify="space-between"
                p={2}
                borderRadius="10px"
                bg="rgba(241, 236, 229, 0.6)"
              >
                <Text fontWeight={700}>{entry.key}</Text>
                <Text>{entry.action}</Text>
              </HStack>
            ))}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
