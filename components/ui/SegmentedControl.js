"use client";
import { Box, Flex, Text } from "@chakra-ui/react";

export function SegmentedControl({ options = [], value, onChange, size = "sm" }) {
  const h = size === "sm" ? "30px" : "34px";
  const px = size === "sm" ? "12px" : "14px";
  const fs = size === "sm" ? "12px" : "13px";

  return (
    <Flex
      display="inline-flex"
      align="center"
      bg="var(--surface-2)"
      border="1px solid var(--border)"
      borderRadius="var(--r-md)"
      p="3px"
      gap="2px"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Flex
            key={opt.value}
            as="button"
            onClick={() => onChange?.(opt.value)}
            align="center"
            gap="5px"
            h={h}
            px={px}
            borderRadius="var(--r-sm)"
            fontSize={fs}
            fontWeight={active ? "600" : "500"}
            color={active ? "var(--text)" : "var(--text-3)"}
            bg={active ? "var(--surface)" : "transparent"}
            boxShadow={active ? "var(--shadow-xs)" : "none"}
            border={active ? "1px solid var(--border)" : "1px solid transparent"}
            transition="all 0.1s"
            cursor="pointer"
            _hover={{ color: active ? undefined : "var(--text-2)" }}
            whiteSpace="nowrap"
          >
            {opt.icon && (
              <Box as="span" display="inline-flex" flexShrink={0} opacity={active ? 1 : 0.7}>
                {opt.icon}
              </Box>
            )}
            {opt.label}
          </Flex>
        );
      })}
    </Flex>
  );
}
