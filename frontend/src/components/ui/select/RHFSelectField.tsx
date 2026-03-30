import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import type { GroupBase } from "react-select";

import { AppMultiSelect } from "./AppMultiSelect";
import { AppSelect } from "./AppSelect";
import type { AppSelectOption } from "./types";

type SelectOptionOrGroup<Option extends AppSelectOption> = Option | GroupBase<Option>;

type RHFSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  Option extends AppSelectOption = AppSelectOption
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  helperText?: string;
  options: readonly SelectOptionOrGroup<Option>[];
  placeholder?: string;
  noOptionsMessage?: string;
  loadingMessage?: string;
  isClearable?: boolean;
  isLoading?: boolean;
  isSearchable?: boolean;
  isDisabled?: boolean;
};

export const RHFSelectField = <
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  Option extends AppSelectOption = AppSelectOption
>({
  control,
  name,
  label,
  helperText,
  options,
  placeholder,
  noOptionsMessage,
  loadingMessage,
  isClearable,
  isLoading,
  isSearchable,
  isDisabled
}: RHFSelectFieldProps<TFieldValues, TName, Option>) => {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppSelect<Option>
          label={label}
          helperText={helperText}
          value={(field.value ?? "") as string}
          options={options}
          onValueChange={field.onChange}
          placeholder={placeholder}
          noOptionsMessage={noOptionsMessage}
          loadingMessage={loadingMessage}
          isClearable={isClearable}
          isLoading={isLoading}
          isSearchable={isSearchable}
          isDisabled={isDisabled}
          error={fieldState.error?.message}
        />
      )}
    />
  );
};

type RHFMultiSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  Option extends AppSelectOption = AppSelectOption
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  helperText?: string;
  options: readonly SelectOptionOrGroup<Option>[];
  placeholder?: string;
  noOptionsMessage?: string;
  loadingMessage?: string;
  isClearable?: boolean;
  isLoading?: boolean;
  isSearchable?: boolean;
  isDisabled?: boolean;
};

export const RHFMultiSelectField = <
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  Option extends AppSelectOption = AppSelectOption
>({
  control,
  name,
  label,
  helperText,
  options,
  placeholder,
  noOptionsMessage,
  loadingMessage,
  isClearable,
  isLoading,
  isSearchable,
  isDisabled
}: RHFMultiSelectFieldProps<TFieldValues, TName, Option>) => {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppMultiSelect<Option>
          label={label}
          helperText={helperText}
          values={(field.value ?? []) as string[]}
          options={options}
          onValueChange={field.onChange}
          placeholder={placeholder}
          noOptionsMessage={noOptionsMessage}
          loadingMessage={loadingMessage}
          isClearable={isClearable}
          isLoading={isLoading}
          isSearchable={isSearchable}
          isDisabled={isDisabled}
          error={fieldState.error?.message}
        />
      )}
    />
  );
};

