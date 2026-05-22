"use client";
import { Box, Flex, Text } from "@chakra-ui/react";

function Bar({ label, ready, total, color = "var(--success)" }) {
  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
  return (
    <Box>
      <Flex justify="space-between" align="center" mb="4px">
        <Text fontSize="11px" fontWeight="500" color="var(--text-3)">{label}</Text>
        <Text fontSize="11px" fontWeight="600" color="var(--text-2)">
          {ready}<Text as="span" fontWeight="400" color="var(--text-4)">/{total}</Text>
        </Text>
      </Flex>
      <Box h="5px" borderRadius="full" bg="var(--border-soft)" w="80px" overflow="hidden">
        <Box
          h="100%"
          borderRadius="full"
          bg={color}
          w={`${pct}%`}
          transition="width 0.3s ease"
        />
      </Box>
    </Box>
  );
}

export function ReadyBar({ items = [] }) {
  return (
    <Flex gap={4} flexWrap="wrap">
      {items.map((item) => (
        <Bar key={item.label} {...item} />
      ))}
    </Flex>
  );
}
