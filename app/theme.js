// app/theme.js
import { extendTheme, theme as base } from "@chakra-ui/react";

const customTheme = extendTheme({
  colors: {
    brand: {
      50: "#e6fffa",
      100: "#b2f5ea",
      200: "#81e6d9",
      300: "#4fd1c5",
      400: "#38b2ac",
      500: "#319795",      // primary teal
      600: "#2c7a7b",
      700: "#285e61",
      800: "#234e52",
      900: "#1d4044",
    },
    // alias for Purity UI-like accent colors
    success: base.colors.green,
    info: base.colors.teal,
  },
  fonts: {
    heading: `"Poppins", ${base.fonts.heading}`,
    body: `"Open Sans", ${base.fonts.body}`,
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: "semibold",
      },
      variants: {
        solid: (props) => ({
          bg: props.colorScheme === "brand" ? "brand.500" : undefined,
          color: "white",
          _hover: {
            bg: props.colorScheme === "brand" ? "brand.600" : undefined,
            opacity: 0.95,
          },
        }),
      },
      defaultProps: {
        colorScheme: "brand",
      },
    },
    // You can extend Input, Badge, etc. here for further branding!
  },
  styles: {
    global: {
      body: {
        bg: "#f8f9fa",      // light gray background, typical for dashboards
        color: "#2c7a7b",   // deep teal for text
      },
    },
  },
});

export default customTheme;
