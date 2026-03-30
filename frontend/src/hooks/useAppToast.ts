import { useToast } from "@chakra-ui/react";
import { useCallback, useMemo } from "react";

type ToastVariant = "success" | "error" | "warning" | "info";

export const useAppToast = () => {
  const toast = useToast();

  const showToast = useCallback(
    (title: string, variant: ToastVariant, description?: string) => {
      toast({
        title,
        description,
        status: variant,
        position: "top-right",
        duration: 3000,
        isClosable: true,
        variant: "subtle"
      });
    },
    [toast]
  );

  const success = useCallback(
    (title: string, description?: string) => showToast(title, "success", description),
    [showToast]
  );
  const error = useCallback(
    (title: string, description?: string) => showToast(title, "error", description),
    [showToast]
  );
  const info = useCallback(
    (title: string, description?: string) => showToast(title, "info", description),
    [showToast]
  );
  const warning = useCallback(
    (title: string, description?: string) => showToast(title, "warning", description),
    [showToast]
  );

  return useMemo(
    () => ({
      success,
      error,
      info,
      warning
    }),
    [success, error, info, warning]
  );
};
