import { extendTheme } from "@chakra-ui/react";

export const posTheme = extendTheme({
  colors: {
    brand: {
      50: "#FFF5E6",
      100: "#FFE8C1",
      200: "#F7D08D",
      300: "#E9B96A",
      400: "#D9A048",
      500: "#C58724",
      600: "#A56E1D",
      700: "#7E5216",
      800: "#5B3A0F",
      900: "#3A2309"
    }
  },
  styles: {
    global: {
      "html, body, #root": {
        width: "100%",
        height: "100%"
      },
      body: {
        color: "#2A1A14",
        bg: "#FFFDF9"
      }
    }
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: "brand"
      },
      baseStyle: {
        borderRadius: "12px",
        fontWeight: 700
      }
    },
    Input: {
      defaultProps: {
        focusBorderColor: "brand.500"
      }
    },
    Select: {
      defaultProps: {
        focusBorderColor: "brand.500"
      }
    }
  }
});

