"use client";
import { Box, Flex, Text, Heading } from "@chakra-ui/react";

export function PageHeader({ eyebrow, title, subtitle, actions, mb = 6 }) {
  return (
    <Flex align="flex-end" justify="space-between" gap={4} mb={mb} flexWrap="wrap">
      <Box>
        {eyebrow && (
          <Text fontSize="12px" fontWeight="500" color="var(--text-3)" letterSpacing="0.01em" mb="4px">
            {eyebrow}
          </Text>
        )}
        <Heading
          as="h1"
          fontSize="28px"
          fontWeight="600"
          letterSpacing="-0.02em"
          color="var(--text)"
          lineHeight="1.15"
        >
          {title}
        </Heading>
        {subtitle && (
          <Text fontSize="14px" color="var(--text-2)" mt="4px">
            {subtitle}
          </Text>
        )}
      </Box>
      {actions && (
        <Flex align="center" gap={2} flexShrink={0} flexWrap="wrap">
          {actions}
        </Flex>
      )}
    </Flex>
  );
}
