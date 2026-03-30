import {
  FormControl,
  FormErrorMessage,
  FormLabel,
  Select,
  type FormControlProps,
  type SelectProps
} from "@chakra-ui/react";
import { forwardRef } from "react";

type Option = {
  label: string;
  value: string;
};

type AppSelectProps = SelectProps &
  FormControlProps & {
    label?: string;
    error?: string;
    options: Option[];
  };

export const AppSelect = forwardRef<HTMLSelectElement, AppSelectProps>(
  ({ label, error, options, isRequired, ...props }, ref) => {
    return (
      <FormControl isInvalid={Boolean(error)} isRequired={isRequired}>
        {label ? <FormLabel fontWeight={600}>{label}</FormLabel> : null}
        <Select ref={ref} borderColor="gray.200" focusBorderColor="brand.400" {...props}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {error ? <FormErrorMessage>{error}</FormErrorMessage> : null}
      </FormControl>
    );
  }
);

AppSelect.displayName = "AppSelect";
