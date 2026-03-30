import {
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  type FormControlProps,
  type InputProps
} from "@chakra-ui/react";
import { forwardRef } from "react";

type AppInputProps = InputProps &
  FormControlProps & {
    label?: string;
    error?: string;
  };

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  ({ label, error, isRequired, ...props }, ref) => {
    return (
      <FormControl isInvalid={Boolean(error)} isRequired={isRequired}>
        {label ? <FormLabel fontWeight={600}>{label}</FormLabel> : null}
        <Input
          ref={ref}
          bg="white"
          borderColor="rgba(193, 14, 14, 0.18)"
          focusBorderColor="brand.400"
          _hover={{ borderColor: "rgba(193, 14, 14, 0.34)" }}
          {...props}
        />
        {error ? <FormErrorMessage>{error}</FormErrorMessage> : null}
      </FormControl>
    );
  }
);

AppInput.displayName = "AppInput";
