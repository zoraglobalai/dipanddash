import type { GroupBase } from "react-select";

export type AppSelectOption<TMeta = unknown> = {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  isDisabled?: boolean;
  meta?: TMeta;
};

export type AppSelectGroup<TMeta = unknown> = GroupBase<AppSelectOption<TMeta>>;

