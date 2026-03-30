import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button
} from "@chakra-ui/react";
import { useRef, type ReactNode } from "react";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  children?: ReactNode;
};

export const ConfirmDialog = ({
  isOpen,
  title,
  description,
  onClose,
  onConfirm,
  isLoading,
  children
}: ConfirmDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
      closeOnOverlayClick={false}
      closeOnEsc={false}
    >
      <AlertDialogOverlay>
          <AlertDialogContent borderRadius="14px">
            <AlertDialogHeader>{title}</AlertDialogHeader>
          <AlertDialogBody>
            {description}
            {children ? <Box mt={3}>{children}</Box> : null}
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRef} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="accentRed" onClick={onConfirm} isLoading={isLoading}>
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
