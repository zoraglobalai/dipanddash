import type { CSSObjectWithLabel, GroupBase, StylesConfig } from "react-select";

import { designTokens } from "@/theme/tokens";

import type { AppSelectOption } from "./types";

const selectColors = {
  text: "#2A1B16",
  mutedText: "#97A0AF",
  border: "rgba(193, 14, 14, 0.18)",
  borderHover: "rgba(193, 14, 14, 0.34)",
  borderFocus: "#DAA438",
  borderError: "#FC8181",
  menuBorder: "rgba(133, 78, 48, 0.22)",
  optionHover: "rgba(218, 164, 56, 0.14)",
  optionSelected: "rgba(218, 164, 56, 0.22)",
  optionActive: "rgba(218, 164, 56, 0.3)",
  chipBg: "rgba(193, 14, 14, 0.1)",
  chipText: "#6F4B15"
};

type StyleArgs = {
  hasError?: boolean;
  menuZIndex?: number;
};

const inputBorderColor = (hasError?: boolean) => (hasError ? selectColors.borderError : selectColors.border);
const inputHoverBorderColor = (hasError?: boolean) =>
  hasError ? selectColors.borderError : selectColors.borderHover;

const baseControlStyle = (hasError?: boolean): CSSObjectWithLabel => ({
  minHeight: 50,
  borderRadius: designTokens.radius.control,
  borderColor: inputBorderColor(hasError),
  background: "#FFFFFF",
  boxShadow: "none",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
  "&:hover": {
    borderColor: inputHoverBorderColor(hasError)
  }
});

export const getAppSelectStyles = <
  Option extends AppSelectOption = AppSelectOption,
  IsMulti extends boolean = false
>(
  args: StyleArgs = {}
): StylesConfig<Option, IsMulti, GroupBase<Option>> => {
  const { hasError, menuZIndex = 2000 } = args;

  return {
    control: (base, state) => ({
      ...base,
      ...baseControlStyle(hasError),
      borderColor: state.isFocused
        ? hasError
          ? selectColors.borderError
          : selectColors.borderFocus
        : inputBorderColor(hasError),
      boxShadow: state.isFocused
        ? hasError
          ? `0 0 0 1px ${selectColors.borderError}`
          : `0 0 0 1px ${selectColors.borderFocus}`
        : "none",
      cursor: state.isDisabled ? "not-allowed" : "text",
      opacity: state.isDisabled ? 0.72 : 1
    }),
    valueContainer: (base) => ({
      ...base,
      padding: "0 12px",
      gap: 6
    }),
    input: (base) => ({
      ...base,
      color: selectColors.text,
      margin: 0,
      padding: 0
    }),
    placeholder: (base) => ({
      ...base,
      color: selectColors.mutedText
    }),
    singleValue: (base) => ({
      ...base,
      color: selectColors.text
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: menuZIndex
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 12,
      border: `1px solid ${selectColors.menuBorder}`,
      boxShadow: "0 16px 30px rgba(43, 16, 7, 0.14)",
      overflow: "hidden",
      zIndex: menuZIndex
    }),
    menuList: (base) => ({
      ...base,
      paddingTop: 6,
      paddingBottom: 6
    }),
    groupHeading: (base) => ({
      ...base,
      color: "#725D53",
      fontSize: 12,
      fontWeight: 700,
      textTransform: "none",
      paddingLeft: 10,
      paddingRight: 10
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? selectColors.optionSelected
        : state.isFocused
          ? selectColors.optionHover
          : "transparent",
      color: selectColors.text,
      cursor: state.isDisabled ? "not-allowed" : "pointer",
      opacity: state.isDisabled ? 0.6 : 1,
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: 12,
      paddingRight: 12,
      ":active": {
        backgroundColor: selectColors.optionActive
      }
    }),
    multiValue: (base) => ({
      ...base,
      background: selectColors.chipBg,
      borderRadius: 999
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: selectColors.chipText,
      fontWeight: 700,
      fontSize: 12,
      paddingLeft: 8
    }),
    multiValueRemove: (base) => ({
      ...base,
      borderRadius: 999,
      color: selectColors.chipText,
      ":hover": {
        background: "rgba(193, 14, 14, 0.16)",
        color: "#8E0909"
      }
    }),
    clearIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? "#8E0909" : "#7D655B",
      ":hover": {
        color: "#8E0909"
      }
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? "#8E0909" : "#7D655B",
      ":hover": {
        color: "#8E0909"
      }
    }),
    indicatorSeparator: () => ({
      display: "none"
    }),
    loadingIndicator: (base) => ({
      ...base,
      color: "#8E0909"
    }),
    noOptionsMessage: (base) => ({
      ...base,
      color: "#7D655B",
      fontSize: 13
    }),
    loadingMessage: (base) => ({
      ...base,
      color: "#7D655B",
      fontSize: 13
    })
  };
};

