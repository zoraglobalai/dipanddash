import {
  Box,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Text,
  type FormControlProps
} from "@chakra-ui/react";
import { memo, useMemo } from "react";
import ReactSelect, { components, type GroupBase, type Props as ReactSelectProps } from "react-select";

import { getAppSelectStyles } from "./styles";
import type { AppSelectOption } from "./types";

type SelectOptionOrGroup<Option extends AppSelectOption> = Option | GroupBase<Option>;

type AppSelectProps<Option extends AppSelectOption = AppSelectOption> = FormControlProps & {
  label?: string;
  helperText?: string;
  value: string;
  options: readonly SelectOptionOrGroup<Option>[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  noOptionsMessage?: string;
  loadingMessage?: string;
  error?: string;
  isClearable?: boolean;
  isLoading?: boolean;
  isSearchable?: boolean;
  menuPlacement?: ReactSelectProps<Option, false>["menuPlacement"];
  menuPosition?: ReactSelectProps<Option, false>["menuPosition"];
  menuPortalTarget?: HTMLElement | null;
  inputId?: string;
};

const isGroup = <Option extends AppSelectOption>(
  entry: SelectOptionOrGroup<Option>
): entry is GroupBase<Option> => "options" in entry;

const OptionContent = <Option extends AppSelectOption>(option: Option) => (
  <Box>
    <Text lineHeight="short" fontWeight={600} color="#2A1B16">
      {option.label}
    </Text>
    {option.description ? (
      <Text mt={0.5} fontSize="xs" color="#7D655B" lineHeight="short">
        {option.description}
      </Text>
    ) : null}
  </Box>
);

function AppSelectComponent<Option extends AppSelectOption = AppSelectOption>({
  label,
  helperText,
  value,
  options,
  onValueChange,
  placeholder = "Select option",
  noOptionsMessage = "No options found",
  loadingMessage = "Loading options...",
  error,
  isRequired,
  isDisabled,
  isClearable = true,
  isLoading,
  isSearchable = true,
  menuPlacement = "auto",
  menuPosition,
  menuPortalTarget,
  inputId
}: AppSelectProps<Option>) {
  const flatOptions = useMemo(
    () => options.flatMap((entry) => (isGroup(entry) ? entry.options : [entry])),
    [options]
  );

  const selectedOption = useMemo(
    () => flatOptions.find((entry) => entry.value === value) ?? null,
    [flatOptions, value]
  );

  const portalTarget = useMemo(
    () => (menuPortalTarget === undefined ? (typeof document !== "undefined" ? document.body : null) : menuPortalTarget),
    [menuPortalTarget]
  );

  return (
    <FormControl isInvalid={Boolean(error)} isRequired={isRequired} isDisabled={isDisabled}>
      {label ? <FormLabel fontWeight={600}>{label}</FormLabel> : null}
      <ReactSelect<Option, false, GroupBase<Option>>
        inputId={inputId}
        value={selectedOption}
        options={options}
        onChange={(next) => onValueChange(next?.value ?? "")}
        isOptionDisabled={(option) => Boolean(option.isDisabled)}
        isDisabled={isDisabled}
        isClearable={isClearable}
        isLoading={isLoading}
        isSearchable={isSearchable}
        placeholder={placeholder}
        noOptionsMessage={() => noOptionsMessage}
        loadingMessage={() => loadingMessage}
        menuPortalTarget={portalTarget ?? undefined}
        menuPosition={menuPosition ?? (portalTarget ? "fixed" : "absolute")}
        menuPlacement={menuPlacement}
        openMenuOnFocus
        blurInputOnSelect={false}
        filterOption={(candidate, inputValue) => {
          const search = inputValue.trim().toLowerCase();
          if (!search) {
            return true;
          }

          const source = `${candidate.data.label} ${candidate.data.value} ${candidate.data.description ?? ""} ${candidate.data.searchText ?? ""}`.toLowerCase();
          return source.includes(search);
        }}
        components={{
          IndicatorSeparator: () => null,
          DropdownIndicator: components.DropdownIndicator
        }}
        styles={getAppSelectStyles<Option>({ hasError: Boolean(error) })}
        formatOptionLabel={(option) => OptionContent(option)}
      />
      {error ? <FormErrorMessage>{error}</FormErrorMessage> : null}
      {!error && helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
}

export const AppSelect = memo(AppSelectComponent) as typeof AppSelectComponent;
