import { Button, type ButtonProps } from "@chakra-ui/react";
import { memo } from "react";

type AppButtonProps = ButtonProps & {
  loadingText?: string;
};

export const AppButton = memo(({ children, loadingText, ...props }: AppButtonProps) => {
  return (
    <Button
      colorScheme={props.colorScheme ?? "brand"}
      _hover={{ transform: "translateY(-1px)" }}
      _active={{ transform: "translateY(0)" }}
      transition="all 0.2s ease"
      loadingText={loadingText}
      {...props}
    >
      {children}
    </Button>
  );
});

AppButton.displayName = "AppButton";

