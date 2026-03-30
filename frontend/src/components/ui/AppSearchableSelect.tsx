import type { FormControlProps } from "@chakra-ui/react";

import { AppSelect } from "@/components/ui/select";
import type { AppSelectOption } from "@/components/ui/select";

export type AppSearchableSelectOption = AppSelectOption;

type AppSearchableSelectProps = FormControlProps & {
  label?: string;
  value: string;
  options: AppSearchableSelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  error?: string;
  helperText?: string;
  isClearable?: boolean;
  isLoading?: boolean;
};

export const AppSearchableSelect = ({
  label,
  value,
  options,
  onValueChange,
  placeholder = "Select option",
  searchPlaceholder,
  emptyText = "No options found",
  error,
  helperText,
  isRequired,
  isDisabled,
  isClearable = true,
  isLoading
}: AppSearchableSelectProps) => {
  const resolvedPlaceholder = value ? placeholder : searchPlaceholder || placeholder;

  return (
    <AppSelect
      label={label}
      value={value}
      options={options}
      onValueChange={onValueChange}
      placeholder={resolvedPlaceholder}
      noOptionsMessage={emptyText}
      error={error}
      helperText={helperText}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isClearable={isClearable}
      isLoading={isLoading}
    />
  );
};

