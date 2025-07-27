"use client";

import { ChakraProvider } from "@chakra-ui/react";
import customTheme from "./theme"; // adjust the path if your theme.js is elsewhere

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ChakraProvider theme={customTheme}>
          {children}
        </ChakraProvider>
      </body>
    </html>
  );
}
