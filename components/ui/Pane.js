"use client";
import { Box, Flex, Text } from "@chakra-ui/react";

export function Pane({ title, icon, badge, actions, children, px = 5, py = "14px", bodyPx = 5, bodyPy = 5, noPad = false }) {
  return (
    <Box bg="var(--surface)" border="1px solid var(--border)" borderRadius="var(--r-lg)" boxShadow="var(--shadow-sm)">
      {(title || badge || actions) && (
        <Flex
          align="center"
          justify="space-between"
          gap={3}
          px={px}
          py={py}
          borderBottom="1px solid var(--border-soft)"
          minH="48px"
        >
          <Text
            fontSize="13px"
            fontWeight="600"
            color="var(--text)"
            display="inline-flex"
            alignItems="center"
            gap="8px"
            lineHeight="1"
          >
            {icon && <Box as="span" color="var(--text-3)" display="inline-flex" flexShrink={0}>{icon}</Box>}
            {title}
          </Text>
          <Flex align="center" gap={2} flexShrink={0}>
            {badge}
            {actions}
          </Flex>
        </Flex>
      )}
      <Box px={noPad ? 0 : bodyPx} py={noPad ? 0 : bodyPy}>
        {children}
      </Box>
    </Box>
  );
}
