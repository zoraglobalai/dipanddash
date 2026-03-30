import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

import { designTokens } from "./tokens";

const config: ThemeConfig = {
  initialColorMode: "light",
  useSystemColorMode: false
};

export const chakraTheme = extendTheme({
  config,
  styles: {
    global: {
      body: {
        bg: "#FFFCF8",
        color: designTokens.colors.text
      }
    }
  },
  fonts: {
    heading: "Sora, sans-serif",
    body: "Manrope, sans-serif"
  },
  colors: {
    brand: {
      50: "#FFF8E7",
      100: "#FFECC2",
      200: "#FFE08A",
      300: "#F6C960",
      400: "#DAA438",
      500: "#BC8527",
      600: "#95661D",
      700: "#6F4B15",
      800: "#4B320D",
      900: "#2D1D07"
    },
    accentRed: {
      50: "#FFE8E8",
      100: "#FFC8C8",
      200: "#FF9E9E",
      300: "#EB6F6F",
      400: "#D44747",
      500: "#C10E0E",
      600: "#A80B0B",
      700: "#8E0909",
      800: "#690606",
      900: "#430404"
    }
  },
  components: {
    Button: {
      baseStyle: {
        borderRadius: designTokens.radius.control,
        fontWeight: 700,
        _focusVisible: {
          boxShadow: "0 0 0 3px rgba(142, 9, 9, 0.22)"
        }
      },
      variants: {
        outline: {
          borderColor: "rgba(142, 9, 9, 0.2)",
          color: "#4B3026",
          bg: "white",
          _hover: {
            bg: "rgba(218, 164, 56, 0.12)"
          }
        },
        ghost: {
          color: "#4B3026",
          _hover: {
            bg: "rgba(193, 14, 14, 0.08)"
          }
        }
      }
    },
    Card: {
      baseStyle: {
        container: {
          borderRadius: designTokens.radius.card,
          boxShadow: designTokens.shadows.card
        }
      }
    },
    Input: {
      baseStyle: {
        field: {
          borderRadius: designTokens.radius.control,
          bg: "white",
          borderColor: "rgba(142, 9, 9, 0.16)",
          _hover: {
            borderColor: "rgba(142, 9, 9, 0.28)"
          }
        }
      }
    },
    Table: {
      variants: {
        simple: {
          th: {
            borderColor: "rgba(133, 78, 48, 0.12)"
          },
          td: {
            borderColor: "rgba(133, 78, 48, 0.12)"
          }
        }
      }
    }
  }
});
