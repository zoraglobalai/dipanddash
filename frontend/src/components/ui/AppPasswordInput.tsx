import {
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  type InputProps
} from "@chakra-ui/react";
import { forwardRef, useState, type ChangeEvent, type FocusEvent } from "react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { ActionIconButton } from "@/components/ui/ActionIconButton";

type AppPasswordInputProps = InputProps & {
  label?: string;
  placeholder?: string;
  error?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
};

export const AppPasswordInput = forwardRef<HTMLInputElement, AppPasswordInputProps>(
  ({ label = "Password", placeholder = "Enter password", error, ...props }, ref) => {
    const [show, setShow] = useState(false);

    return (
      <FormControl isInvalid={Boolean(error)} isRequired={props.isRequired}>
        {label ? <FormLabel fontWeight={600}>{label}</FormLabel> : null}
        <InputGroup>
          <Input
            ref={ref}
            type={show ? "text" : "password"}
            placeholder={placeholder}
            bg="white"
            borderColor="rgba(193, 14, 14, 0.18)"
            focusBorderColor="brand.400"
            _hover={{ borderColor: "rgba(193, 14, 14, 0.34)" }}
            {...props}
          />
          <InputRightElement>
            <ActionIconButton
              aria-label={show ? "Hide password" : "Show password"}
              icon={show ? <ViewOffIcon /> : <ViewIcon />}
              size="sm"
              variant="ghost"
              color="accentRed.600"
              _hover={{ bg: "rgba(193, 14, 14, 0.08)" }}
              onClick={() => setShow((current) => !current)}
            />
          </InputRightElement>
        </InputGroup>
        {error ? <FormErrorMessage>{error}</FormErrorMessage> : null}
      </FormControl>
    );
  }
);

AppPasswordInput.displayName = "AppPasswordInput";
