import {
  Box,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Text,
  type FormControlProps
} from "@chakra-ui/react";
import { memo, useEffect, useMemo, useRef } from "react";
import AsyncSelect from "react-select/async";
import type { GroupBase, OptionsOrGroups } from "react-select";

import { getAppSelectStyles } from "./styles";
import type { AppSelectOption } from "./types";

type AppAsyncSelectProps<Option extends AppSelectOption = AppSelectOption> = FormControlProps & {
  label?: string;
  helperText?: string;
  value: string;
  selectedOption?: Option | null;
  onValueChange: (value: string) => void;
  loadOptions: (inputValue: string) => Promise<OptionsOrGroups<Option, GroupBase<Option>>>;
  defaultOptions?: OptionsOrGroups<Option, GroupBase<Option>> | boolean;
  placeholder?: string;
  noOptionsMessage?: string;
  loadingMessage?: string;
  error?: string;
  isClearable?: boolean;
  isLoading?: boolean;
  isSearchable?: boolean;
  debounceMs?: number;
  menuPortalTarget?: HTMLElement | null;
  inputId?: string;
};

function AppAsyncSelectComponent<Option extends AppSelectOption = AppSelectOption>({
  label,
  helperText,
  value,
  selectedOption,
  onValueChange,
  loadOptions,
  defaultOptions = true,
  placeholder = "Search and select option",
  noOptionsMessage = "No options found",
  loadingMessage = "Loading options...",
  error,
  isRequired,
  isDisabled,
  isClearable = true,
  isLoading,
  isSearchable = true,
  debounceMs = 300,
  menuPortalTarget,
  inputId
}: AppAsyncSelectProps<Option>) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const portalTarget = useMemo(
    () => menuPortalTarget ?? (typeof document !== "undefined" ? document.body : null),
    [menuPortalTarget]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const debouncedLoader = useMemo(
    () => (inputValue: string) =>
      new Promise<OptionsOrGroups<Option, GroupBase<Option>>>((resolve) => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(async () => {
          try {
            const result = await loadOptions(inputValue);
            resolve(result);
          } catch {
            resolve([]);
          }
        }, debounceMs);
      }),
    [debounceMs, loadOptions]
  );

  return (
    <FormControl isInvalid={Boolean(error)} isRequired={isRequired} isDisabled={isDisabled}>
      {label ? <FormLabel fontWeight={600}>{label}</FormLabel> : null}
      <AsyncSelect<Option, false, GroupBase<Option>>
        inputId={inputId}
        cacheOptions
        defaultOptions={defaultOptions}
        loadOptions={debouncedLoader}
        value={selectedOption ?? (value ? ({ value, label: value } as Option) : null)}
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
        menuPosition={portalTarget ? "fixed" : "absolute"}
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
        styles={getAppSelectStyles<Option>({ hasError: Boolean(error) })}
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

export const AppAsyncSelect = memo(AppAsyncSelectComponent) as typeof AppAsyncSelectComponent;
