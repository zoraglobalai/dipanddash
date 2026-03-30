import { useCallback, useState } from "react";

type UseModalCloseGuardResult = {
  isCloseConfirmOpen: boolean;
  requestClose: () => void;
  cancelCloseRequest: () => void;
  confirmClose: () => void;
};

export const useModalCloseGuard = (onClose: () => void): UseModalCloseGuardResult => {
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);

  const requestClose = useCallback(() => {
    setIsCloseConfirmOpen(true);
  }, []);

  const cancelCloseRequest = useCallback(() => {
    setIsCloseConfirmOpen(false);
  }, []);

  const confirmClose = useCallback(() => {
    setIsCloseConfirmOpen(false);
    onClose();
  }, [onClose]);

  return {
    isCloseConfirmOpen,
    requestClose,
    cancelCloseRequest,
    confirmClose
  };
};

