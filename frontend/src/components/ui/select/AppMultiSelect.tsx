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
import ReactSelect, { type GroupBase, type Props as ReactSelectProps } from "react-select";

import { getAppSelectStyles } from "./styles";
import type { AppSelectOption } from "./types";

type SelectOptionOrGroup<Option extends AppSelectOption> = Option | GroupBase<Option>;

type AppMultiSelectProps<Option extends AppSelectOption = AppSelectOption> = FormControlProps & {
  label?: string;
  helperText?: string;
  values: string[];
  options: readonly SelectOptionOrGroup<Option>[];
  onValueChange: (values: string[]) => void;
  placeholder?: string;
  noOptionsMessage?: string;
  loadingMessage?: string;
  error?: string;
  isClearable?: boolean;
  isLoading?: boolean;
  isSearchable?: boolean;
  closeMenuOnSelect?: boolean;
  menuPlacement?: ReactSelectProps<Option, true>["menuPlacement"];
  menuPosition?: ReactSelectProps<Option, true>["menuPosition"];
  menuPortalTarget?: HTMLElement | null;
  inputId?: string;
};

const isGroup = <Option extends AppSelectOption>(
  entry: SelectOptionOrGroup<Option>
): entry is GroupBase<Option> => "options" in entry;

function AppMultiSelectComponent<Option extends AppSelectOption = AppSelectOption>({
  label,
  helperText,
  values,
  options,
  onValueChange,
  placeholder = "Select options",
  noOptionsMessage = "No options found",
  loadingMessage = "Loading options...",
  error,
  isRequired,
  isDisabled,
  isClearable = true,
  isLoading,
  isSearchable = true,
  closeMenuOnSelect = false,
  menuPlacement = "auto",
  menuPosition,
  menuPortalTarget,
  inputId
}: AppMultiSelectProps<Option>) {
  const flatOptions = useMemo(
    () => options.flatMap((entry) => (isGroup(entry) ? entry.options : [entry])),
    [options]
  );

  const selectedOptions = useMemo(
    () => flatOptions.filter((entry) => values.includes(entry.value)),
    [flatOptions, values]
  );

  const portalTarget = useMemo(
    () => (menuPortalTarget === undefined ? (typeof document !== "undefined" ? document.body : null) : menuPortalTarget),
    [menuPortalTarget]
  );

  return (
    <FormControl isInvalid={Boolean(error)} isRequired={isRequired} isDisabled={isDisabled}>
      {label ? <FormLabel fontWeight={600}>{label}</FormLabel> : null}
      <ReactSelect<Option, true, GroupBase<Option>>
        inputId={inputId}
        value={selectedOptions}
        options={options}
        onChange={(next) => onValueChange(Array.from(new Set(next.map((entry) => entry.value))))}
        isOptionDisabled={(option) => Boolean(option.isDisabled)}
        isDisabled={isDisabled}
        isClearable={isClearable}
        isLoading={isLoading}
        isSearchable={isSearchable}
        closeMenuOnSelect={closeMenuOnSelect}
        hideSelectedOptions={false}
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
        styles={getAppSelectStyles<Option, true>({ hasError: Boolean(error) })}
        formatOptionLabel={(option) => (
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
        )}
      />
      {error ? <FormErrorMessage>{error}</FormErrorMessage> : null}
      {!error && helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
}

export const AppMultiSelect = memo(AppMultiSelectComponent) as typeof AppMultiSelectComponent;
