"use client";
import { Box, Text } from "@chakra-ui/react";

export function DataCell({ label, value, mono, dim, children }) {
  return (
    <Box>
      <Text
        fontSize="11px"
        fontWeight="600"
        color="var(--text-3)"
        textTransform="uppercase"
        letterSpacing="0.05em"
        mb="4px"
        lineHeight="1"
      >
        {label}
      </Text>
      <Text
        fontSize="14px"
        fontWeight="600"
        color={dim ? "var(--text-3)" : "var(--text)"}
        fontFamily={mono ? "var(--font-mono)" : undefined}
        fontSize={mono ? "13px" : "14px"}
        fontWeight={mono ? "500" : "600"}
        letterSpacing="-0.005em"
        lineHeight="1.3"
      >
        {value ?? children}
      </Text>
    </Box>
  );
}
